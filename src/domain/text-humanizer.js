export function normalizeHumanizedPlan(draft, fallbackPlan, options = {}) {
  const points = normalizePoints(draft?.points, fallbackPlan.points);
  const lockedHeadline = cleanText(options.lockedHeadline);
  const headline = lockedHeadline || normalizeHeadline(draft?.headline, fallbackPlan.headline, points);
  const subhead = normalizeSubhead(draft?.subhead, fallbackPlan.subhead, headline, points);
  return {
    headline,
    subhead,
    points,
    cta: cleanText(draft?.cta) || fallbackPlan.cta,
    disclaimer: normalizeDisclaimer(draft?.disclaimer, fallbackPlan.disclaimer)
  };
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

function normalizePoints(points, fallbackPoints = []) {
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

function normalizeHeadline(value, fallback, points = []) {
  const source = simplifyLine(stripTechnicalLabels(cleanText(value))) || simplifyLine(stripTechnicalLabels(cleanText(fallback)));
  if (!source) return "";
  if (isTechnicalHeadline(source)) return buildHeadlineFromPoints(points) || "Что проверить сегодня";
  const cleaned = source
    .replace(/как популярный миф мешает принятию решений:?\s*/i, "")
    .replace(/как простая метафора объясняет проблему:?\s*/i, "")
    .replace(/какая неочевидная ошибка портит результат:?\s*/i, "")
    .replace(/анализ состава:?\s*/i, "")
    .replace(/разбор состава:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return shortenHeadline(cleaned, points);
}

function normalizeSubhead(value, fallback, headline = "", points = []) {
  const source = simplifyLine(stripTechnicalLabels(cleanText(value))) || simplifyLine(stripTechnicalLabels(cleanText(fallback)));
  if (!source) return "";
  if (/популярное объяснение|простая метафора|проблема часто скрывается/i.test(source)) {
    return "Проверьте одну привычку, которую легко не заметить.";
  }
  if (isSameMeaning(source, headline)) {
    return points.find((point) => !isSameMeaning(point, headline)) || "";
  }
  return source;
}

function simplifyLine(value) {
  return cleanText(value)
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
    .replace(/счет оплачивают, не понимая срок и назначение/gi, "деньги уходят, а за что именно — непонятно")
    .replace(/счет читается как чек-лист перед оплатой/gi, "понятно, кому и за что платите")
    .replace(/передать данные без понятного процесса/gi, "отдать данные, не понимая следующий шаг")
    .replace(/условия названы до запуска транзакции/gi, "сумму, сроки и правила называют заранее")
    .replace(/комиссия и ограничения всплывают после согласия/gi, "доплаты и ограничения всплывают слишком поздно")
    .replace(/не разобрать поля счета до перевода/gi, "оплатить счет, не проверив главное")
    .replace(/платеж уходит не туда или требует долгих уточнений/gi, "потом приходится долго разбираться, куда ушли деньги")
    .replace(/актуальных условий платежа/gi, "текущих правил оплаты")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenHeadline(value, points = []) {
  const compact = removeWeakHeadlineShell(value);
  const candidates = splitHeadlineCandidates(compact);
  const best = candidates
    .map((item) => trimHeadlineCandidate(item))
    .filter(Boolean)
    .sort((a, b) => scoreHeadlineCandidate(b, points) - scoreHeadlineCandidate(a, points))[0];
  return best || buildHeadlineFromPoints(points) || compact;
}

function removeWeakHeadlineShell(value) {
  return value
    .replace(/^(популярное объяснение часто сбивает с толку|этот факт объясняет знакомое ощущение|один простой шаг часто меняет больше, чем кажется)\s*[:—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitHeadlineCandidates(value) {
  const parts = value.split(/\s*[:;]\s*/).filter(Boolean);
  return parts.length > 1 ? parts : [value];
}

function trimHeadlineCandidate(value) {
  const words = value.replace(/[.!?]+$/g, "").split(/\s+/).filter(Boolean);
  if (words.length <= 6 && value.length <= 48) return words.join(" ");
  return words.slice(0, 6).join(" ");
}

function scoreHeadlineCandidate(value, points = []) {
  const words = value.toLowerCase().split(/\s+/).filter(Boolean);
  const pointText = points.join(" ").toLowerCase();
  const linkedWords = words.filter((word) => word.length > 3 && pointText.includes(word)).length;
  const lengthPenalty = Math.max(0, words.length - 5);
  const weakPenalty = /^(это|один|популярное|знакомое|простое|простой)\b/i.test(value) ? 3 : 0;
  return linkedWords * 2 + Math.min(words.length, 6) - lengthPenalty - weakPenalty;
}

function cleanText(value) {
  return String(value || "").replace(/["'«»]/g, "").trim();
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

function isTechnicalHeadline(value) {
  return /разбор состава|анализ состава|простая метафора|популярный миф|неочевидная ошибка портит результат|что внутри и зачем/i.test(value);
}

function buildHeadlineFromPoints(points) {
  const joined = points.join(" ").toLowerCase();
  if (/сухост|тонус|кож/.test(joined)) return "Почему кожа быстро теряет тонус";
  if (/сон|утр|устал|стресс/.test(joined)) return "Почему сон не дает сил";
  if (/оплат|счет|карт|доступ/.test(joined)) return "Почему оплата срывается в последний момент";
  return "";
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
    .filter((word) => word.length > 3)
    .slice(0, 6)
    .join(" ");
}

function isSameMeaning(value, other) {
  const left = normalizeMeaningKey(value);
  const right = normalizeMeaningKey(other);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
