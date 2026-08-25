import { getProductContentFocus } from "./product-content-focus.js";
import { formatBenefitEcosystemInstruction, getBenefitEcosystemSubjects } from "./benefit-ecosystem.js";

const contentLayers = [
  {
    id: "life-pain",
    label: "боль из жизни",
    topic: "",
    hook: "",
    question: "Где человек сталкивается с этой болью в обычном дне?"
  },
  {
    id: "daily-hack",
    label: "бытовой лайфхак",
    topic: "",
    hook: "",
    question: "Какой простой совет можно дать рядом с продуктом без прямой продажи?"
  },
  {
    id: "routine-mistake",
    label: "ошибка в рутине",
    topic: "",
    hook: "",
    question: "Какая бытовая ошибка усиливает боль или мешает решению?"
  },
  {
    id: "adjacent-topic",
    label: "соседняя тема",
    topic: "",
    hook: "",
    question: "Какая смежная привычка, ситуация или контекст влияет на боль?"
  },
  {
    id: "useful-fact",
    label: "полезный факт",
    topic: "",
    hook: "",
    question: "Какой проверяемый факт из продукта или ниши объясняет жизненную ситуацию?"
  },
  {
    id: "myth-to-life",
    label: "миф и реальность",
    topic: "",
    hook: "",
    question: "Какой бытовой миф мешает человеку понять боль и выбрать следующий шаг?"
  }
];

export function createContentLayer({ project, product, existingJobs = [] }) {
  const layer = pickLeastRecentLayer(existingJobs);
  const subject = getLayerSubject(project, product, existingJobs);
  return {
    ...layer,
    subject,
    topic: "",
    hook: "",
    instruction: [
      `Слой анализа: ${layer.label}.`,
      layer.question,
      "Тема может идти рядом с продуктом: боли, привычки, лайфхаки, советы, ошибки и соседние жизненные ситуации.",
      formatBenefitEcosystemInstruction({ project, product }),
      "Продукт показывать как возможный следующий шаг, а не как единственную тему."
    ].join(" ")
  };
}

function pickLeastRecentLayer(existingJobs) {
  const recentLayerIds = existingJobs
    .map((job, index) => ({
      id: job.contentLayerId || job.diversitySlot?.contentLayer?.id || "",
      index,
      createdAt: Date.parse(job.createdAt || "") || 0
    }))
    .sort((left, right) => right.createdAt - left.createdAt || right.index - left.index)
    .map((item) => item.id)
    .filter(Boolean);
  return contentLayers.reduce((oldest, layer) => {
    const layerIndex = recentLayerIds.indexOf(layer.id);
    const oldestIndex = recentLayerIds.indexOf(oldest.id);
    if (layerIndex < 0) return oldestIndex < 0 ? oldest : layer;
    if (oldestIndex < 0) return oldest;
    return layerIndex > oldestIndex ? layer : oldest;
  }, contentLayers[0]);
}

export function getContentLayerInstruction(layer) {
  if (!layer) return "";
  return [
    `СЛОЙ АНАЛИЗА: ${layer.label}.`,
    `Вопрос слоя: ${layer.question}.`,
    "Ищи не только прямую рекламу продукта, но и темы вокруг: бытовые боли, лайфхаки, советы, привычки, ошибки, мифы и смежные ситуации.",
    layer.instruction?.match(/Большая цель за продуктом:[^]+?рамкой всей темы\./)?.[0] || "",
    "Ролик должен быть полезен сам по себе; продукт появляется как мягкое решение или контекст."
  ].filter(Boolean).join(" ");
}

function getLayerSubject(project, product, existingJobs) {
  const focus = getProductContentFocus({ project, product });
  const subjects = uniqueLayerSubjects([
    ...layerListItems(product.pains),
    ...layerListItems(project.keyScenarios),
    ...focus.list,
    ...layerListItems(product.facts),
    ...layerListItems(project.audiencePains),
    ...getBenefitEcosystemSubjects({ project, product }),
    product.offer,
    project.projectTheme,
    product.name
  ]);
  const fallback = subjects[0] || "жизненная ситуация аудитории";
  const usedSubjects = new Set(existingJobs
    .map((job) => normalizeLayerSubject(job.diversitySlot?.contentLayer?.subject || ""))
    .filter(Boolean));
  return subjects.find((subject) => !usedSubjects.has(normalizeLayerSubject(subject)))
    || subjects[existingJobs.length % subjects.length]
    || fallback;
}

function uniqueLayerSubjects(items) {
  const seen = new Set();
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeLayerSubject(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function layerListItems(value) {
  if (Array.isArray(value)) return value.flatMap(layerListItems);
  return String(value || "").split(/\n|;|,/).map((item) => item.trim()).filter(Boolean);
}

function normalizeLayerSubject(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}
