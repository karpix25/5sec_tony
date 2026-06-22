import { getProductContentFocus } from "./product-content-focus.js";

const contentLayers = [
  {
    id: "life-pain",
    label: "боль из жизни",
    topic: "Ситуация из жизни, где боль уже видна",
    hook: "Вы узнаете это состояние раньше, чем проблему",
    question: "Где человек сталкивается с этой болью в обычном дне?"
  },
  {
    id: "daily-hack",
    label: "бытовой лайфхак",
    topic: "Маленький бытовой шаг, который снижает напряжение",
    hook: "Один простой шаг часто меняет больше, чем кажется",
    question: "Какой простой совет можно дать рядом с продуктом без прямой продажи?"
  },
  {
    id: "routine-mistake",
    label: "ошибка в рутине",
    topic: "Незаметная ошибка в привычке, которая портит результат",
    hook: "Вы можете делать все правильно и терять эффект на мелочи",
    question: "Какая бытовая ошибка усиливает боль или мешает решению?"
  },
  {
    id: "adjacent-topic",
    label: "соседняя тема",
    topic: "Соседняя тема вокруг проблемы, о которой полезно знать",
    hook: "Проблема может быть не там, где вы ее ищете",
    question: "Какая смежная привычка, ситуация или контекст влияет на боль?"
  },
  {
    id: "useful-fact",
    label: "полезный факт",
    topic: "Полезный факт, который хочется сохранить",
    hook: "Этот факт объясняет знакомое ощущение",
    question: "Какой проверяемый факт из продукта или ниши объясняет жизненную ситуацию?"
  },
  {
    id: "myth-to-life",
    label: "миф и реальность",
    topic: "Популярный миф, который мешает спокойно выбрать решение",
    hook: "Популярное объяснение часто сбивает с толку",
    question: "Какой бытовой миф мешает человеку понять боль и выбрать следующий шаг?"
  }
];

export function createContentLayer({ project, product, existingJobs = [] }) {
  const used = new Set(existingJobs.map((job) => job.contentLayerId || job.diversitySlot?.contentLayer?.id || ""));
  const layer = contentLayers.find((item) => !used.has(item.id)) || contentLayers[existingJobs.length % contentLayers.length];
  const subject = getLayerSubject(project, product, existingJobs);
  return {
    ...layer,
    subject,
    topic: `${layer.topic}: ${subject}`,
    hook: `${layer.hook}: ${subject}`,
    instruction: [
      `Слой анализа: ${layer.label}.`,
      layer.question,
      "Тема может идти рядом с продуктом: боли, привычки, лайфхаки, советы, ошибки и соседние жизненные ситуации.",
      "Продукт показывать как возможный следующий шаг, а не как единственную тему."
    ].join(" ")
  };
}

export function getContentLayerInstruction(layer) {
  if (!layer) return "";
  return [
    `СЛОЙ АНАЛИЗА: ${layer.label}.`,
    `Вопрос слоя: ${layer.question}.`,
    "Ищи не только прямую рекламу продукта, но и темы вокруг: бытовые боли, лайфхаки, советы, привычки, ошибки, мифы и смежные ситуации.",
    "Ролик должен быть полезен сам по себе; продукт появляется как мягкое решение или контекст."
  ].join(" ");
}

function getLayerSubject(project, product, existingJobs) {
  const focus = getProductContentFocus({ project, product });
  const subjects = uniqueLayerSubjects([
    ...layerListItems(product.pains),
    ...layerListItems(project.keyScenarios),
    ...focus.list,
    ...layerListItems(product.facts),
    ...layerListItems(project.audiencePains),
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
