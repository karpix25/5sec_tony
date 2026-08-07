import { defaultAppStateKey } from "./app-state-lock.mjs";
import {
  buildConflictPayload,
  isPlainObject,
  readJsonBody,
  sendJson,
  writeWithConflictCheck
} from "./app-state-api-helpers.mjs";
import { isPostgresConfigured, queryPostgres, withPostgresTransaction } from "./postgres-client.mjs";
import {
  ProjectPersistenceError,
  createProjectForState,
  deleteProjectForState,
  loadProjectBundleForState,
  saveProjectForState
} from "./project-state-store.mjs";
import { loadLegacyState, loadNormalizedState } from "./state-relational-store.mjs";

const appStateKey = defaultAppStateKey;
const projectsJsonBodyLimitBytes = 256 * 1024;

export const handleProjectsApi = createProjectsApiHandler();

export function createProjectsApiHandler(deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  const query = deps.queryPostgres || queryPostgres;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  const createProject = deps.createProjectForState || createProjectForState;
  const deleteProject = deps.deleteProjectForState || deleteProjectForState;
  const loadProjectBundle = deps.loadProjectBundleForState || loadProjectBundleForState;
  const saveProject = deps.saveProjectForState || saveProjectForState;
  const loadNormalized = deps.loadNormalizedState || loadNormalizedState;
  const loadLegacy = deps.loadLegacyState || loadLegacyState;

  return async function handleProjectsApi(request, response, url) {
    const projectId = getProjectId(url.pathname);
    const handlerDeps = {
      isConfigured,
      query,
      withTransaction,
      createProject,
      deleteProject,
      loadProjectBundle,
      saveProject,
      loadNormalized,
      loadLegacy,
      lockScope: "catalog",
      lockForUpdate: false
    };
    if (request.method === "POST" && url.pathname === "/api/projects") {
      return handleCreateProject(request, response, url, handlerDeps);
    }
    if (request.method === "GET" && projectId) {
      return handleGetProject(response, { ...handlerDeps, projectId });
    }
    const resource = getProjectResource(url.pathname);
    if (request.method === "PATCH" && resource?.projectId) {
      return handlePatchProjectResource(request, response, url, { ...handlerDeps, ...resource });
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

async function handleGetProject(response, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { project: null, product: null, updatedAt: null, disabled: true });
  }
  try {
    const result = await deps.loadProjectBundle(deps.query, appStateKey, deps.projectId);
    if (!result) return sendJson(response, 404, { error: "Project not found" });
    return sendJson(response, 200, result);
  } catch (error) {
    return sendProjectError(response, error, "Не удалось загрузить проект");
  }
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
      updatedAt: result.updatedAt || "",
      refreshUpdatedAt: result.refreshUpdatedAt || result.updatedAt || "",
      catalogUpdatedAt: result.catalogUpdatedAt || result.refreshUpdatedAt || result.updatedAt || ""
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
      deps.saveProject(tx.query, appStateKey, deps.projectId, patch, {
        projectLimitBase: body.projectLimitBase
      })
    );
    if (result.conflict) return sendConflict(response, url, result);
    return sendJson(response, 200, {
      saved: true,
      key: appStateKey,
      project: result.project,
      updatedAt: result.updatedAt || "",
      refreshUpdatedAt: result.refreshUpdatedAt || result.updatedAt || "",
      catalogUpdatedAt: result.catalogUpdatedAt || result.refreshUpdatedAt || result.updatedAt || ""
    });
  } catch (error) {
    return sendProjectError(response, error, "Не удалось сохранить проект");
  }
}

async function handlePatchProjectResource(request, response, url, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request, { limitBytes: projectsJsonBodyLimitBytes });
    const patch = getResourcePatch(deps.resourceName, body);
    if (!isPlainObject(patch)) return sendJson(response, 400, { error: "resource payload is required" });
    const result = await writeWithConflictCheck(body, deps, (tx) =>
      deps.saveProject(tx.query, appStateKey, deps.projectId, patch)
    );
    if (result.conflict) return sendConflict(response, url, result);
    return sendJson(response, 200, {
      saved: true,
      key: appStateKey,
      project: result.project,
      resource: deps.resourceName,
      updatedAt: result.updatedAt || "",
      refreshUpdatedAt: result.refreshUpdatedAt || result.updatedAt || "",
      catalogUpdatedAt: result.catalogUpdatedAt || result.refreshUpdatedAt || result.updatedAt || ""
    });
  } catch (error) {
    return sendProjectError(response, error, "Не удалось сохранить часть проекта");
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
      updatedAt: result.updatedAt || "",
      refreshUpdatedAt: result.refreshUpdatedAt || result.updatedAt || "",
      catalogUpdatedAt: result.catalogUpdatedAt || result.refreshUpdatedAt || result.updatedAt || ""
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

function getProjectResource(pathname) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/(automation|usage|cta-overlay|avatars)$/);
  if (!match) return null;
  return {
    projectId: decodeURIComponent(match[1]),
    resourceName: match[2]
  };
}

function getProjectPatch(body) {
  if (isPlainObject(body?.project)) return body.project;
  if (isPlainObject(body?.payload)) return body.payload;
  return body;
}

function getResourcePatch(resourceName, body) {
  const payload = isPlainObject(body?.payload) ? body.payload : body;
  if (resourceName === "automation") return pickDefined(payload, ["automation"]);
  if (resourceName === "usage") return pickDefined(payload, ["usedToday", "dailyUsageDate", "usedTotal"]);
  if (resourceName === "cta-overlay") return pickDefined(payload, ["ctaOverlay"]);
  if (resourceName === "avatars") return pickDefined(payload, ["avatarCandidates", "characters", "avatarRoundRobinIndex"]);
  return {};
}

function pickDefined(source, keys) {
  const result = {};
  keys.forEach((key) => {
    if (Object.hasOwn(source || {}, key)) result[key] = source[key];
  });
  return result;
}

function sendProjectError(response, error, fallback) {
  const status = error instanceof ProjectPersistenceError ? error.status : 500;
  return sendJson(response, status, { error: error.message || fallback });
}
