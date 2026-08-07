import { escapeHtml } from "./infographic.js";
import { getFormSnapshot } from "./form-data.js";
import { saveProjectAndRefreshAiMemory } from "./project-ai.js";

const formSelector = "#project-settings-form, #product-settings-form";
const drafts = new Map();
const savedSnapshots = new Map();
let globalSaveState = { phase: "idle", message: "Все изменения сохранены", updatedAt: "" };

export function renderPersistenceStatus(status = {}) {
  const view = getPersistenceStatusView(status);
  return `<small class="persistence-status ${view.tone}" data-persistence-status>${escapeHtml(view.label)}</small>`;
}

export function renderGlobalSaveControl() {
  return `
    <aside id="save-all-changes" class="save-all-control global-save" data-global-save aria-label="Сохранение изменений">
      <button class="primary-btn global-save-button" data-global-save-button type="button" disabled>Сохранить изменения</button>
      <span class="global-save-status" data-global-save-status role="status" aria-live="polite">${escapeHtml(globalSaveState.message)}</span>
    </aside>
  `;
}

export function bindGlobalSave(root, store) {
  root.querySelectorAll(formSelector).forEach((form) => {
    const key = getFormKey(form);
    if (!key) return;
    if (!drafts.has(key)) savedSnapshots.set(key, getFormSnapshot(form));
    const markDirty = () => {
      const payload = getFormSnapshot(form);
      if (arePayloadsEqual(payload, savedSnapshots.get(key))) drafts.delete(key);
      else drafts.set(key, { key, payload });
      globalSaveState = getActiveDrafts(store).length
        ? { phase: "dirty", message: "Есть несохраненные изменения", updatedAt: "" }
        : { phase: "saved", message: formatSavedMessage(store.getPersistenceStatus?.()), updatedAt: "" };
      updateGlobalSaveView(root, store);
    };
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveGlobalDrafts(root, store);
    });
  });
  root.querySelector("[data-global-save-button]")?.addEventListener("click", () => saveGlobalDrafts(root, store));
  if (!getActiveDrafts(store).length && ["dirty", "error"].includes(globalSaveState.phase)) {
    globalSaveState = { phase: "saved", message: formatSavedMessage(store.getPersistenceStatus?.()), updatedAt: "" };
  }
  updateGlobalSavePersistenceStatus(root, store.getPersistenceStatus?.() || {});
  updateGlobalSaveView(root, store);
}

export function updateGlobalSavePersistenceStatus(root, status = {}) {
  if (["dirty", "saving", "error"].includes(globalSaveState.phase)) return;
  if (status.status === "saved" || status.status === "local") {
    globalSaveState = { phase: "saved", message: formatSavedMessage(status), updatedAt: status.updatedAt || "" };
  }
  updateGlobalSaveView(root);
}

async function saveGlobalDrafts(root, store) {
  if (globalSaveState.phase === "saving") return;
  const activeDrafts = getActiveDrafts(store);
  if (!activeDrafts.length) return updateGlobalSaveView(root, store);
  globalSaveState = { phase: "saving", message: "Сохраняем изменения...", updatedAt: "" };
  updateGlobalSaveView(root, store);
  for (const draft of activeDrafts) {
    try {
      const { savedPayload, aiRefresh } = await saveDraft(store, draft, root);
      drafts.delete(draft.key);
      savedSnapshots.set(draft.key, savedPayload || draft.payload);
      aiRefresh?.then((patch) => syncAiMemorySnapshot(draft.key, patch));
    } catch (error) {
      globalSaveState = { phase: "error", message: `Ошибка сохранения: ${error.message || "повторите попытку"}`, updatedAt: "" };
      updateGlobalSaveView(root, store);
      return;
    }
  }
  const status = store.getPersistenceStatus?.() || {};
  globalSaveState = { phase: "saved", message: formatSavedMessage(status), updatedAt: status.updatedAt || "" };
  updateGlobalSaveView(root, store);
}

async function saveDraft(store, draft, root) {
  if (draft.key.startsWith("project:")) {
    const form = root.querySelector("#project-settings-form");
    if (!form) {
      const save = store.updateProjectSettingsRemote || store.updateProjectSettings;
      await save.call(store, draft.payload);
      return { savedPayload: draft.payload, aiRefresh: null };
    }
    return saveProjectAndRefreshAiMemory(form, store, {
      rethrowSaveError: true,
      savedSnapshot: savedSnapshots.get(draft.key)
    });
  }
  const save = store.updateProductRemote || store.updateProduct;
  await save.call(store, draft.payload);
  return { savedPayload: draft.payload, aiRefresh: null };
}

function syncAiMemorySnapshot(key, patch) {
  if (!patch) return;
  const saved = savedSnapshots.get(key) || {};
  savedSnapshots.set(key, { ...saved, ...patch });
  const draft = drafts.get(key);
  if (!draft) return;
  const payload = { ...draft.payload };
  Object.entries(patch).forEach(([field, value]) => {
    if (String(payload[field] ?? "") === String(saved[field] ?? "")) payload[field] = value;
  });
  drafts.set(key, { ...draft, payload });
}

function getActiveDrafts(store) {
  const state = store.getState();
  return [drafts.get(`project:${state.selectedProjectId}`), drafts.get(`product:${state.selectedProductId}`)].filter(Boolean);
}

function getFormKey(form) {
  const context = String(form.dataset.transientContext || "");
  return context.startsWith("project:") || context.startsWith("product:") ? context : "";
}

function updateGlobalSaveView(root, store = null) {
  const activeDrafts = store ? getActiveDrafts(store) : [];
  const button = root.querySelector("[data-global-save-button]");
  const status = root.querySelector("[data-global-save-status]");
  if (!button || !status) return;
  const isSaving = globalSaveState.phase === "saving";
  const hasError = globalSaveState.phase === "error";
  button.disabled = isSaving || (!activeDrafts.length && !hasError);
  button.textContent = isSaving ? "Сохраняем..." : hasError ? "Повторить сохранение" : "Сохранить изменения";
  button.setAttribute("aria-busy", String(isSaving));
  status.textContent = activeDrafts.length && globalSaveState.phase === "saved"
    ? "Есть несохраненные изменения"
    : globalSaveState.message;
  status.dataset.tone = globalSaveState.phase;
}

function arePayloadsEqual(left = {}, right = {}) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => String(left[key] ?? "") === String(right[key] ?? ""));
}

function formatSavedMessage(status = {}) {
  if (status.status === "local") return "Сохранено локально";
  if (status.updatedAt) {
    const date = new Date(status.updatedAt);
    if (!Number.isNaN(date.getTime())) {
      return `Сохранено в БД • ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
    }
  }
  return status.status === "saved" ? "Сохранено в БД" : "Изменения сохранены";
}

export function updatePersistenceStatusView(root, status) {
  const node = root.querySelector("[data-persistence-status]");
  if (!node) return;
  const view = getPersistenceStatusView(status);
  node.className = `persistence-status ${view.tone}`;
  node.textContent = view.label;
}

function getPersistenceStatusView(status = {}) {
  const tone = ["dirty", "saved", "saving", "loading", "error", "local"].includes(status.status) ? status.status : "local";
  const labels = {
    dirty: "Есть изменения",
    saving: "Сохраняем в БД",
    saved: "Сохранено в БД",
    loading: "Загружаем из БД",
    error: "Ошибка сохранения",
    local: "Локальное сохранение"
  };
  return { tone, label: status.message || labels[tone] };
}
