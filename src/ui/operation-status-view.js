import { isOperationActive } from "../state/operation-status.js";
import { escapeHtml } from "./infographic.js";

export function renderOperationStatus(operation) {
  if (!operation) return "";
  return `<small class="operation-status ${escapeHtml(operation.status || "")}">${escapeHtml(getOperationLabel(operation))}</small>`;
}

export function getOperationLabel(operation) {
  if (!operation) return "";
  const labels = {
    queued: "Операция в очереди...",
    uploading: operation.label || "Загружаем файл...",
    saving: operation.label || "Сохраняем в БД...",
    syncing: operation.label || "Синхронизируем с БД...",
    analyzing: operation.label || "Анализируем референс...",
    deleting: operation.label || "Удаляем...",
    done: operation.label || "Готово",
    failed: operation.error || "Операция не удалась"
  };
  return labels[operation.status] || operation.label || "";
}

export function isUiOperationBusy(operation) {
  return isOperationActive(operation);
}
