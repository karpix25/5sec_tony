import { createStore } from "./state/store.js";
import { renderApp, updatePersistenceStatus } from "./ui/render.js";
import { startAutomationRunner } from "./ui/automation-runner.js";
import { resumeRunningImageJobs } from "./ui/job-runner.js";
import { getContext } from "./state/store.js";
import { getOpenMediaPreviewState, restoreMediaPreviewState } from "./ui/preview-modal.js";
import { updateGenerationAutomationStats } from "./ui/generation-live.js";
import { bindButtonDebug } from "./ui/button-debug.js";
import { updateQueuePanel } from "./ui/queue.js";
import { captureTransientUiState, restoreTransientUiState } from "./ui/transient-ui-state.js";

const root = document.querySelector("#app");
const store = createStore();
let pendingFrame = 0;
let needsFullRender = false;
let pendingState = store.getState();

bindButtonDebug(root, store);
store.subscribe((state, patch) => scheduleRender(state, patch));
store.subscribePersistence((status) => updatePersistenceStatus(root, status));
renderAppSafely();
Promise.resolve(store.whenHydrated?.())
  .catch(() => null)
  .finally(() => {
    resumeRunningImageJobs(store);
    startAutomationRunner(store);
  });

function scheduleRender(state, patch) {
  pendingState = state;
  needsFullRender ||= !isJobsOnlyPatch(patch);
  if (pendingFrame) return;
  pendingFrame = requestRenderFrame(flushRender);
}

function flushRender() {
  pendingFrame = 0;
  if (!needsFullRender) {
    const context = getContext(pendingState);
    updateQueuePanel(root, pendingState, context, store);
    updateGenerationAutomationStats(root, pendingState, context);
    return;
  }
  needsFullRender = false;
  renderAppSafely();
}

function renderAppSafely() {
  const preview = getOpenMediaPreviewState(root);
  const transientUiState = captureTransientUiState(root);
  renderApp(root, store, { rerender: renderAppSafely });
  restoreMediaPreviewState(root, preview);
  restoreTransientUiState(root, transientUiState);
}

function isJobsOnlyPatch(patch) {
  return Boolean(patch && Object.keys(patch).length === 1 && Array.isArray(patch.jobs));
}

function requestRenderFrame(callback) {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return setTimeout(callback, 16);
}
