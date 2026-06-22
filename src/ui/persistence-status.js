import { escapeHtml } from "./infographic.js";

export function renderPersistenceStatus(status = {}) {
  const view = getPersistenceStatusView(status);
  return `<small class="persistence-status ${view.tone}" data-persistence-status>${escapeHtml(view.label)}</small>`;
}

export function updatePersistenceStatusView(root, status) {
  const node = root.querySelector("[data-persistence-status]");
  if (!node) return;
  const view = getPersistenceStatusView(status);
  node.className = `persistence-status ${view.tone}`;
  node.textContent = view.label;
}

function getPersistenceStatusView(status = {}) {
  const tone = ["saved", "saving", "loading", "error", "local"].includes(status.status) ? status.status : "local";
  return { tone, label: status.message || "Локальный кэш" };
}
