import {
  applyHookDraft,
  createHookDraft,
  getHookLibrary
} from "../domain/hook-library.js";
import { extractHooksFromImage, extractHooksFromPdf } from "../services/hook-ai.js";
import { escapeHtml } from "./infographic.js";

let hooksDraft = null;
let hooksImportError = "";

export function renderHooksPanel() {
  const library = getHookLibrary();
  return `
    <section class="embedded-panel hooks-panel">
      <div class="panel-head">
        <div><span class="eyebrow">Референсы</span><h2>Хуки</h2></div>
        <button id="apply-hook-draft" class="primary-btn" type="button" ${hooksDraft?.hooks?.length ? "" : "disabled"}>Использовать эти хуки</button>
      </div>
      <div class="hooks-layout">
        <section class="hooks-import">
          <div class="panel-head compact">
            <div><span class="eyebrow">Загрузка</span><h3>Добавить список хуков</h3></div>
          </div>
          <input id="hook-version-title" type="hidden" value="${escapeHtml(defaultHookTitle())}" />
          <label class="stacked-field">
            <span>Список хуков текстом</span>
            <textarea id="hook-text-input" class="textarea editor-textarea" placeholder="Каждый хук с новой строки"></textarea>
          </label>
          <div class="form-actions">
            <button id="parse-hook-text" class="secondary-btn" type="button">Проверить список</button>
          </div>
          <label class="stacked-field">
            <span>Скрин со списком хуков</span>
            <input id="hook-image-input" class="file-input" type="file" accept="image/*" />
          </label>
          <button id="extract-hook-image" class="secondary-btn" type="button">Распознать скрин</button>
          <label class="stacked-field">
            <span>PDF со списком хуков</span>
            <input id="hook-pdf-input" class="file-input" type="file" accept="application/pdf,.pdf" />
          </label>
          <button id="extract-hook-pdf" class="secondary-btn" type="button">Прочитать PDF</button>
          <small id="hook-import-status">После сохранения генератор будет использовать эти хуки как референс.</small>
        </section>
        <section class="hooks-preview">
          ${hooksDraft ? renderDraft(hooksDraft) : hooksImportError ? renderImportError(hooksImportError) : renderActiveSummary(library)}
        </section>
      </div>
    </section>
  `;
}

export function bindHooksEvents(root, refresh) {
  root.querySelector("#parse-hook-text")?.addEventListener("click", () => {
    hooksImportError = "";
    hooksDraft = createHookDraft({
      title: root.querySelector("#hook-version-title")?.value || "",
      sourceType: "text",
      text: root.querySelector("#hook-text-input")?.value || ""
    });
    refresh();
  });
  root.querySelector("#extract-hook-image")?.addEventListener("click", () => runHookImageExtract(root, refresh));
  root.querySelector("#extract-hook-pdf")?.addEventListener("click", () => runHookPdfExtract(root, refresh));
  root.querySelector("#apply-hook-draft")?.addEventListener("click", () => {
    if (!hooksDraft?.hooks?.length) return;
    applyHookDraft(getHookLibrary(), hooksDraft);
    hooksDraft = null;
    refresh();
  });
}

async function runHookPdfExtract(root, refresh) {
  const status = root.querySelector("#hook-import-status");
  const file = root.querySelector("#hook-pdf-input")?.files?.[0];
  if (!file) {
    if (status) status.textContent = "Сначала выберите PDF с хуками.";
    return;
  }
  try {
    if (status) status.textContent = "Читаем хуки из PDF...";
    hooksImportError = "";
    hooksDraft = await extractHooksFromPdf({
      title: root.querySelector("#hook-version-title")?.value || "",
      fileName: file.name,
      pdfData: await readHookFile(file)
    });
    refresh();
  } catch (error) {
    hooksDraft = null;
    hooksImportError = error.message || "Не удалось прочитать PDF.";
    refresh();
  }
}

async function runHookImageExtract(root, refresh) {
  const status = root.querySelector("#hook-import-status");
  const file = root.querySelector("#hook-image-input")?.files?.[0];
  if (!file) {
    if (status) status.textContent = "Сначала выберите скрин с хуками.";
    return;
  }
  try {
    if (status) status.textContent = "Распознаем хуки со скрина...";
    hooksImportError = "";
    hooksDraft = await extractHooksFromImage({
      title: root.querySelector("#hook-version-title")?.value || "",
      imageData: await readHookFile(file)
    });
    refresh();
  } catch (error) {
    hooksDraft = null;
    hooksImportError = error.message || "Не удалось извлечь хуки.";
    refresh();
  }
}

function renderDraft(draft) {
  return `
    <div class="hooks-draft">
      <span class="eyebrow">Предпросмотр</span>
      <h3>${draft.hooks.length} хуков готовы</h3>
      <small>${draft.duplicateCount ? `Убрали дублей: ${draft.duplicateCount}` : "Дубли не найдены"}</small>
      <div class="hook-chip-list">
        ${draft.hooks.map(renderHookChip).join("")}
      </div>
    </div>
  `;
}

function renderActiveSummary(library) {
  const active = library.versions.find((version) => version.status === "active");
  if (!active) return `<div class="hooks-empty">Загрузите список или скрин, чтобы генератор начал использовать ваши референсы хуков.</div>`;
  return `
    <div class="hooks-draft">
      <span class="eyebrow">Используются сейчас</span>
      <h3>${active.hooks.filter((hook) => hook.enabled !== false).length} хуков</h3>
      <small>Обновлено: ${formatHookDate(active.createdAt)}</small>
      <div class="hook-chip-list">${active.hooks.slice(0, 8).map(renderHookChip).join("")}</div>
    </div>
  `;
}

function renderImportError(message) {
  return `
    <div class="hooks-empty">
      <b>Новые хуки не распознаны.</b>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderHookChip(hook) {
  return `<div class="hook-chip"><b>${escapeHtml(hook.text)}</b></div>`;
}

function defaultHookTitle() {
  return `Хуки ${new Date().toLocaleDateString("ru-RU")}`;
}

function formatHookDate(value) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "дата не указана";
}

function readHookFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
