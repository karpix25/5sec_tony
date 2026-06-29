import { readJsonStorage, writeJsonStorage } from "../storage/json-storage.js";

const pagePositionKey = "anton-5-sec-page-position";
const pagePositionVersion = 1;

export function startPagePositionPersistence(source = globalThis) {
  const view = source.window || source;
  if (!view?.addEventListener) return () => {};
  setManualScrollRestoration(view);
  const save = () => savePagePosition(capturePagePosition(view));
  const scheduleSave = createScheduledSave(view, save);
  view.addEventListener("scroll", scheduleSave, { passive: true });
  view.addEventListener("pagehide", save);
  view.addEventListener("beforeunload", save);
  return () => {
    view.removeEventListener("scroll", scheduleSave);
    view.removeEventListener("pagehide", save);
    view.removeEventListener("beforeunload", save);
  };
}

export function capturePagePosition(source = globalThis) {
  const view = source.window || source;
  return {
    x: Math.max(0, Number(view?.scrollX || view?.pageXOffset || 0)),
    y: Math.max(0, Number(view?.scrollY || view?.pageYOffset || 0))
  };
}

export function restorePagePosition(source = globalThis, snapshot = readPagePosition()) {
  const view = source.window || source;
  const target = normalizePagePosition(snapshot);
  if (!view?.scrollTo || !target) return;
  runAfterLayout(view, () => view.scrollTo(target.x, target.y));
}

export function readPagePosition() {
  return normalizePagePosition(readJsonStorage(pagePositionKey, {
    fallback: null,
    version: pagePositionVersion
  }));
}

export function savePagePosition(position) {
  const target = normalizePagePosition(position);
  if (!target) return false;
  return writeJsonStorage(pagePositionKey, target, {
    version: pagePositionVersion
  });
}

function normalizePagePosition(position) {
  if (!position || typeof position !== "object") return null;
  const x = Math.max(0, Number(position.x || 0));
  const y = Math.max(0, Number(position.y || 0));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function createScheduledSave(view, save) {
  let frame = 0;
  return () => {
    if (frame) return;
    frame = requestFrame(view, () => {
      frame = 0;
      save();
    });
  };
}

function runAfterLayout(view, callback) {
  requestFrame(view, () => requestFrame(view, callback));
}

function requestFrame(view, callback) {
  if (typeof view.requestAnimationFrame === "function") return view.requestAnimationFrame(callback);
  return setTimeout(callback, 16);
}

function setManualScrollRestoration(view) {
  if (view.history && "scrollRestoration" in view.history) {
    view.history.scrollRestoration = "manual";
  }
}
