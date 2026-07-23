import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUrlNavigationToStore,
  createNavigationUrl,
  readUrlNavigation,
  startUrlNavigationSync
} from "../src/ui/url-navigation.js";

test("url navigation reads project product and tab from query params", () => {
  const nav = readUrlNavigation(new URL("https://app.test/?project=beauty&product=serum&tab=queue"));

  assert.deepEqual(nav, { projectId: "beauty", productId: "serum", tab: "queue" });
});

test("url navigation ignores invalid tabs", () => {
  const nav = readUrlNavigation(new URL("https://app.test/?project=beauty&tab=unknown"));

  assert.equal(nav.projectId, "beauty");
  assert.equal(nav.tab, "");
});

test("navigation url preserves path unrelated params and hash", () => {
  const url = createNavigationUrl({
    selectedProjectId: "beauty",
    selectedProductId: "serum",
    selectedProjectTab: "generation"
  }, new URL("https://app.test/studio?utm=1#top"));

  assert.equal(url, "/studio?utm=1&project=beauty&product=serum&tab=generation#top");
});

test("url navigation sync writes state to address bar and reacts to back forward", () => {
  const browser = createFakeBrowser("https://app.test/studio");
  const store = createFakeStore({
    selectedProjectId: "supplements",
    selectedProductId: "magnesium",
    selectedProjectTab: "project"
  });

  const stop = startUrlNavigationSync(store, browser);
  assert.equal(browser.location.search, "?project=supplements&product=magnesium&tab=project");
  assert.equal(browser.historyCalls[0].method, "replaceState");

  store.setNavigationPatch({ selectedProjectTab: "queue" });
  assert.equal(browser.location.search, "?project=supplements&product=magnesium&tab=queue");
  assert.equal(browser.historyCalls.at(-1).method, "pushState");

  browser.history.pushState(null, "", "/studio?project=beauty&product=serum&tab=design");
  browser.dispatch("popstate");
  assert.deepEqual(store.appliedNavigation.at(-1), { projectId: "beauty", productId: "serum", tab: "design" });
  assert.equal(browser.historyCalls.filter((call) => call.method === "pushState").length, 2);

  stop();
});

test("url navigation applies initial url to store", () => {
  const store = createFakeStore({
    selectedProjectId: "supplements",
    selectedProductId: "magnesium",
    selectedProjectTab: "project"
  });
  const applied = applyUrlNavigationToStore(store, new URL("https://app.test/?project=beauty&tab=queue"));

  assert.equal(applied, true);
  assert.deepEqual(store.appliedNavigation[0], { projectId: "beauty", productId: "", tab: "queue" });
});

function createFakeStore(initialState) {
  let state = { ...initialState };
  const subscribers = new Set();
  return {
    appliedNavigation: [],
    getState: () => state,
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    applyNavigationSelection(selection) {
      this.appliedNavigation.push(selection);
      state = {
        ...state,
        selectedProjectId: selection.projectId || state.selectedProjectId,
        selectedProductId: selection.productId || state.selectedProductId,
        selectedProjectTab: selection.tab || state.selectedProjectTab
      };
      subscribers.forEach((callback) => callback(state, {
        selectedProjectId: state.selectedProjectId,
        selectedProductId: state.selectedProductId,
        selectedProjectTab: state.selectedProjectTab
      }));
    },
    setNavigationPatch(patch) {
      state = { ...state, ...patch };
      subscribers.forEach((callback) => callback(state, patch));
    }
  };
}

function createFakeBrowser(href) {
  let currentUrl = new URL(href);
  const listeners = new Map();
  const historyCalls = [];
  const setUrl = (method, nextUrl) => {
    currentUrl = new URL(nextUrl, currentUrl);
    historyCalls.push({ method, url: `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}` });
  };
  return {
    historyCalls,
    get location() {
      return currentUrl;
    },
    history: {
      pushState: (_state, _title, url) => setUrl("pushState", url),
      replaceState: (_state, _title, url) => setUrl("replaceState", url)
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type, callback) {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
    dispatch(type) {
      listeners.get(type)?.();
    }
  };
}
