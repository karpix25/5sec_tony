import { createStore } from "./state/store.js";
import { renderApp, updatePersistenceStatus } from "./ui/render.js";
import { startAutomationRunner } from "./ui/automation-runner.js";
import { resumeRunningImageJobs } from "./ui/job-runner.js";
import { startQueueStatusSync } from "./ui/queue-sync.js";
import { getContext } from "./state/store.js";
import { getOpenMediaPreviewState, restoreMediaPreviewState } from "./ui/preview-modal.js";
import { updateGenerationAutomationStats } from "./ui/generation-live.js";
import { bindButtonDebug } from "./ui/button-debug.js";
import { updateQueuePanel } from "./ui/queue.js";
import { createQueuePagination } from "./ui/queue-pagination.js";
import { captureTransientUiState, restoreTransientUiState } from "./ui/transient-ui-state.js";
import { createAuthController } from "./ui/auth.js";
import { renderStudioLoading } from "./ui/studio-loading.js";
import { capturePagePosition, restorePagePosition, startPagePositionPersistence } from "./ui/page-position-state.js";
import { applyUrlNavigationToStore, startUrlNavigationSync } from "./ui/url-navigation.js";

const root = document.querySelector("#app");
let store = null;
let pendingFrame = 0;
let needsFullRender = false;
let pendingState = null;
let firstRenderReady = false;
let initialPagePositionRestored = false;
let stopUrlNavigationSync = null;
const queuePagination = createQueuePagination({ onChange: () => renderAppSafely() });

const auth = createAuthController({
  root: null,
  renderApprovedState: false,
  onStateChange: (authState) => {
    if (authState.status === "approved" && store && firstRenderReady) renderAppSafely();
  }
});
startStudio();
auth.start();
startPagePositionPersistence(window);

function startStudio() {
  if (store) return;
  store = createStore();
  pendingState = store.getState();
  bindButtonDebug(root, store);
  store.subscribe((state, patch) => scheduleRender(state, patch));
  store.subscribePersistence((status) => {
    if (firstRenderReady) updatePersistenceStatus(root, status);
    else renderStartupStatus(status);
  });
  renderStartupStatus(store.getPersistenceStatus?.());
  Promise.resolve(store.whenHydrated?.())
    .catch(() => null)
    .then(finishStudioStartup);
}

function renderStartupStatus(status) {
  renderStudioLoading(root, status);
  root.querySelector("[data-retry-hydration]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    await store.retryHydration?.();
    finishStudioStartup();
  });
}

function finishStudioStartup() {
  if (store.getPersistenceStatus?.().status === "error") {
    firstRenderReady = false;
    renderStartupStatus(store.getPersistenceStatus?.());
    return;
  }
  firstRenderReady = true;
  applyUrlNavigationToStore(store, window.location);
  stopUrlNavigationSync?.();
  stopUrlNavigationSync = startUrlNavigationSync(store, window);
  renderAppSafely();
  void store.whenJobsHydrated?.().then(() => {
    resumeRunningImageJobs(store);
    startQueueStatusSync(store);
    startAutomationRunner(store);
  });
}

function scheduleRender(state, patch) {
  pendingState = state;
  if (!firstRenderReady) return;
  needsFullRender ||= !isJobsOnlyPatch(patch);
  if (pendingFrame) return;
  pendingFrame = requestRenderFrame(flushRender);
}

function flushRender() {
  pendingFrame = 0;
  if (!needsFullRender) {
    const context = getContext(pendingState);
    updateQueuePanel(root, pendingState, context, store, { pagination: getQueuePagination() });
    updateGenerationAutomationStats(root, pendingState, context);
    return;
  }
  needsFullRender = false;
  renderAppSafely();
}

function renderAppSafely() {
  if (!store) return;
  const preview = getOpenMediaPreviewState(root);
  const transientUiState = captureTransientUiState(root);
  const pagePosition = initialPagePositionRestored ? capturePagePosition(window) : undefined;
  renderApp(root, store, { auth, rerender: renderAppSafely, pagination: getQueuePagination() });
  restoreMediaPreviewState(root, preview);
  restoreTransientUiState(root, transientUiState);
  restorePagePosition(window, pagePosition);
  initialPagePositionRestored = true;
}

function isJobsOnlyPatch(patch) {
  return Boolean(patch && Object.keys(patch).length === 1 && Array.isArray(patch.jobs));
}

function getQueuePagination() {
  return store?.getPersistenceStatus?.().status === "local" ? null : queuePagination;
}

function requestRenderFrame(callback) {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return setTimeout(callback, 16);
}
