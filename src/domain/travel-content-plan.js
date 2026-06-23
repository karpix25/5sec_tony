import { isTravelContentProject } from "./project-content-intent.js";

const travelAngles = [
  "Япония: где правило вежливости важнее привычного совета",
  "Турция: что уточнить до рынка, такси или экскурсии",
  "Италия: почему привычный заказ может выглядеть странно",
  "ОАЭ: какие местные правила лучше проверить заранее",
  "Таиланд: где жест или обувь скажут больше слов",
  "Франция: когда расписание важнее красивого маршрута"
];

export function createTravelTopicPlan({ project, product, candidate } = {}) {
  if (!isTravelContentProject(project, product)) return null;
  const focus = pickTravelFocus({ product, candidate });
  return {
    headline: "",
    subhead: "Берите конкретную страну и маленькую ситуацию, а не общий совет для всех туристов.",
    points: rotateTravelAngles(focus.seed).slice(0, 5),
    disclaimer: "",
    hookPsychology: [
      "Тревел-текст должен звучать как полезная находка для поездки.",
      "Нужны конкретные страны, локальные привычки, правила, маршруты или культурные детали.",
      "Не писать служебные рубрики и маркетинговые объяснения вроде 'почему цепляет', 'миф', 'рабочий шаг'."
    ].join(" ")
  };
}

function pickTravelFocus({ product, candidate }) {
  const seed = [
    candidate?.trigger,
    candidate?.proof,
    candidate?.useCase,
    product?.facts?.join(" "),
    product?.offer,
    product?.description
  ].filter(Boolean).join(" ");
  return { seed };
}

function rotateTravelAngles(seed) {
  const offset = Math.abs(hashTravelSeed(seed)) % travelAngles.length;
  return [...travelAngles.slice(offset), ...travelAngles.slice(0, offset)];
}

function hashTravelSeed(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0);
}
