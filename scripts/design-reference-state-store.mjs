import { approveDesignReferenceCandidate } from "../src/domain/design-reference-candidate.js";
import { createReferenceEntity } from "../src/state/factories.js";
import { rebuildLegacyMirror } from "./app-state-legacy-mirror.mjs";
import { ensureStateSchema } from "./state-schema.mjs";
import { loadLegacyState, loadNormalizedState } from "./state-relational-store.mjs";

export class DesignReferencePersistenceError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "DesignReferencePersistenceError";
    this.status = status;
  }
}

export async function createDesignReferenceForState(query, appStateKey, projectId, payload) {
  await ensureStateSchema(query);
  const project = await loadProjectDesignState(query, appStateKey, projectId);
  const reference = createReferenceEntity(payload);
  await saveProjectDesignState(query, appStateKey, projectId, {
    references: prependById(project.references, reference),
    candidates: project.designReferenceCandidates
  });
  await selectReference(query, appStateKey, projectId, reference.id);
  return buildResult(query, appStateKey, projectId, { reference });
}

export async function updateDesignReferenceForState(query, appStateKey, projectId, referenceId, patch) {
  await ensureStateSchema(query);
  const project = await loadProjectDesignState(query, appStateKey, projectId);
  let reference = null;
  const references = project.references.map((item) => {
    if (item?.id !== referenceId) return item;
    reference = createReferenceEntity({ ...item, ...asObject(patch), id: referenceId });
    return reference;
  });
  if (!reference) throw new DesignReferencePersistenceError("Design reference not found", 404);
  await saveProjectDesignState(query, appStateKey, projectId, { references, candidates: project.designReferenceCandidates });
  await selectReference(query, appStateKey, projectId, reference.id);
  return buildResult(query, appStateKey, projectId, { reference });
}

export async function deleteDesignReferenceForState(query, appStateKey, projectId, referenceId) {
  await ensureStateSchema(query);
  const project = await loadProjectDesignState(query, appStateKey, projectId);
  const references = project.references.filter((item) => item?.id !== referenceId);
  if (references.length === project.references.length) throw new DesignReferencePersistenceError("Design reference not found", 404);
  if (!references.length) return buildResult(query, appStateKey, projectId, { deletedReferenceId: "" });
  await saveProjectDesignState(query, appStateKey, projectId, { references, candidates: project.designReferenceCandidates });
  await selectReferenceAfterDelete(query, appStateKey, projectId, referenceId, references[0]?.id || "");
  return buildResult(query, appStateKey, projectId, { deletedReferenceId: referenceId });
}

export async function approveDesignReferenceCandidateForState(query, appStateKey, projectId, candidateId) {
  await ensureStateSchema(query);
  const project = await loadProjectDesignState(query, appStateKey, projectId);
  const candidate = project.designReferenceCandidates.find((item) => item?.id === candidateId);
  if (!candidate) throw new DesignReferencePersistenceError("Design reference candidate not found", 404);
  if (!candidate.imageData) throw new DesignReferencePersistenceError("Design reference candidate has no image", 400);
  const reference = approveDesignReferenceCandidate(candidate);
  const candidates = project.designReferenceCandidates.filter((item) => item?.id !== candidateId);
  await saveProjectDesignState(query, appStateKey, projectId, {
    references: prependById(project.references, reference),
    candidates
  });
  await selectReference(query, appStateKey, projectId, reference.id);
  return buildResult(query, appStateKey, projectId, { reference, deletedCandidateId: candidateId });
}

export async function rejectDesignReferenceCandidateForState(query, appStateKey, projectId, candidateId) {
  await ensureStateSchema(query);
  const project = await loadProjectDesignState(query, appStateKey, projectId);
  if (!project.designReferenceCandidates.some((item) => item?.id === candidateId)) {
    throw new DesignReferencePersistenceError("Design reference candidate not found", 404);
  }
  const candidates = project.designReferenceCandidates.filter((item) => item?.id !== candidateId);
  await saveProjectDesignState(query, appStateKey, projectId, { references: project.references, candidates });
  return buildResult(query, appStateKey, projectId, { deletedCandidateId: candidateId });
}

async function loadProjectDesignState(query, appStateKey, projectId) {
  if (!projectId) throw new DesignReferencePersistenceError("projectId is required", 400);
  const result = await query(
    `select id, "references", design_reference_candidates
       from studio_projects
      where app_state_key = $1 and id = $2
      limit 1`,
    [appStateKey, projectId]
  );
  const row = result.rows[0];
  if (!row) throw new DesignReferencePersistenceError("Project not found", 404);
  return {
    id: row.id,
    references: asArray(row.references),
    designReferenceCandidates: asArray(row.design_reference_candidates)
  };
}

async function saveProjectDesignState(query, appStateKey, projectId, { references, candidates }) {
  await query(
    `update studio_projects
        set "references" = $3::jsonb,
            design_reference_candidates = $4::jsonb,
            updated_at = now()
      where app_state_key = $1 and id = $2`,
    [appStateKey, projectId, JSON.stringify(asArray(references)), JSON.stringify(asArray(candidates))]
  );
}

async function selectReference(query, appStateKey, projectId, referenceId) {
  await query(
    `insert into studio_app_ui_state (app_state_key, selected_project_id, selected_reference_id, updated_at)
     values ($1, $2, $3, now())
     on conflict (app_state_key)
     do update set
       selected_project_id = excluded.selected_project_id,
       selected_reference_id = excluded.selected_reference_id,
       updated_at = now()`,
    [appStateKey, projectId, referenceId]
  );
}

async function selectReferenceAfterDelete(query, appStateKey, projectId, deletedReferenceId, fallbackReferenceId) {
  const result = await query(
    "select selected_reference_id from studio_app_ui_state where app_state_key = $1 limit 1",
    [appStateKey]
  );
  if ((result.rows[0]?.selected_reference_id || "") === deletedReferenceId) {
    await selectReference(query, appStateKey, projectId, fallbackReferenceId);
  }
}

async function buildResult(query, appStateKey, projectId, extras) {
  const updatedAt = await rebuildLegacyMirror(query, appStateKey);
  const project = await loadUpdatedProject(query, appStateKey, projectId);
  return { ...extras, project, references: project?.references || [], updatedAt };
}

async function loadUpdatedProject(query, appStateKey, projectId) {
  const state = await loadNormalizedState(query, appStateKey) || await loadLegacyState(query, appStateKey);
  return (state?.projects || []).find((project) => project.id === projectId) || null;
}

function prependById(items, item) {
  return [item, ...asArray(items).filter((existing) => existing?.id !== item.id)];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
