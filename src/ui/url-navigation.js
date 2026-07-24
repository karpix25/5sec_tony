import { normalizeNavigationTab } from "../domain/navigation.js";

const projectParam = "project";
const productParam = "product";
const tabParam = "tab";

export function readUrlNavigation(location = getWindowLocation()) {
  const params = new URLSearchParams(location?.search || "");
  return {
    projectId: params.get(projectParam) || "",
    productId: params.get(productParam) || "",
    tab: normalizeNavigationTab(params.get(tabParam), "")
  };
}

export function hasUrlNavigation(location = getWindowLocation()) {
  const params = new URLSearchParams(location?.search || "");
  return [projectParam, productParam, tabParam].some((key) => params.has(key));
}

export function createNavigationUrl(state = {}, location = getWindowLocation()) {
  const url = new URL(location?.href || "http://localhost/");
  setOrDelete(url.searchParams, projectParam, state.selectedProjectId);
  setOrDelete(url.searchParams, productParam, state.selectedProductId);
  setOrDelete(url.searchParams, tabParam, normalizeNavigationTab(state.selectedProjectTab));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function applyUrlNavigationToStore(store, location = getWindowLocation()) {
  if (!hasUrlNavigation(location) || typeof store?.applyNavigationSelection !== "function") return false;
  store.applyNavigationSelection(readUrlNavigation(location));
  return true;
}

export function startUrlNavigationSync(store, browserWindow = globalThis.window) {
  if (!browserWindow?.history || !browserWindow?.location || typeof store?.subscribe !== "function") return () => {};
  let applyingPopState = false;
  const replaceCurrentUrl = () => writeUrl(browserWindow, store.getState(), "replaceState");
  const unsubscribe = store.subscribe((state, patch) => {
    if (applyingPopState || !isNavigationPatch(patch)) return;
    writeUrl(browserWindow, state, "pushState");
  });
  const onPopState = () => {
    applyingPopState = true;
    applyUrlNavigationToStore(store, browserWindow.location);
    applyingPopState = false;
  };
  browserWindow.addEventListener?.("popstate", onPopState);
  replaceCurrentUrl();
  return () => {
    unsubscribe?.();
    browserWindow.removeEventListener?.("popstate", onPopState);
  };
}

function writeUrl(browserWindow, state, method) {
  const nextUrl = createNavigationUrl(state, browserWindow.location);
  const currentUrl = `${browserWindow.location.pathname}${browserWindow.location.search}${browserWindow.location.hash}`;
  if (nextUrl === currentUrl) return;
  browserWindow.history[method]?.(null, "", nextUrl);
}

function isNavigationPatch(patch = {}) {
  if (!patch || typeof patch !== "object") return false;
  return ["selectedProjectId", "selectedProductId", "selectedProjectTab"].some((key) => Object.hasOwn(patch, key));
}

function setOrDelete(params, key, value) {
  const text = String(value || "");
  if (text) params.set(key, text);
  else params.delete(key);
}

function getWindowLocation() {
  return typeof window === "undefined" ? null : window.location;
}
