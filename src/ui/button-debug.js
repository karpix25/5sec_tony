import { getContext } from "../state/store.js";

const BUTTON_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"]';
const DEBUG_LOG_KEY = "__antonButtonLog";

export function bindButtonDebug(root, store) {
  if (!root || root.dataset.buttonDebugBound === "true") return;
  root.dataset.buttonDebugBound = "true";
  root.addEventListener("click", (event) => {
    const button = findButtonTarget(event.target);
    if (!button) return;
    const payload = getButtonPayload(button, store);
    pushDebugEntry("click", payload);
    console.log("[ui:button:click]", payload);
  }, true);
}

export function warnButtonBlocked(reason, details = {}) {
  const payload = { reason, ...details };
  pushDebugEntry("blocked", payload);
  console.warn("[ui:button:blocked]", payload);
}

function findButtonTarget(target) {
  if (!target) return null;
  if (typeof target.closest === "function") return target.closest(BUTTON_SELECTOR);
  let node = target;
  while (node) {
    if (matchesButton(node)) return node;
    node = node.parentNode;
  }
  return null;
}

function matchesButton(node) {
  if (!node || typeof node.matches !== "function") return false;
  return node.matches(BUTTON_SELECTOR);
}

function getButtonPayload(button, store) {
  const state = store?.getState?.();
  const context = state ? getContext(state) : null;
  return {
    at: new Date().toISOString(),
    id: button.id || null,
    text: normalizeButtonDebugText(button.textContent),
    type: button.getAttribute?.("type") || button.type || null,
    className: normalizeButtonDebugText(button.className),
    disabled: Boolean(button.disabled),
    dataset: { ...(button.dataset || {}) },
    projectId: context?.project?.id || state?.selectedProjectId || null,
    projectName: context?.project?.name || null,
    productId: context?.product?.id || state?.selectedProductId || null,
    productName: context?.product?.name || null
  };
}

function pushDebugEntry(kind, payload) {
  const scope = globalThis.window || globalThis;
  const queue = scope[DEBUG_LOG_KEY] || [];
  queue.push({ kind, ...payload });
  if (queue.length > 300) queue.splice(0, queue.length - 300);
  scope[DEBUG_LOG_KEY] = queue;
}

function normalizeButtonDebugText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 160) : null;
}
