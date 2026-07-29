import { escapeHtml } from "./infographic.js";
import { uploadAudioAsset } from "../services/audio-assets.js";
import { getOperationForTarget, getOperationsForScope } from "../state/operation-status.js";
import { getOperationLabel, isUiOperationBusy, renderOperationStatus } from "./operation-status-view.js";
import { readFileAsDataUrl } from "./form-data.js";

export function renderAudioSettings({ audioLibrary, operations = {} }) {
  const scope = "global-audio";
  const busyOperation = getOperationsForScope(operations, scope).find(isUiOperationBusy);
  const isBusy = Boolean(busyOperation);
  return `
    ${busyOperation ? renderOperationStatus(busyOperation) : ""}
    ${renderAudioList(audioLibrary, operations, scope, isBusy)}
    <form id="audio-form" class="ops-form audio-upload-form">
      <label class="stacked-field">
        <span>Глобальные аудио файлы</span>
        <input name="audioFiles" class="file-input" type="file" accept="audio/*" multiple ${isBusy ? "disabled" : ""} />
      </label>
      <button class="secondary-btn" type="submit" ${isBusy ? "disabled" : ""}>Загрузить</button>
    </form>
  `;
}

export async function getAudioPayloads(form) {
  const files = [...(form.querySelector("input[type='file']")?.files || [])];
  const payloads = await Promise.all(files.map(readAudioFileAndUpload));
  form.reset();
  return payloads;
}

async function readAudioFileAndUpload(file) {
  return uploadAudioAsset(await readAudioFile(file));
}

function renderAudioList(items, operations, scope, isScopeBusy) {
  return `
    ${items.length ? renderAudioBulkControls(isScopeBusy) : ""}
    <div class="audio-list">
      ${items.map((audio) => renderAudioItem(audio, operations, scope, isScopeBusy)).join("")}
    </div>
  `;
}

function renderAudioBulkControls(isBusy) {
  return `
    <div class="audio-bulk-actions">
      <button class="secondary-btn" data-select-all-audio type="button" ${isBusy ? "disabled" : ""}>Выбрать все</button>
      <button class="danger-btn" data-delete-selected-audio type="button" ${isBusy ? "disabled" : ""}>Удалить выбранные</button>
    </div>
  `;
}

function renderAudioItem(audio, operations, scope, isScopeBusy) {
  const operation = getOperationForTarget(operations, { scope, targetId: audio.id });
  const isBusy = isScopeBusy || isUiOperationBusy(operation);
  return `
    <article class="audio-item ${isBusy ? "busy" : ""}">
      <input class="audio-select" data-audio-select="${audio.id}" type="checkbox" ${isBusy ? "disabled" : ""} aria-label="Выбрать аудио" />
      <div class="audio-icon">♪</div>
      <div>
        <strong>${escapeHtml(audio.title || audio.fileName || "Аудио файл")}</strong>
        <small>${escapeHtml(getOperationLabel(operation) || `Добавлено: ${formatDate(audio.createdAt)}`)}</small>
      </div>
      <button class="danger-icon" data-delete-audio="${audio.id}" type="button" ${isBusy ? "disabled" : ""} aria-label="Удалить аудио">×</button>
    </article>
  `;
}

async function readAudioFile(file) {
  return {
    title: file.name.replace(/\.[^.]+$/, "") || file.name,
    fileName: file.name,
    fileType: file.type || "audio",
    fileSize: file.size,
    fileData: await readFileAsDataUrl(file),
    createdAt: new Date().toISOString()
  };
}

function formatDate(value) {
  if (!value) return "не указана";
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}
