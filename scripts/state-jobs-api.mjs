import { isPostgresConfigured, queryPostgres } from "./postgres-client.mjs";
import { defaultAppStateKey } from "./app-state-lock.mjs";
import { loadAppStateMetadata } from "./app-state-metadata.mjs";
import { ensureStateSchema } from "./state-schema.mjs";
import { loadJobsPage } from "./state-jobs-store.mjs";
import { sendJson } from "./app-state-api-helpers.mjs";

const appStateKey = defaultAppStateKey;

export const handleStateJobsApi = createStateJobsApiHandler();

export function createStateJobsApiHandler(deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  const query = deps.queryPostgres || queryPostgres;
  const ensureSchema = deps.ensureStateSchema || ensureStateSchema;
  const loadPage = deps.loadJobsPage || loadJobsPage;
  const loadMetadata = deps.loadAppStateMetadata || loadAppStateMetadata;

  return async function handleStateJobsApi(request, response, url) {
    if (request.method !== "GET" || url.pathname !== "/api/state/jobs") return false;
    if (!isConfigured()) return sendJson(response, 200, { jobs: [], disabled: true, hasMore: false });
    try {
      await ensureSchema(query);
      const pageOptions = {
        offset: readNumber(url.searchParams.get("offset"), 0),
        limit: readLimit(url.searchParams.get("limit"))
      };
      const projectId = url.searchParams.get("projectId") || "";
      const productId = url.searchParams.get("productId") || "";
      if (projectId) pageOptions.projectId = projectId;
      if (productId) pageOptions.productId = productId;
      const page = await loadPage(query, appStateKey, pageOptions);
      return sendJson(response, 200, { ...page, ...await loadMetadata(query, appStateKey) });
    } catch (error) {
      return sendJson(response, 500, { error: error.message || "Не удалось загрузить историю генераций" });
    }
  };
}

function readNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function readLimit(value) {
  return Math.min(Math.max(readNumber(value, 500), 1), 500);
}
