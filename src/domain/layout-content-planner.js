import { getReferenceFormatSignal, getReferenceFormatSource } from "./reference-format.js";

const defaultLayout = {
  layoutType: "saveable-note",
  contentShape: "headline, subhead, 3-5 short blocks",
  imageTextInstruction: "Сделай короткую полезную карточку с одним сильным тезисом и несколькими разными смысловыми блоками."
};

const layoutRules = [
  {
    test: /ranking[_-]?leaderboard|leaderboard|top[- ]?chart|top\s*\d+|топ\s*\d+|рейтинг|ранг|rank|мест[ао]|value label/i,
    layoutType: "ranking_leaderboard",
    contentShape: "heroTitle, sourceBar, rankedItems[8-21]{rank,valueLabel,imageSlot,caption}, lowerMiniRanks",
    imageTextInstruction: "Оформи как плотный leaderboard/top chart: крупный верхний title, служебная строка/легенда, много повторяемых вертикальных rank-card или bar-card блоков, номера мест, короткие value labels, светящиеся рамки/разделители. Не делать белый чеклист с иконками."
  },
  {
    test: /viral|symptoms|симптом|poster|розов|glow/i,
    layoutType: "symptoms-poster",
    contentShape: "topBadge, serifThesis, symptoms[3-5], resolution",
    imageTextInstruction: "Верхняя яркая плашка с хуком, ниже крупный serif-тезис, слева короткие признаки с иконками, справа крупный 3D-объект."
  },
  {
    test: /beauty.*grid|состав|grid/i,
    layoutType: "beauty-grid",
    contentShape: "title, cells[{label,value}]",
    imageTextInstruction: "Сетка с короткими ячейками: компонент, роль, техника применения, ожидаемое ощущение. Без длинных абзацев."
  },
  {
    test: /ios|блокнот|note/i,
    layoutType: "checklist-note",
    contentShape: "noteTitle, checklist[3-5], sideNote",
    imageTextInstruction: "Оформи как заметку в телефоне: короткий заголовок, чеклист, одна маленькая пометка."
  },
  {
    test: /тетрад|notebook/i,
    layoutType: "notebook-facts",
    contentShape: "title, fact, notes[3-4]",
    imageTextInstruction: "Оформи как страницу тетради: один факт и короткие рукописные пометки."
  },
  {
    test: /nostalgia|ностальг|90/i,
    layoutType: "nostalgia-story",
    contentShape: "spokenHeadline, scene, beats[3], closingNote",
    imageTextInstruction: "Подача как ностальгичная бытовая сцена: короткая личная фраза, 2-3 наблюдения, теплая пометка."
  },
  {
    test: /белый фон|плашк|clean|medical/i,
    layoutType: "fact-badges",
    contentShape: "eyebrow, bigFact, badges[3]",
    imageTextInstruction: "Белый фон, один крупный факт и 3 отдельные плашки с короткими смыслами."
  },
  {
    test: /минимал|minimal/i,
    layoutType: "minimal-thesis",
    contentShape: "headline, bigThesis, microNotes[2-3]",
    imageTextInstruction: "Минимализм: много воздуха, один сильный тезис, 2-3 коротких уточнения."
  }
];

export function createLayoutContentPlan(reference = {}, hookIntelligence = {}) {
  const referenceFormat = getReferenceFormatSignal(reference);
  const source = getReferenceFormatSource(reference);
  const matched = layoutRules.find((rule) => rule.layoutType === referenceFormat)
    || layoutRules.find((rule) => rule.test.test(source))
    || defaultLayout;
  return {
    referenceId: reference?.id || "",
    referenceTitle: reference?.title || "",
    layoutType: matched.layoutType,
    contentShape: adjustShapeForHook(matched.contentShape, hookIntelligence),
    imageTextInstruction: matched.imageTextInstruction,
    textDensity: reference?.textDensity || "",
    headlineStyle: reference?.headlineStyle || ""
  };
}

export function formatLayoutPlanPrompt(plan) {
  if (!plan?.layoutType) return "";
  return [
    "ВНУТРЕННЯЯ СТРУКТУРА ДИЗАЙНА: это инструкция для верстки, не писать эти слова на изображении.",
    `Активный дизайн-референс: ${plan.referenceTitle || "не указан"}.`,
    `Тип структуры: ${plan.layoutType}.`,
    `Форма текста: ${plan.contentShape}.`,
    plan.textDensity ? `Плотность текста: ${plan.textDensity}.` : "",
    plan.headlineStyle ? `Стиль заголовка: ${plan.headlineStyle}.` : "",
    `Правило верстки: ${plan.imageTextInstruction}`,
    "Не превращай все дизайны в одинаковый список из 4 пунктов."
  ].filter(Boolean).join(" ");
}

function adjustShapeForHook(shape, hookIntelligence) {
  if (!hookIntelligence?.expectedStructure) return shape;
  if (/grid|symptoms|note|story|badges|thesis/.test(shape)) return shape;
  return `${shape}; раскрыть как ${hookIntelligence.expectedStructure}`;
}
