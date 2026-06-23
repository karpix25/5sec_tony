import { isDesignReference } from "../domain/references.js";
import { normalizeCtaOverlay } from "../domain/cta-overlay.js";
import { normalizeProjectAutomation } from "../domain/project-automation.js";

export const defaultGenerationBrief = {
  topic: "",
  hook: "",
  format: "",
  pointCount: "",
  visualObject: "",
  cta: "",
  salesLevel: "",
  notes: ""
};

const ppmViralReference = {
  id: "viral-pink-symptoms",
  type: "design",
  title: "Viral symptoms poster",
  promptComment: "Использовать только дизайн: вертикальная композиция, иерархия, glow-хук, плотность, палитра и safe zone.",
  takeaways: "Вертикальный 9:16. Весь текст и ключевые объекты внутри safe zone. Верхний хук в яркой розовой glow-плашке: белые жирные буквы с черной обводкой. Ниже крупный serif-тезис с большой цифрой или сильным словом. Слева плотная колонка коротких пунктов с 3D-иконками. Справа крупный 3D-объект по теме. Нижнюю часть не перегружать: аватар будет наложен отдельно в видео.",
  avoidCopy: "Не копировать текст, смысл, симптомы, чужого человека, чужой продукт, логотипы и обещания. Не встраивать аватара в картинку.",
  layoutType: "symptoms",
  palette: "нежный розово-персиковый фон, яркий hot-pink glow под верхним хуком, темный контур текста, оливково-зеленые или teal-акценты под финтех-иконки",
  fontStyle: "верхний заголовок: крупный белый bold sans с черной обводкой, сильной тенью и розовым свечением; второй тезис: крупный контрастный serif как журнальный заголовок",
  headlineStyle: "верхний заголовок: крупный белый bold sans, черная обводка, сильная тень и розовое свечение; второй тезис: крупный контрастный serif, как журнальный заголовок",
  avatarPlacement: "",
  textDensity: "high",
  visualObject: "крупный 3D-объект оплаты: карта, глобус, терминал, экран подписки или связка сервисов"
};

const yandexVideoRoot = "disk:/ВИДЕО/5сек";
const yandexExportLabelRoot = "Yandex Disk / 5сек";

export function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createReferenceEntity(payload = {}) {
  return {
    id: payload.id || createId("ref"),
    type: payload.type || "design",
    title: payload.title || "Новый дизайн-референс",
    promptComment: payload.promptComment || "",
    takeaways: payload.takeaways || "",
    avoidCopy: payload.avoidCopy || "Не копировать текст, смысл, чужие утверждения, чужой продукт, логотипы и персонажа.",
    layoutType: payload.layoutType || "infographic-template",
    palette: payload.palette || "",
    fontStyle: payload.fontStyle || payload.headlineStyle || "",
    headlineStyle: payload.headlineStyle || "",
    avatarPlacement: "",
    textDensity: payload.textDensity || "medium",
    visualObject: payload.visualObject || "",
    imageName: payload.imageName || "",
    imageData: payload.imageData || "",
    createdAt: payload.createdAt || new Date().toISOString()
  };
}

export function createAudioEntity(payload = {}) {
  return {
    id: payload.id || createId("audio"),
    title: payload.title || payload.fileName || "Новый аудио-файл",
    mood: payload.mood || "файл аудио",
    duration: payload.duration || "5 sec",
    fileName: payload.fileName || "",
    fileType: payload.fileType || "",
    fileSize: payload.fileSize || 0,
    fileData: payload.fileData || "",
    createdAt: payload.createdAt || new Date().toISOString()
  };
}

export function createProductEntity(projectId, name, payload = {}) {
  return {
    id: payload.id || createId("product"),
    projectId,
    name,
    description: payload.description || "",
    offer: payload.offer || "",
    components: payload.components || "",
    pains: asList(payload.pains || ""),
    facts: asList(payload.facts || ""),
    forbidden: asList(payload.forbidden || "нельзя обещать недоказанный результат"),
    references: payload.references || []
  };
}

export function ensureProjectAssets(project) {
  const legacyAudios = (project.references || []).filter((item) => item.type === "audio");
  const projectReferences = ensureProjectReferenceDefaults(project);
  const references = projectReferences
    .filter(isDesignReference)
    .map(createReferenceEntity);
  return {
    ...project,
    companyInfo: project.companyInfo || "",
    companyAudience: project.companyAudience || "",
    projectTheme: project.projectTheme || "",
    niche: project.niche || "",
    keyScenarios: project.keyScenarios || "",
    audiencePains: project.audiencePains || "",
    audienceDesires: project.audienceDesires || "",
    audienceObjections: project.audienceObjections || "",
    allowedTriggers: project.allowedTriggers || "",
    forbiddenTriggers: project.forbiddenTriggers || "",
    hookAggression: project.hookAggression || "Средняя",
    contentRestrictions: project.contentRestrictions || "",
    toneOfVoice: project.toneOfVoice || "спокойный экспертный",
    restrictions: project.restrictions || "Не обещать лечение, диагнозы, гарантированный результат или обход правил.",
    exportFolder: normalizeProjectExportFolder(project.exportFolder, project.name),
    yandexDiskFolder: normalizeProjectYandexFolder(project.yandexDiskFolder, project.name),
    dailyLimit: normalizeAssetLimit(project.dailyLimit, 20),
    usedToday: normalizeAssetUsage(project.usedToday),
    projectLimit: normalizeAssetLimit(project.projectLimit, 500),
    usedTotal: normalizeAssetUsage(project.usedTotal),
    automation: normalizeProjectAutomation(project.automation),
    ctaOverlay: normalizeCtaOverlay(project.ctaOverlay),
    avatarRoundRobinIndex: normalizeFactoryRoundRobinIndex(project.avatarRoundRobinIndex),
    references: references.length ? references : [createReferenceEntity({ title: "Базовый стиль проекта" })],
    audioLibrary: getAudioLibrary(project, legacyAudios),
    avatarCandidates: project.avatarCandidates || [],
    designReferenceCandidates: project.designReferenceCandidates || [],
    characters: project.characters?.length
      ? project.characters.map(ensureCharacterAssets)
      : [ensureCharacterAssets({ id: createId("char"), name: "Новый персонаж", status: "draft", prompt: "стабильный персонаж проекта" })]
  };
}

function normalizeAssetLimit(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(10000, Math.max(1, Math.round(number)));
}

function normalizeAssetUsage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

export function defaultProjectYandexDiskFolder(projectName = "Проект") {
  return `${yandexVideoRoot}/${sanitizeFolderSegment(projectName)}`;
}

export function defaultProjectExportFolder(projectName = "Проект") {
  return `${yandexExportLabelRoot} / ${sanitizeFolderSegment(projectName)}`;
}

export function normalizeProjectYandexFolder(value, projectName = "Проект") {
  const raw = String(value || "").trim();
  if (/^disk:\//i.test(raw)) {
    return normalizeDiskVideoFolder(raw, projectName);
  }
  const legacy = raw.match(/^Yandex Disk\s*\/\s*Anton\s*\/\s*(.+)$/i);
  if (legacy) {
    return normalizeDiskVideoFolder(`disk:/ВИДЕО/${legacy[1]}`, projectName);
  }
  const modern = raw.match(/^Yandex Disk\s*\/\s*5сек\s*\/\s*(.+)$/i);
  if (modern) {
    return normalizeDiskVideoFolder(`${yandexVideoRoot}/${modern[1]}`, projectName);
  }
  return defaultProjectYandexDiskFolder(projectName);
}

export function normalizeProjectExportFolder(value, projectName = "Проект") {
  const raw = String(value || "").trim();
  if (!raw) return defaultProjectExportFolder(projectName);
  const normalizedDiskPath = normalizeProjectYandexFolder(raw, projectName);
  if (/^disk:\//i.test(raw) || /^Yandex Disk\s*\//i.test(raw)) {
    return buildExportLabelFromDiskFolder(normalizedDiskPath);
  }
  return raw;
}

export function buildAvatarYandexDiskFolder(baseFolder, avatarName = "") {
  return `${normalizeProjectYandexFolder(baseFolder)}/${sanitizeFolderSegment(avatarName, "Без аватара")}`;
}

function ensureCharacterAssets(character) {
  return {
    ...character,
    isActive: character.isActive !== false,
    avatarVideoRoundRobinIndex: normalizeFactoryRoundRobinIndex(character.avatarVideoRoundRobinIndex),
    avatarVideos: (character.avatarVideos || []).map(ensureAvatarVideoAssets)
  };
}

function ensureAvatarVideoAssets(video) {
  return {
    ...video,
    alphaVideoUrl: video.alphaVideoUrl || "",
    alphaStatus: video.alphaStatus || "idle",
    alphaFailMsg: video.alphaFailMsg || "",
    isActive: video.isActive !== false,
    overlay: video.overlay || { x: 50, y: 98, scale: 96, opacity: 100 },
    ctaOverlay: normalizeCtaOverlay(video.ctaOverlay)
  };
}

function normalizeFactoryRoundRobinIndex(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

function ensureProjectReferenceDefaults(project) {
  const references = project.references || [];
  if (!isPpmLikeProject(project) || references.some((item) => item.id === ppmViralReference.id)) return references;
  return [ppmViralReference, ...references];
}

function isPpmLikeProject(project) {
  const source = `${project.id || ""} ${project.name || ""} ${project.projectTheme || ""} ${project.companyInfo || ""}`.toLowerCase();
  return /(^|\s)ppm(\s|$)|ппм|плати по миру|оплат[аы] зарубеж/.test(source);
}

export function ensureProductAssets(product) {
  return {
    ...product,
    description: product.description || "",
    components: product.components || "",
    pains: asList(product.pains || product.audience || ""),
    facts: asList(product.facts || ""),
    forbidden: asList(product.forbidden || "нельзя обещать недоказанный результат"),
    references: product.references || []
  };
}

export function ensureGenerationBrief(brief = {}) {
  return { ...defaultGenerationBrief, ...brief };
}

function getAudioLibrary(project, legacyAudios) {
  if (Array.isArray(project.audioLibrary)) return project.audioLibrary.map(createAudioEntity);
  if (legacyAudios.length) return legacyAudios.map((item) => createAudioEntity({ id: item.id, title: item.title, mood: "legacy", duration: "5 sec" }));
  return [createAudioEntity({ title: "Default audio", mood: "нейтрально", duration: "5 sec" })];
}

function asList(value) {
  if (Array.isArray(value)) return value;
  return String(value).split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function normalizeDiskVideoFolder(value, projectName = "Проект") {
  const normalized = `disk:/${String(value || "")
    .replace(/^disk:\/*/i, "")
    .split("/")
    .map((part) => sanitizeFolderSegment(part, ""))
    .filter(Boolean)
    .join("/")}`;
  const suffix = normalized.replace(/^disk:\/?/, "").split("/").filter(Boolean);
  const withoutReady = suffix.filter((part) => !/^готовые$/i.test(part));
  if (!withoutReady.length) return defaultProjectYandexDiskFolder(projectName);
  if (withoutReady[0] !== "ВИДЕО") {
    return defaultProjectYandexDiskFolder(projectName);
  }
  if (withoutReady[1] === "5сек") {
    return `disk:/${withoutReady.join("/")}`;
  }
  return `disk:/ВИДЕО/5сек/${withoutReady.slice(1).join("/") || sanitizeFolderSegment(projectName)}`;
}

function buildExportLabelFromDiskFolder(folder) {
  const suffix = String(folder || "")
    .replace(/^disk:\/ВИДЕО\/5сек\/?/i, "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ");
  return suffix ? `${yandexExportLabelRoot} / ${suffix}` : yandexExportLabelRoot;
}

function sanitizeFolderSegment(value, fallback = "Проект") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ");
  return cleaned || fallback;
}
