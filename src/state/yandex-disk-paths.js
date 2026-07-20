import { normalizeProjectYandexFolder, sanitizeFolderSegment } from "./factories.js";

export function buildGenerationYandexDiskFolder(baseFolder, options = {}) {
  const brandFolder = resolveGenerationBrandYandexFolder(baseFolder, options);
  return [
    brandFolder,
    sanitizeFolderSegment(options.avatarName, "Без аватара"),
    sanitizeFolderSegment(options.productName, "Без продукта")
  ].join("/");
}

function resolveGenerationBrandYandexFolder(baseFolder, options = {}) {
  const projectName = options.projectName || "Проект";
  const brandSegment = sanitizeFolderSegment(options.brandName || projectName, "Бренд");
  const normalizedBase = normalizeProjectYandexFolder(baseFolder, projectName);
  const parts = getYandexDiskFolderParts(normalizedBase);
  if (isExplicitBrandFolder(parts)) return normalizedBase;
  return `${normalizedBase}/${brandSegment}`;
}

function isExplicitBrandFolder(parts) {
  return parts.length > 2 && parts[0] === "ВИДЕО" && parts[1] === "5сек";
}

function getYandexDiskFolderParts(folder) {
  return String(folder || "")
    .replace(/^disk:\/?/i, "")
    .split("/")
    .map((part) => sanitizeFolderSegment(part, ""))
    .filter(Boolean);
}
