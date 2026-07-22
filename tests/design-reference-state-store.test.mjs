import test from "node:test";
import assert from "node:assert/strict";
import {
  approveDesignReferenceCandidateForState,
  createDesignReferenceForState,
  deleteDesignReferenceForState,
  rejectDesignReferenceCandidateForState,
  updateDesignReferenceForState
} from "../scripts/design-reference-state-store.mjs";

test("design reference store prepends reference into project JSONB and legacy mirror", async () => {
  const db = createMemoryDb([{ id: "old-ref", title: "Old" }]);

  const result = await createDesignReferenceForState(db.query, "default", "project-1", {
    id: "new-ref",
    title: "Новый русский референс",
    imageData: "https://s3.example.com/new.png"
  });

  assert.equal(result.reference.id, "new-ref");
  assert.deepEqual(db.references.map((reference) => reference.id), ["new-ref", "old-ref"]);
  assert.equal(db.selectedReferenceId, "new-ref");
  assert.equal(db.legacyState.projects[0].references[0].title, "Новый русский референс");
  assert.ok(db.queries.some(({ text }) => /update studio_projects[\s\S]*set[\s\S]*"references"/i.test(text)));
  assert.ok(db.queries.some(({ text }) => /insert into app_state/i.test(text)));
});

test("design reference store approves candidate into references and removes candidate", async () => {
  const db = createMemoryDb([], {
    candidates: [{ id: "candidate-1", title: "Candidate", prompt: "style", takeaways: "style", imageData: "https://s3.example.com/c.png" }]
  });

  const result = await approveDesignReferenceCandidateForState(db.query, "default", "project-1", "candidate-1");

  assert.equal(result.deletedCandidateId, "candidate-1");
  assert.equal(result.reference.generatedFromCandidateId, "candidate-1");
  assert.deepEqual(db.references.map((reference) => reference.generatedFromCandidateId), ["candidate-1"]);
  assert.deepEqual(db.candidates, []);
  assert.equal(db.selectedReferenceId, result.reference.id);
  assert.equal(db.legacyState.projects[0].designReferenceCandidates.length, 0);
});

test("design reference store rejects candidate without touching references", async () => {
  const db = createMemoryDb([{ id: "ref-1", title: "Keep" }], {
    candidates: [{ id: "candidate-1", title: "Candidate" }]
  });

  const result = await rejectDesignReferenceCandidateForState(db.query, "default", "project-1", "candidate-1");

  assert.equal(result.deletedCandidateId, "candidate-1");
  assert.deepEqual(db.references.map((reference) => reference.id), ["ref-1"]);
  assert.deepEqual(db.candidates, []);
});

test("design reference store updates one reference without changing its id", async () => {
  const db = createMemoryDb([{ id: "ref-1", title: "Old", takeaways: "old" }]);

  const result = await updateDesignReferenceForState(db.query, "default", "project-1", "ref-1", {
    id: "ref-1",
    title: "Обновлено",
    takeaways: "новые выводы"
  });

  assert.equal(result.reference.id, "ref-1");
  assert.equal(db.references[0].title, "Обновлено");
  assert.equal(db.references[0].takeaways, "новые выводы");
  assert.equal(db.legacyState.projects[0].references[0].title, "Обновлено");
});

test("design reference store deletes selected reference and picks fallback", async () => {
  const db = createMemoryDb([
    { id: "ref-1", title: "Delete me" },
    { id: "ref-2", title: "Keep me" }
  ], { selectedReferenceId: "ref-1" });

  const result = await deleteDesignReferenceForState(db.query, "default", "project-1", "ref-1");

  assert.equal(result.deletedReferenceId, "ref-1");
  assert.deepEqual(db.references.map((reference) => reference.id), ["ref-2"]);
  assert.equal(db.selectedReferenceId, "ref-2");
  assert.deepEqual(db.legacyState.projects[0].references.map((reference) => reference.id), ["ref-2"]);
});

function createMemoryDb(initialReferences, options = {}) {
  const db = {
    references: initialReferences,
    candidates: options.candidates || [],
    selectedReferenceId: options.selectedReferenceId || initialReferences[0]?.id || "",
    legacyState: null,
    queries: []
  };
  db.query = async (text, params = []) => {
    db.queries.push({ text, params });
    if (/select[\s\S]*design_reference_candidates[\s\S]*from studio_projects/i.test(text)) {
      return { rows: [{ references: db.references, design_reference_candidates: db.candidates }] };
    }
    if (/update studio_projects[\s\S]*set[\s\S]*"references"/i.test(text)) {
      db.references = JSON.parse(params[2]);
      db.candidates = JSON.parse(params[3]);
      return { rows: [] };
    }
    if (/insert into studio_app_ui_state/i.test(text)) {
      db.selectedReferenceId = params[2];
      return { rows: [] };
    }
    if (/select selected_reference_id from studio_app_ui_state/i.test(text)) return { rows: [{ selected_reference_id: db.selectedReferenceId }] };
    if (/select \(\s*exists\(select 1 from studio_app_ui_state/i.test(text)) return { rows: [{ present: true }] };
    if (/select \* from studio_app_ui_state/i.test(text)) return { rows: [uiRow(db)] };
    if (/select \* from studio_projects where app_state_key = \$1 order by sort_order/i.test(text)) return { rows: [projectRow(db)] };
    if (/insert into app_state/i.test(text)) {
      db.legacyState = JSON.parse(params[1]);
      return { rows: [{ updated_at: "db-v2" }] };
    }
    return { rows: [] };
  };
  return db;
}

function uiRow(db) {
  return {
    selected_project_id: "project-1",
    selected_product_id: "product-1",
    selected_reference_id: db.selectedReferenceId,
    selected_character_id: "",
    selected_audio_id: "",
    selected_project_tab: "design",
    generation_brief: {},
    free_prompt: "",
    extra: {}
  };
}

function projectRow(db) {
  return {
    id: "project-1",
    name: "Project",
    client: "Client",
    export_folder: "",
    yandex_disk_folder: "",
    daily_limit: 20,
    used_today: 0,
    daily_usage_date: "",
    project_limit: 500,
    used_total: 0,
    company_info: "",
    company_audience: "",
    project_theme: "",
    niche: "",
    key_scenarios: "",
    audience_pains: "",
    audience_desires: "",
    audience_objections: "",
    allowed_triggers: "",
    forbidden_triggers: "",
    hook_aggression: "",
    content_restrictions: "",
    tone_of_voice: "",
    restrictions: "",
    style: "",
    last_reference_update: "",
    avatar_round_robin_index: 0,
    automation: {},
    cta_overlay: {},
    references: db.references,
    audio_library: [],
    avatar_candidates: [],
    design_reference_candidates: db.candidates,
    characters: [],
    extra: {}
  };
}
