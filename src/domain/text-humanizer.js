import { stripUnicodeReplacementCharacters } from "./text-integrity.js";

export function normalizeHumanizedPlan(draft, fallbackPlan, options = {}) {
  const points = normalizeHumanizerPoints(draft?.points, fallbackPlan.points);
  const lockedHeadline = cleanText(options.lockedHeadline);
  const headline = lockedHeadline || normalizeHeadline(draft?.headline, fallbackPlan.headline);
  const subhead = normalizeSubhead(draft?.subhead, fallbackPlan.subhead, headline, points);
  return {
    headline,
    subhead,
    points,
    cta: cleanText(draft?.cta) || fallbackPlan.cta,
    disclaimer: normalizeDisclaimer(draft?.disclaimer, fallbackPlan.disclaimer)
  };
}

export function normalizeHumanizedLine(value) {
  return simplifyLine(stripTechnicalLabels(cleanText(value)));
}

export function humanizePlanFallback({ plan }) {
  return normalizeHumanizedPlan({
    headline: simplifyLine(plan.headline),
    subhead: simplifyLine(plan.subhead),
    points: plan.points.map(simplifyLine),
    cta: simplifyLine(plan.cta),
    disclaimer: simplifyLine(plan.disclaimer)
  }, plan, { lockedHeadline: plan.headline });
}

function normalizeHumanizerPoints(points, fallbackPoints = []) {
  const source = Array.isArray(points) && points.length ? points : fallbackPoints;
  const seen = new Set();
  return source
    .map((point) => simplifyLine(stripTechnicalLabels(cleanText(point))))
    .filter((point) => point && !isDisclaimerPoint(point))
    .filter((point) => !isEmptyBrandPoint(point))
    .filter((point) => {
      const key = normalizeMeaningKey(point);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function normalizeHeadline(value, fallback) {
  const source = simplifyLine(stripTechnicalLabels(cleanText(value))) || simplifyLine(stripTechnicalLabels(cleanText(fallback)));
  if (!source) return "";
  return source
    .replace(/как популярный миф мешает принятию решений:?\s*/i, "")
    .replace(/как простая метафора объясняет проблему:?\s*/i, "")
    .replace(/какая неочевидная ошибка портит результат:?\s*/i, "")
    .replace(/анализ состава:?\s*/i, "")
    .replace(/разбор состава:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
}

function normalizeSubhead(value, fallback, headline = "", points = []) {
  const source = simplifyLine(stripTechnicalLabels(cleanText(value))) || simplifyLine(stripTechnicalLabels(cleanText(fallback)));
  if (!source) return "";
  if (/популярное объяснение|простая метафора|проблема часто скрывается/i.test(source)) {
    return points.find((point) => !isSameMeaning(point, headline)) || source;
  }
  if (isSameMeaning(source, headline)) {
    return points.find((point) => !isSameMeaning(point, headline)) || "";
  }
  return source;
}

function simplifyLine(value) {
  return cleanText(value)
    .replace(/сигнал\s+SOS/gi, "тревожный знак")
    .replace(/популярное объяснение часто сбивает с толку:?\s*/gi, "")
    .replace(/этот факт объясняет знакомое ощущение:?\s*/gi, "")
    .replace(/один простой шаг часто меняет больше, чем кажется:?\s*/gi, "")
    .replace(/разбор состава: что внутри и зачем это нужно/gi, "что проверить в ежедневной привычке")
    .replace(/бренд:\s*[A-ZА-ЯЁ0-9 -]+/gi, "что человек делает каждый день")
    .replace(/факт:\s*[A-ZА-ЯЁ0-9 -]+\.?/gi, "полезный факт из жизни")
    .replace(/люди верят узнаваемым деталям, а не обещаниям/gi, "работает то, что видно в обычном дне")
    .replace(/популярное объяснение часто заслоняет простую причину/gi, "простая причина часто прячется в рутине")
    .replace(/популярное объяснение часто сбивает с толку/gi, "привычная версия не всегда помогает")
    .replace(/простая метафора делает проблему понятной за секунду/gi, "объясните проблему на обычном примере")
    .replace(/\binvoice\b/gi, "счет")
    .replace(/нормальн(?:ый|ого) процесс/gi, "когда все понятно")
    .replace(/проверьте, что именно известно до решения/gi, "сначала поймите, что реально происходит")
    .replace(/проверьте факт/gi, "полезный факт")
    .replace(/действуйте только когда понятен следующий шаг/gi, "следующий шаг должен быть понятным")
    .replace(/вывод делайте только после сравнения признаков/gi, "сравните признаки и выберите спокойный шаг")
    .replace(/что нельзя обещать/gi, "без магии и обещаний")
    .replace(/что нужно/gi, "что может помочь")
    .replace(/что болит/gi, "где болит в жизни")
    .replace(/что известно/gi, "что полезно знать")
    .replace(/обещаний, где легко потерять контроль/gi, "обещаний без деталей")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return stripUnicodeReplacementCharacters(value).replace(/["'«»]/g, "").trim();
}

function stripTechnicalLabels(value) {
  return value
    .replace(/^(метафора|боль|причина|действие|слой анализа|лайфхак|инсайт|вывод|миф|реальность|ошибка|факт|сигнал)\s*[:—-]\s*/i, "")
    .replace(/^(как в жизни|где застревает|что может помочь|кажется мелочью|полезный факт)\s*[:—-]\s*/i, "")
    .replace(/\b(бренд|факт)\s*[:—-]\s*[A-ZА-ЯЁ0-9 -]+\.?/gi, "")
    .trim();
}

function isEmptyBrandPoint(value) {
  return /^[A-ZА-ЯЁ0-9 -]{2,}\.?$/.test(value.trim());
}

function isDisclaimerPoint(value) {
  return /не является (лекар|медицинск|диагноз)|медицинск(ой|ая|им) рекомендац|ознакомительн|проконсультируйтесь|консультац[а-я\s]+врач|есть противопоказан/i.test(value);
}

function normalizeDisclaimer(value, fallback) {
  const source = cleanText(value) || cleanText(fallback);
  return isDisclaimerPoint(source) ? "" : source;
}

function normalizeMeaningKey(value) {
  return value
    .toLowerCase()
    .replace(/[^а-яa-z0-9ё]+/gi, " ")
    .split(" ")
    .filter((word) => word.length > 2)
    .slice(0, 6)
    .join(" ");
}

function isSameMeaning(value, other) {
  const left = normalizeMeaningKey(value);
  const right = normalizeMeaningKey(other);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
