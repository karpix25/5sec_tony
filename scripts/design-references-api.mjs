import { defaultAppStateKey } from "./app-state-lock.mjs";
import {
  buildConflictPayload,
  isPlainObject,
  readJsonBody,
  sendJson,
  writeWithConflictCheck
} from "./app-state-api-helpers.mjs";
import {
  DesignReferencePersistenceError,
  approveDesignReferenceCandidateForState,
  createDesignReferenceForState,
  deleteDesignReferenceForState,
  rejectDesignReferenceCandidateForState,
  updateDesignReferenceForState
} from "./design-reference-state-store.mjs";
import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";
import { loadLegacyState, loadNormalizedState } from "./state-relational-store.mjs";

const appStateKey = defaultAppStateKey;
const designReferencesJsonBodyLimitBytes = 16 * 1024 * 1024;

export const handleDesignReferencesApi = createDesignReferencesApiHandler();

export function createDesignReferencesApiHandler(deps = {}) {
  const resolvedDeps = resolveDeps(deps);
  return async function handleDesignReferencesApi(request, response, url) {
    const route = parseRoute(url.pathname);
    if (!route) return false;
    if (route.kind === "reference") return handleReferenceRoute(request, response, url, { ...resolvedDeps, ...route });
    if (route.kind === "candidate") return handleCandidateRoute(request, response, url, { ...resolvedDeps, ...route });
    return false;
  };
}

function resolveDeps(deps) {
  return {
    isConfigured: deps.isPostgresConfigured || isPostgresConfigured,
    withTransaction: deps.withPostgresTransaction || withPostgresTransaction,
    createReference: deps.createDesignReferenceForState || createDesignReferenceForState,
    updateReference: deps.updateDesignReferenceForState || updateDesignReferenceForState,
    deleteReference: deps.deleteDesignReferenceForState || deleteDesignReferenceForState,
    approveCandidate: deps.approveDesignReferenceCandidateForState || approveDesignReferenceCandidateForState,
    rejectCandidate: deps.rejectDesignReferenceCandidateForState || rejectDesignReferenceCandidateForState,
    loadNormalized: deps.loadNormalizedState || loadNormalizedState,
    loadLegacy: deps.loadLegacyState || loadLegacyState
  };
}

async function handleReferenceRoute(request, response, url, deps) {
  if (request.method === "POST" && !deps.referenceId) {
    return writeDesignReference(request, response, url, deps, (body, tx) => {
      const reference = getReferencePayload(body);
      if (!isPlainObject(reference)) throw new DesignReferencePersistenceError("reference object is required", 400);
      return deps.createReference(tx.query, appStateKey, deps.projectId, reference);
    });
  }
  if (request.method === "PATCH" && deps.referenceId) {
    return writeDesignReference(request, response, url, deps, (body, tx) => {
      const patch = getReferencePayload(body);
      if (!isPlainObject(patch)) throw new DesignReferencePersistenceError("reference object is required", 400);
      if (patch.id && patch.id !== deps.referenceId) {
        throw new DesignReferencePersistenceError("reference id does not match request path", 400);
      }
      return deps.updateReference(tx.query, appStateKey, deps.projectId, deps.referenceId, patch);
    });
  }
  if (request.method === "DELETE" && deps.referenceId) {
    return writeDesignReference(request, response, url, deps, (_body, tx) =>
      deps.deleteReference(tx.query, appStateKey, deps.projectId, deps.referenceId)
    );
  }
  return false;
}

async function handleCandidateRoute(request, response, url, deps) {
  if (request.method === "POST" && deps.action === "approve") {
    return writeDesignReference(request, response, url, deps, (_body, tx) =>
      deps.approveCandidate(tx.query, appStateKey, deps.projectId, deps.candidateId)
    );
  }
  if (request.method === "DELETE") {
    return writeDesignReference(request, response, url, deps, (_body, tx) =>
      deps.rejectCandidate(tx.query, appStateKey, deps.projectId, deps.candidateId)
    );
  }
  return false;
}

async function writeDesignReference(request, response, url, deps, write) {
  if (!deps.isConfigured()) return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  try {
    const body = await readJsonBody(request, { limitBytes: designReferencesJsonBodyLimitBytes });
    const result = await writeWithConflictCheck(body, deps, (tx) => write(body, tx), { allowStaleBaseUpdatedAt: true });
    if (result.conflict) return sendConflict(response, url, result);
    return sendJson(response, 200, { saved: true, key: appStateKey, ...result });
  } catch (error) {
    const status = error instanceof DesignReferencePersistenceError ? error.status : 500;
    return sendJson(response, status, { error: error.message || "Не удалось сохранить дизайн-референс" });
  }
}

function sendConflict(response, url, result) {
  return sendJson(response, 409, buildConflictPayload(result, {
    error: "БД обновлена другим оператором. Данные обновлены, повторите сохранение дизайн-референса.",
    key: appStateKey,
    url
  }));
}

function parseRoute(pathname) {
  const collection = pathname.match(/^\/api\/projects\/([^/]+)\/design-references$/);
  if (collection) return { kind: "reference", projectId: decodeURIComponent(collection[1]), referenceId: "" };
  const item = pathname.match(/^\/api\/projects\/([^/]+)\/design-references\/([^/]+)$/);
  if (item) return { kind: "reference", projectId: decodeURIComponent(item[1]), referenceId: decodeURIComponent(item[2]) };
  const candidate = pathname.match(/^\/api\/projects\/([^/]+)\/design-reference-candidates\/([^/]+)(?:\/(approve|reject))?$/);
  if (!candidate) return null;
  return {
    kind: "candidate",
    projectId: decodeURIComponent(candidate[1]),
    candidateId: decodeURIComponent(candidate[2]),
    action: candidate[3] || "reject"
  };
}

function getReferencePayload(body) {
  if (isPlainObject(body?.reference)) return body.reference;
  if (isPlainObject(body?.patch)) return body.patch;
  if (isPlainObject(body?.payload)) return body.payload;
  return isPlainObject(body) ? body : null;
}
