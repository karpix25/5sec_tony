import { isTravelContentProject } from "./project-content-intent.js";

export function createTravelTopicPlan({ project, product, candidate } = {}) {
  if (!isTravelContentProject(project, product)) return null;
  const fact = firstTravelLine(candidate?.proof || product?.facts?.[0] || product?.description);
  const context = firstTravelLine(candidate?.useCase || product?.offer || product?.description);
  const trigger = firstTravelLine(candidate?.trigger || "общий совет не учитывает страну и ситуацию");
  return {
    headline: "",
    subhead: "Общий совет бесполезен без конкретной страны и ситуации.",
    points: [
      fact ? `Необычная деталь: ${fact}` : "",
      trigger ? `Где ошибаются: ${trigger}` : "",
      context ? `Что уточнить заранее: ${context}` : "",
      "Лучший совет начинается с места, правила и маленькой ситуации."
    ].filter(Boolean),
    disclaimer: "",
    hookPsychology: [
      "Тревел-текст должен звучать как полезная находка для поездки.",
      "Конкретную страну, локальную привычку, правило, маршрут или культурную деталь выбирает AI.",
      "Не писать служебные рубрики и маркетинговые объяснения вроде 'почему цепляет', 'миф', 'рабочий шаг'."
    ].join(" ")
  };
}

function firstTravelLine(value) {
  return String(value || "").split(/\n|;|,/).map((item) => item.trim()).find(Boolean) || "";
}
