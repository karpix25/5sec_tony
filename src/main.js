import { createStore } from "./state/store.js";
import { renderApp, updatePersistenceStatus } from "./ui/render.js";
import { startAutomationRunner } from "./ui/automation-runner.js";
import { resumeRunningImageJobs } from "./ui/job-runner.js";
import { getOpenMediaPreviewState, restoreMediaPreviewState } from "./ui/preview-modal.js";

const root = document.querySelector("#app");
const store = createStore();

store.subscribe(() => renderAppPreservingPreview());
store.subscribePersistence((status) => updatePersistenceStatus(root, status));
renderAppPreservingPreview();
setTimeout(() => resumeRunningImageJobs(store), 0);
startAutomationRunner(store);

function renderAppPreservingPreview() {
  const preview = getOpenMediaPreviewState(root);
  renderApp(root, store);
  restoreMediaPreviewState(root, preview);
}
