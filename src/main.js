import { createStore } from "./state/store.js";
import { renderApp, updatePersistenceStatus } from "./ui/render.js";
import { startAutomationRunner } from "./ui/automation-runner.js";
import { resumeRunningImageJobs } from "./ui/job-runner.js";

const root = document.querySelector("#app");
const store = createStore();

store.subscribe(() => renderApp(root, store));
store.subscribePersistence((status) => updatePersistenceStatus(root, status));
renderApp(root, store);
setTimeout(() => resumeRunningImageJobs(store), 0);
startAutomationRunner(store);
