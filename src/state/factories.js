import { isDesignReference } from "../domain/references.js";

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
    layoutType: payload.layoutType || "symptoms",
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
    offer: payload.offer || "оффер продукта",
    components: payload.components || "",
    pains: asList(payload.pains || "ключевая боль"),
    facts: asList(payload.facts || "только проверяемые факты"),
    useCases: asList(payload.useCases || payload.pains || "жизненная ситуация, где продукт уместен"),
    proofPoints: asList(payload.proofPoints || payload.facts || "проверяемая деталь без магии"),
    visualAnchors: asList(payload.visualAnchors || payload.components || "ритуал, предмет или сцена, связанные с продуктом"),
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
    references: references.length ? references : [createReferenceEntity({ title: "Базовый стиль проекта" })],
    audioLibrary: getAudioLibrary(project, legacyAudios),
    avatarCandidates: project.avatarCandidates || [],
    characters: project.characters?.length
      ? project.characters.map(ensureCharacterAssets)
      : [ensureCharacterAssets({ id: createId("char"), name: "Новый персонаж", status: "draft", prompt: "стабильный персонаж проекта" })]
  };
}

function ensureCharacterAssets(character) {
  return {
    ...character,
    avatarVideos: (character.avatarVideos || []).map(ensureAvatarVideoAssets)
  };
}

function ensureAvatarVideoAssets(video) {
  return {
    ...video,
    alphaVideoUrl: video.alphaVideoUrl || "",
    alphaStatus: video.alphaStatus || "idle",
    alphaFailMsg: video.alphaFailMsg || "",
    overlay: video.overlay || { x: 50, y: 70, scale: 100, opacity: 100 }
  };
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
    pains: asList(product.pains || product.audience || "ключевая боль"),
    facts: asList(product.facts || "только проверяемые факты"),
    useCases: asList(product.useCases || product.pains || "жизненная ситуация, где продукт уместен"),
    proofPoints: asList(product.proofPoints || product.facts || "проверяемая деталь без магии"),
    visualAnchors: asList(product.visualAnchors || product.components || "ритуал, предмет или сцена, связанные с продуктом"),
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
