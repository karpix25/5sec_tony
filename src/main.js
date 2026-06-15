import { createStore } from "./state/store.js";
import { renderApp } from "./ui/render.js";
import { resumeRunningImageJobs } from "./ui/job-runner.js";

const root = document.querySelector("#app");
const store = createStore();

store.subscribe(() => renderApp(root, store));
renderApp(root, store);
setTimeout(() => resumeRunningImageJobs(store), 0);
