import { listYandexDiskFolders } from "../services/yandex-disk.js";

const defaultYandexRoot = "disk:/ВИДЕО";
const folderTreeMax = 500;
const folderTreeDepth = 4;
const yandexFolderTreeCache = new Map();

export function bindYandexFolderPickers(root) {
  root.querySelectorAll("[data-yandex-folder-picker]").forEach((picker) => {
    initYandexFolderPicker(picker);
  });
}

async function initYandexFolderPicker(picker) {
  const rootPath = picker.dataset.yandexRoot || defaultYandexRoot;
  const valueInput = picker.querySelector("[data-yandex-folder-value]");
  const tree = picker.querySelector("[data-yandex-folder-levels]");
  const status = picker.closest(".stacked-field")?.querySelector("[data-yandex-folder-status]");
  if (!valueInput || !tree) return;

  const selectedPath = normalizeYandexPickerPath(valueInput.value || rootPath);
  valueInput.value = selectedPath;
  tree.innerHTML = "";

  try {
    const payload = await getCachedYandexFolderTree(rootPath, status);
    renderYandexFolderTree({ tree, valueInput, status, rootPath, selectedPath, payload });
  } catch (error) {
    setYandexPickerStatus(status, error.message || "Не удалось загрузить папки");
  }
}

async function getCachedYandexFolderTree(rootPath, status) {
  const cacheKey = normalizeYandexPickerPath(rootPath);
  const cached = yandexFolderTreeCache.get(cacheKey);
  if (cached?.payload) return cached.payload;
  if (!cached) {
    setYandexPickerStatus(status, "Загружаем папки...");
    const request = listYandexDiskFolders({ root: rootPath, depth: folderTreeDepth, max: folderTreeMax })
      .then((payload) => {
        yandexFolderTreeCache.set(cacheKey, { payload });
        return payload;
      })
      .catch((error) => {
        yandexFolderTreeCache.delete(cacheKey);
        throw error;
      });
    yandexFolderTreeCache.set(cacheKey, { request });
    return request;
  }
  return cached.request;
}

function renderYandexFolderTree({ tree, valueInput, status, rootPath, selectedPath, payload }) {
  const folders = normalizeYandexTreeFolders(payload.folders || [], rootPath, selectedPath);
  const select = document.createElement("select");
  select.className = "select";
  select.dataset.yandexFolderTreeSelect = "";
  folders.forEach((folder) => select.append(createYandexOption(folder.path, getYandexTreeLabel(folder, rootPath))));
  select.value = folders.some((folder) => folder.path === selectedPath) ? selectedPath : rootPath;
  valueInput.value = select.value;
  select.addEventListener("change", () => {
    valueInput.value = select.value;
    setYandexPickerStatus(status, `Выбрано: ${select.value}`);
  });
  tree.append(select);
  const shown = folders.length;
  setYandexPickerStatus(status, payload.truncated ? `Показаны первые ${shown} папок. Выбрано: ${valueInput.value}` : `Папок в списке: ${shown}. Выбрано: ${valueInput.value}`);
}

function normalizeYandexTreeFolders(folders, rootPath, selectedPath) {
  const normalizedRoot = normalizeYandexPickerPath(rootPath);
  const normalizedSelected = normalizeYandexPickerPath(selectedPath);
  const items = folders
    .map((folder) => typeof folder === "string" ? { path: folder } : folder)
    .map((folder) => ({ ...folder, path: normalizeYandexPickerPath(folder.path || "") }))
    .filter((folder) => folder.path && (folder.path === normalizedRoot || folder.path.startsWith(`${normalizedRoot}/`)));
  if (!items.some((folder) => folder.path === normalizedRoot)) items.unshift({ path: normalizedRoot, depth: 0, name: getYandexFolderName(normalizedRoot), label: normalizedRoot });
  if (normalizedSelected && !items.some((folder) => folder.path === normalizedSelected)) items.push({ path: normalizedSelected, name: getYandexFolderName(normalizedSelected) });
  return dedupeYandexFolders(items).sort((a, b) => a.path.localeCompare(b.path, "ru"));
}

function dedupeYandexFolders(folders) {
  const seen = new Set();
  return folders.filter((folder) => {
    if (seen.has(folder.path)) return false;
    seen.add(folder.path);
    return true;
  });
}

function createYandexOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function getYandexTreeLabel(folder, rootPath) {
  const depth = getYandexFolderDepth(folder.path, rootPath);
  if (depth === 0) return folder.label || folder.path;
  const label = folder.label || getRelativeYandexPath(folder.path, rootPath);
  return `${"— ".repeat(depth)}${label}`;
}

function getRelativeYandexPath(path, rootPath) {
  const normalizedRoot = normalizeYandexPickerPath(rootPath);
  return normalizeYandexPickerPath(path).slice(normalizedRoot.length + 1);
}

function getYandexFolderDepth(path, rootPath) {
  const relative = getRelativeYandexPath(path, rootPath);
  return relative ? relative.split("/").filter(Boolean).length : 0;
}

function getYandexFolderName(path) {
  return String(path || "").split("/").filter(Boolean).pop() || path;
}

function normalizeYandexPickerPath(value) {
  return String(value || defaultYandexRoot).replace(/\/+$/, "");
}

function setYandexPickerStatus(status, text) {
  if (status) status.textContent = text;
}
