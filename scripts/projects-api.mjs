import { defaultAppStateKey } from "./app-state-lock.mjs";
import {
  buildConflictPayload,
  isPlainObject,
  readJsonBody,
  sendJson,
  writeWithConflictCheck
} from "./app-state-api-helpers.mjs";
import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";
import {
  ProjectPersistenceError,
  createProjectForState,
  deleteProjectForState,
  saveProjectForState
} from "./project-state-store.mjs";
import { loadLegacyState, loadNormalizedState } from "./state-relational-store.mjs";

const appStateKey = defaultAppStateKey;
const projectsJsonBodyLimitBytes = 256 * 1024;

export const handleProjectsApi = createProjectsApiHandler();

export function createProjectsApiHandler(deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  const createProject = deps.createProjectForState || createProjectForState;
  const deleteProject = deps.deleteProjectForState || deleteProjectForState;
  const saveProject = deps.saveProjectForState || saveProjectForState;
  const loadNormalized = deps.loadNormalizedState || loadNormalizedState;
  const loadLegacy = deps.loadLegacyState || loadLegacyState;

  return async function handleProjectsApi(request, response, url) {
    const projectId = getProjectId(url.pathname);
    const handlerDeps = {
      isConfigured,
      withTransaction,
      createProject,
      deleteProject,
      saveProject,
      loadNormalized,
      loadLegacy
    };
    if (request.method === "POST" && url.pathname === "/api/projects") {
      return handleCreateProject(request, response, url, handlerDeps);
    }
    if (request.method === "PATCH" && projectId) {
      return handlePatchProject(request, response, url, { ...handlerDeps, projectId });
    }
    if (request.method === "DELETE" && projectId) {
      return handleDeleteProject(request, response, url, { ...handlerDeps, projectId });
    }
    return false;
  };
}

async function handleCreateProject(request, response, url, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request, { limitBytes: projectsJsonBodyLimitBytes });
    const result = await writeWithConflictCheck(body, deps, (tx) =>
      deps.createProject(tx.query, appStateKey, { project: body.project, product: body.product })
    );
    if (result.conflict) return sendConflict(response, url, result);
    return sendJson(response, 200, {
      saved: true,
      key: appStateKey,
      project: result.project,
      product: result.product,
      updatedAt: result.updatedAt || ""
    });
  } catch (error) {
    return sendProjectError(response, error, "Не удалось создать проект");
  }
}

async function handlePatchProject(request, response, url, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request, { limitBytes: projectsJsonBodyLimitBytes });
    const patch = getProjectPatch(body);
    if (!isPlainObject(patch)) return sendJson(response, 400, { error: "project object is required" });
    if (patch.id && patch.id !== deps.projectId) return sendJson(response, 400, { error: "project id does not match request path" });
    const result = await writeWithConflictCheck(body, deps, (tx) =>
      deps.saveProject(tx.query, appStateKey, deps.projectId, patch)
    );
    if (result.conflict) return sendConflict(response, url, result);
    return sendJson(response, 200, {
      saved: true,
      key: appStateKey,
      project: result.project,
      updatedAt: result.updatedAt || ""
    });
  } catch (error) {
    return sendProjectError(response, error, "Не удалось сохранить проект");
  }
}

async function handleDeleteProject(request, response, url, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request, { limitBytes: projectsJsonBodyLimitBytes });
    const result = await writeWithConflictCheck(body, deps, (tx) =>
      deps.deleteProject(tx.query, appStateKey, deps.projectId)
    );
    if (result.conflict) return sendConflict(response, url, result);
    return sendJson(response, 200, {
      saved: true,
      key: appStateKey,
      deletedProjectId: result.deletedProjectId || "",
      updatedAt: result.updatedAt || ""
    });
  } catch (error) {
    return sendProjectError(response, error, "Не удалось удалить проект");
  }
}

function sendConflict(response, url, result) {
  return sendJson(response, 409, buildConflictPayload(result, {
    error: "БД обновлена другим оператором. Данные обновлены, повторите сохранение проекта.",
    key: appStateKey,
    url
  }));
}

function getProjectId(pathname) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getProjectPatch(body) {
  if (isPlainObject(body?.project)) return body.project;
  if (isPlainObject(body?.payload)) return body.payload;
  return body;
}

function sendProjectError(response, error, fallback) {
  const status = error instanceof ProjectPersistenceError ? error.status : 500;
  return sendJson(response, status, { error: error.message || fallback });
}
