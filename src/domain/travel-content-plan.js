import { isTravelContentProject } from "./project-content-intent.js";

export function createTravelTopicPlan({ project, product, candidate } = {}) {
  if (!isTravelContentProject(project, product)) return null;
  return {
    headline: "",
    subhead: candidate?.subhead || "AI должен выбрать конкретную страну, маленькую ситуацию и проверяемую деталь из контекста продукта.",
    points: [
      `Контекст продукта: ${product?.description || product?.offer || product?.name || ""}`,
      candidate?.trigger ? `Триггер аудитории: ${candidate.trigger}` : "",
      candidate?.proof ? `Проверяемая деталь: ${candidate.proof}` : "",
      "Не брать готовые страны или факты из кода; придумать тему из продукта, хука и ниши."
    ].filter(Boolean),
    disclaimer: "",
    hookPsychology: [
      "Тревел-текст должен звучать как полезная находка для поездки.",
      "Конкретную страну, локальную привычку, правило, маршрут или культурную деталь выбирает AI.",
      "Не писать служебные рубрики и маркетинговые объяснения вроде 'почему цепляет', 'миф', 'рабочий шаг'."
    ].join(" ")
  };
}
