import { listYandexDiskFolders } from "../services/yandex-disk.js";

const defaultYandexRoot = "disk:/ВИДЕО";
const folderLevelMax = 120;

export function bindYandexFolderPickers(root) {
  root.querySelectorAll("[data-yandex-folder-picker]").forEach((picker) => {
    initYandexFolderPicker(picker);
  });
}

async function initYandexFolderPicker(picker) {
  const rootPath = picker.dataset.yandexRoot || defaultYandexRoot;
  const valueInput = picker.querySelector("[data-yandex-folder-value]");
  const levels = picker.querySelector("[data-yandex-folder-levels]");
  const status = picker.closest(".stacked-field")?.querySelector("[data-yandex-folder-status]");
  if (!valueInput || !levels) return;

  const selectedPath = normalizeYandexPickerPath(valueInput.value || rootPath);
  valueInput.value = selectedPath;
  levels.innerHTML = "";
  setYandexPickerStatus(status, "Загружаем уровни папок...");

  try {
    await renderYandexFolderLevel({ levels, valueInput, status, rootPath, parentPath: rootPath, level: 0, chain: buildYandexPathChain(rootPath, selectedPath) });
  } catch (error) {
    setYandexPickerStatus(status, error.message || "Не удалось загрузить папки");
  }
}

async function renderYandexFolderLevel({ levels, valueInput, status, rootPath, parentPath, level, chain }) {
  const payload = await listYandexDiskFolders({ root: parentPath, depth: 1, max: folderLevelMax });
  const folders = normalizeYandexChildFolders(payload.folders || [], parentPath);
  const selectedPath = chain[level + 1] || "";
  const options = selectedPath && !folders.some((folder) => folder.path === selectedPath)
    ? [{ path: selectedPath, name: getYandexFolderName(selectedPath), label: getYandexFolderName(selectedPath) }, ...folders]
    : folders;

  if (!options.length && level > 0) {
    setYandexPickerStatus(status, `Выбрано: ${valueInput.value}`);
    return;
  }

  const row = document.createElement("div");
  row.className = "yandex-folder-level";
  row.dataset.yandexFolderLevel = String(level);
  row.innerHTML = `
    <small>${level === 0 ? "Уровень 1" : `Уровень ${level + 1}`}</small>
    <select class="select" data-yandex-folder-level-select></select>
  `;
  const select = row.querySelector("select");
  select.append(createYandexOption(parentPath, level === 0 ? rootPath : "Оставить этот уровень"));
  options.forEach((folder) => select.append(createYandexOption(folder.path, folder.name || folder.label || getYandexFolderName(folder.path))));
  select.value = selectedPath || parentPath;
  levels.append(row);

  select.addEventListener("change", () => {
    valueInput.value = select.value;
    removeYandexDeeperLevels(levels, level);
    setYandexPickerStatus(status, `Выбрано: ${select.value}`);
    if (select.value !== parentPath) {
      renderYandexFolderLevel({ levels, valueInput, status, rootPath, parentPath: select.value, level: level + 1, chain: [rootPath, select.value] });
    }
  });

  valueInput.value = selectedPath || valueInput.value || rootPath;
  setYandexPickerStatus(status, payload.truncated ? `Показаны первые ${options.length} папок уровня` : `Уровень ${level + 1}: ${options.length} папок`);

  if (selectedPath && selectedPath !== parentPath) {
    await renderYandexFolderLevel({ levels, valueInput, status, rootPath, parentPath: selectedPath, level: level + 1, chain });
  }
}

function normalizeYandexChildFolders(folders, parentPath) {
  return folders
    .map((folder) => typeof folder === "string" ? { path: folder, name: getYandexFolderName(folder) } : folder)
    .filter((folder) => folder.path && folder.path !== parentPath);
}

function buildYandexPathChain(rootPath, selectedPath) {
  const normalizedRoot = normalizeYandexPickerPath(rootPath);
  const normalizedSelected = normalizeYandexPickerPath(selectedPath);
  if (!normalizedSelected.startsWith(`${normalizedRoot}/`)) return [normalizedRoot];
  const parts = normalizedSelected.slice(normalizedRoot.length + 1).split("/").filter(Boolean);
  return parts.reduce((chain, part) => {
    chain.push(`${chain[chain.length - 1]}/${part}`);
    return chain;
  }, [normalizedRoot]);
}

function removeYandexDeeperLevels(levels, level) {
  levels.querySelectorAll("[data-yandex-folder-level]").forEach((row) => {
    if (Number(row.dataset.yandexFolderLevel) > level) row.remove();
  });
}

function createYandexOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
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
