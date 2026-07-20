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
  const projectSegment = sanitizeFolderSegment(projectName, "");
  const normalizedBase = normalizeProjectYandexFolder(baseFolder, projectName);
  const parts = getYandexDiskFolderParts(normalizedBase);
  const lastSegment = parts[parts.length - 1] || "";
  if (lastSegment === brandSegment) return normalizedBase;
  if (projectSegment && lastSegment === projectSegment && projectSegment !== brandSegment) {
    return `disk:/${[...parts.slice(0, -1), brandSegment].join("/")}`;
  }
  return `${normalizedBase}/${brandSegment}`;
}

function getYandexDiskFolderParts(folder) {
  return String(folder || "")
    .replace(/^disk:\/?/i, "")
    .split("/")
    .map((part) => sanitizeFolderSegment(part, ""))
    .filter(Boolean);
}
