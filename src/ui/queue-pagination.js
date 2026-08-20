import { loadRemoteJobsPage } from "../services/state-sync.js";
import { escapeHtml } from "./infographic.js";

export const queuePageSize = 15;

export function renderQueuePagination(state) {
  const pageCount = Math.max(1, Math.ceil(state.total / queuePageSize));
  if (pageCount <= 1) return "";
  return `
    <nav class="queue-pagination" aria-label="Страницы генераций">
      <button class="ghost-btn" data-queue-page="${state.page - 1}" type="button" ${state.page <= 1 ? "disabled" : ""}>Назад</button>
      <span>Страница ${state.page} из ${pageCount}</span>
      <button class="ghost-btn" data-queue-page="${state.page + 1}" type="button" ${state.page >= pageCount ? "disabled" : ""}>Вперёд</button>
    </nav>
  `;
}

export function renderQueuePaginationError(message) {
  return `<p class="empty queue-pagination-error">${escapeHtml(message)} <button class="ghost-btn" data-queue-page-retry type="button">Повторить</button></p>`;
}

export function createQueuePagination({ loadPage = loadRemoteJobsPage, onChange = () => {} } = {}) {
  let snapshot = createSnapshot();
  let requestId = 0;

  return {
    getState: () => snapshot,
    ensure(context, filter) {
      const key = getQueuePageKey(context, filter);
      if (snapshot.key === key) return;
      snapshot = { ...createSnapshot(), key, filter };
      void fetchPage(context, filter, 1);
    },
    goToPage(page, context, filter) {
      const nextPage = clampPage(page, snapshot.total);
      if (snapshot.key !== getQueuePageKey(context, filter) || snapshot.page === nextPage) return;
      snapshot = { ...snapshot, page: nextPage, loading: true, error: "" };
      onChange();
      void fetchPage(context, filter, nextPage);
    },
    refresh(context, filter) {
      snapshot = { ...snapshot, loading: true, error: "" };
      onChange();
      void fetchPage(context, filter, snapshot.page || 1);
    }
  };

  async function fetchPage(context, filter, page) {
    const currentRequest = ++requestId;
    const projectId = context.project?.id || "";
    const productId = filter === "current" ? context.product?.id || "" : "";
    snapshot = { ...snapshot, page, loading: true, error: "" };
    onChange();
    try {
      const pageOffset = (page - 1) * queuePageSize;
      const [pageResult, countResult] = await Promise.all([
        loadPage(pageOffset, queuePageSize, { projectId, productId }),
        filter === "all"
          ? loadPage(0, 1, { projectId, productId: context.product?.id || "" })
          : loadPage(0, 1, { projectId })
      ]);
      if (currentRequest !== requestId) return;
      const allTotal = filter === "all" ? pageResult.total : countResult.total;
      snapshot = {
        ...snapshot,
        jobs: pageResult.jobs,
        total: pageResult.total,
        allTotal,
        currentTotal: filter === "current" ? pageResult.total : countResult.total,
        page,
        loading: false,
        error: ""
      };
      onChange();
    } catch (error) {
      if (currentRequest !== requestId) return;
      snapshot = { ...snapshot, loading: false, error: error.message || "Не удалось загрузить историю генераций" };
      onChange();
    }
  }
}

export function getQueuePageKey(context, filter) {
  return `${context.project?.id || ""}:${context.product?.id || ""}:${filter}`;
}

function createSnapshot() {
  return { key: "", filter: "current", jobs: null, total: 0, allTotal: 0, currentTotal: 0, page: 1, loading: false, error: "" };
}

function clampPage(page, total) {
  const pageCount = Math.max(1, Math.ceil(Number(total || 0) / queuePageSize));
  return Math.min(Math.max(Number(page) || 1, 1), pageCount);
}
