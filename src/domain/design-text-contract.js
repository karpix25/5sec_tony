const oldCountPattern = /(^|\s)[3-7]\s*(маркер|признак|пункт|симптом|ошиб|вещ|привыч|сигнал)/i;
const topHeadlinePattern = /^(top|топ)(\s|\d|$)/i;
const incompleteHeadlineEndingPattern = /^(а|и|но|если|когда|который|которая|которые|которое|потому|что|как|почему|это|плохой|плохая|плохое)$/i;
const forbiddenVisiblePattern = /подпишись|подписывайся|купите|закажите|показываем|покажите|визуализ|→|в\s+(?:профиле|описании)|не\s+является\s+лекар|проконсультируйтесь|дисклеймер/i;
const numberedHeadlineFragmentPattern = /(?:^|\s)\d{1,2}\s*[.)](?=\s|$)|^заблуждени[ея]\s+про\s+\d/i;
const weakHeadlineShellPattern = /^(?:почему\s+|превраща(?:ют|ет)\s+|скрип\s+|не\s+просто\s+|весь\s+секрет\s+(?:в|во)(?:\s|$)|(?:это|этот|эта|эти)\s+|(?:вы|ты)\s+зря\s+(?:тратите|покупаете)(?:\s|$)|подходит\s+для(?:\s|$)|(?:произвед|сделан|разработан)[а-яё]*\s+(?:в|из)(?:\s|$)|ошибка\s+(?:в|для|при)(?:\s|$)|(?:в|на|при|для|по)\s+(?:гигиене|уходе|составе|применении|рутине|использовании)(?:\s|$)|(?:содержит|содержат|в\s+составе|обогащ[её]н(?:а|о|ы)?|формула\s+с|с\s+(?:ароматом|вкусом))(?:\s|$)|(?:мягкий|приятный|натуральный|свежий|л[её]гкий)\s+(?:вкус|аромат(?:изатор)?|состав|текстура)(?:\s|$)|(?:ошибки|советы|правила|основы|особенности|признаки|гайд|чек-?лист)\s+(?:при|для|по|о|в)(?:\s|$)|(?:вы|ты)\s+(?:это|их|его|е[её])(?:\s|$)|вот\s+(?:что|почему)|разбираемся|миф(?:ы)?\s+(?:о|про)|что\s+важно\s+знать|важн(?:ый|ые)\s+факт|полезн(?:ый|ые)\s+(?:совет|факт)|эту\s+деталь\s+(?:легко\s+)?(?:упустить|не\s+заметить)|это\s+не\s+(?:норма|работает)$|(?:ваш|твой)\s+.+?\s+(?:—\s*)?это\s+(?:просто\s+)?маркетинг$)/i;
const headlineJargonPattern = /эргономик|оптимизац|(?:^|\s)функционал(?:\s|$)|синерг|ресурс(?:ы|ами)?\s+организма/i;
const orphanMeasurementPattern = /(?:^|\s)(?:мг|мл|кг|г|%)(?=\s|$|[.,;:])/i;
const supportedMeasurementPattern = /\d+(?:[.,]\d+)?\s*(?:мг|мл|кг|г|%)(?:\s|$)/i;
const promisedItemCountPattern = /(?:^|\s)(2|два|две|3|три|4|четыре|5|пять|6|шесть|7|семь|8|восемь|9|девять)\s+(?:способ|совет|причин|шаг|правил|ошиб|привыч|факт|признак|вариант)[а-яё]*/i;
const promisedItemCountValues = { "2": 2, два: 2, две: 2, "3": 3, три: 3, "4": 4, четыре: 4, "5": 5, пять: 5, "6": 6, шесть: 6, "7": 7, семь: 7, "8": 8, восемь: 8, "9": 9, девять: 9 };
const genericPointPattern = /(?:^|[—–,:;]\s*)(?:смотрите на состав|сверяйте обещания|оценивайте комфорт|проверьте комфорт|следуйте инструкции)(?:\s|$)/i;
const abstractBenefitHeadlinePattern = /^(?:комфорт|уверенность|забота|свежесть|баланс|гармония|л[её]гкость)\s+(?:в|для|на)\s+(?:движени|кажд|повседнев|ритм|жизн|рутин|уход)/i;
const drySpecificationHeadlinePattern = /(?:толщин|объ[её]м|вес|длин|размер|содержание)[а-яё]*\s+(?:издели[а-яё]*\s+)?(?:составля|равн|весит|содержит|имеет)[а-яё]*\s+\d/i;
const bareInstructionHeadlinePattern = /^[А-ЯЁ][а-яё-]{2,}(?:ть|ться)\s+[^?!]+$/;
const signalListPromisePattern = /(?:признак|сигнал)[а-яё]*/i;
const productFeaturePointPattern = /^(?:содержит|формула|в\s+составе)(?:\s|$)|(?:^|\s)(?:в\s+составе|благодаря|помогает|поддерживает|обеспечивает)(?:\s|$)/i;
const validShortHeadlineStarts = new Set(["а", "в", "и", "к", "о", "с", "у", "я", "мы", "ты", "вы", "он", "не", "на", "по", "за", "из", "до", "но", "ии", "ai", "qr"]);

export function getVisibleTextContractViolations({ contentScript = {}, product = {} } = {}) {
  const headline = normalizeVisibleLine(contentScript.headline);
  const subhead = normalizeVisibleLine(contentScript.subhead);
  const points = getScriptPoints(contentScript).map(normalizeVisibleLine).filter(Boolean);
  const violations = [];
  const headlineWords = headline.split(/\s+/).filter(Boolean);

  if (!headline) violations.push("headline_empty");
  if (headline.length > 34) violations.push("headline_too_long");
  if (headlineWords.length < 3) violations.push("headline_too_few_words");
  if (headlineWords.length > 6) violations.push("headline_too_many_words");
  if (/^[а-яё]/.test(headline)) violations.push("headline_lowercase_start");
  if (isAllCapsHeadline(headline)) violations.push("headline_all_caps");
  if (looksLikeProductDump(headline, product)) violations.push("headline_product_dump");
  if (numberedHeadlineFragmentPattern.test(headline)) violations.push("headline_numbered_fragment");
  if (weakHeadlineShellPattern.test(headline)) violations.push("headline_weak_shell");
  if (abstractBenefitHeadlinePattern.test(headline)) violations.push("headline_weak_shell");
  if (drySpecificationHeadlinePattern.test(headline)) violations.push("headline_weak_shell");
  if (bareInstructionHeadlinePattern.test(headline)) violations.push("headline_weak_shell");
  if (headlineJargonPattern.test(headline)) violations.push("headline_weak_shell");
  if (hasBrokenHeadlineStart(headline)) violations.push("headline_broken_start");
  if ([subhead, ...points].some(hasBrokenLineStart)) violations.push("broken_line_start");
  if (hasAdjacentDuplicateWords(headline)) violations.push("headline_duplicate_word");
  if (/[,;:—–-]$/.test(headline) || incompleteHeadlineEndingPattern.test(lastHeadlineWord(headline))) violations.push("headline_incomplete");
  if (subhead && hasSameMeaning(headline, subhead)) violations.push("subhead_duplicates_headline");
  if (subhead && points.some((point) => hasSameMeaning(subhead, point))) violations.push("subhead_duplicates_point");
  const promisedItemCount = getPromisedItemCount(headline);
  if (promisedItemCount && promisedItemCount !== points.length) violations.push("headline_count_mismatch");
  if (points.some((point) => genericPointPattern.test(point))) violations.push("generic_point");
  if (signalListPromisePattern.test(`${headline} ${subhead}`) && points.some((point) => productFeaturePointPattern.test(point))) violations.push("point_breaks_list_promise");
  if ([headline, subhead, ...points].some((line) => /\uFFFD/.test(line))) violations.push("replacement_character");
  if ([headline, subhead, ...points].some((line) => forbiddenVisiblePattern.test(line))) violations.push("forbidden_visible_copy");
  if ([headline, subhead, ...points].some(hasOrphanMeasurement)) violations.push("orphan_measurement");
  return violations;
}

export function repairVisibleTextContract(contentScript = {}, options = {}) {
  let points = getScriptPoints(contentScript)
    .map(normalizePointText)
    .map(normalizeRepairLine)
    .filter((line) => line && !genericPointPattern.test(line) && !forbiddenVisiblePattern.test(line) && !hasOrphanMeasurement(line));
  if (signalListPromisePattern.test(`${contentScript.headline || ""} ${contentScript.subhead || ""}`)) {
    points = points.filter((line) => !productFeaturePointPattern.test(line));
  }
  const sourceHeadline = removeMismatchedCountPromise(normalizeRepairLine(contentScript.headline), points.length);
  const fallbackHeadlines = Array.isArray(options.fallbackHeadlines) ? options.fallbackHeadlines : [];
  const [sourceCandidate, ...sourceClauses] = createHeadlineCandidates(sourceHeadline);
  const candidates = [
    sourceCandidate,
    ...fallbackHeadlines.flatMap(createHeadlineCandidates),
    ...sourceClauses,
    ...[contentScript.subhead, ...getScriptPoints(contentScript).map(normalizePointText)].flatMap(createHeadlineCandidates)
  ]
    .filter((line) => line && !looksLikeProductDump(line, options.product) && !forbiddenVisiblePattern.test(line));
  const headline = candidates.find((line) => isValidHeadline(line, options.product))
    || "Сначала проверь способ применения";
  const rawSubhead = normalizeRepairLine(contentScript.subhead);
  const subhead = rawSubhead && !looksLikeProductDump(rawSubhead) && !forbiddenVisiblePattern.test(rawSubhead) && !hasSameMeaning(headline, rawSubhead) && !points.some((point) => hasSameMeaning(rawSubhead, point))
    ? rawSubhead
    : "";
  return { ...contentScript, headline, subhead, points };
}

export function assertGenerationTextContract(contentScript = {}, enabled = true) {
  if (!enabled) return;
  const violations = getVisibleTextContractViolations({ contentScript });
  if (violations.length) {
    throw new Error(`Финальный текст AI-брифа не прошел проверку: ${violations.join(", ")}`);
  }
}

export function getDesignTextContractViolations({ contentScript = {}, designFormatBrief = {} } = {}) {
  if (designFormatBrief.formatType !== "ranking_leaderboard") return [];
  const expectedCount = getRankingItemCount(designFormatBrief);
  const points = getScriptPoints(contentScript);
  const violations = [];
  const headline = String(contentScript.headline || "");
  if (!topHeadlinePattern.test(headline) || hasWeakTopHeadline(headline)) violations.push("headline_not_top_chart");
  if (oldCountPattern.test(String(contentScript.headline || ""))) violations.push("headline_old_count");
  if (oldCountPattern.test(String(contentScript.subhead || ""))) violations.push("subhead_old_count");
  if (points.length < Math.min(8, expectedCount)) violations.push("not_enough_rank_items");
  if (points.some((point) => normalizePointText(point).split(/\s+/).filter(Boolean).length > 7)) violations.push("rank_item_too_long");
  return violations;
}

export function normalizeContentScriptForDesignContract({ contentScript = {}, designFormatBrief = {} } = {}) {
  void designFormatBrief;
  return contentScript;
}

export function hasDesignTextContractViolations(payload = {}) {
  return getDesignTextContractViolations(payload).length > 0;
}

function getScriptPoints(contentScript) {
  return Array.isArray(contentScript?.points) ? contentScript.points.filter(Boolean) : [];
}

function getRankingItemCount(designFormatBrief) {
  const contract = designFormatBrief.textContract || {};
  const preferred = Number(contract.preferredItems || contract.maxItems || contract.minItems || 10);
  return Math.max(8, Math.min(12, Number.isFinite(preferred) ? preferred : 10));
}

function hasWeakTopHeadline(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  const numbers = clean.match(/\b(?:[3-9]|1[0-2])\b/g) || [];
  return numbers.length > 1 || /(что|как|почему|если|когда)$/i.test(clean) || clean.split(/\s+/).length > 6;
}

function normalizePointText(point) {
  const value = point && typeof point === "object"
    ? [point.title, point.label, point.text, point.caption].filter(Boolean).join(" ")
    : String(point || "");
  return value
    .replace(/^\s*\d{1,2}(?:[\).:\-]\s*|\s+(?=[А-ЯЁ]))/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVisibleLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRepairLine(value) {
  let clean = normalizeVisibleLine(value)
    .replace(/\uFFFD/g, "")
    .replace(/^[3-7]\s*(?:маркер[а-яё]*|признак[а-яё]*|пункт[а-яё]*|симптом[а-яё]*|ошиб[а-яё]*|вещ[а-яё]*|привыч[а-яё]*|сигнал[а-яё]*)\s*,?\s*(?:что\s+про|которые|что|про)?\s*/i, "")
    .replace(/^[\s:—–-]+|[.!?\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (isAllCapsHeadline(clean)) clean = clean.toLocaleLowerCase("ru-RU");
  return /^[а-яё]/.test(clean) ? clean[0].toLocaleUpperCase("ru-RU") + clean.slice(1) : clean;
}

function isAllCapsHeadline(value) {
  const letters = String(value || "").replace(/[^а-яё]/gi, "");
  return letters.length >= 6 && letters === letters.toLocaleUpperCase("ru-RU");
}

function isValidHeadline(value, product) {
  return !getVisibleTextContractViolations({ contentScript: { headline: value }, product }).length;
}

function createHeadlineCandidates(value) {
  const headline = normalizeRepairLine(value);
  if (!headline || numberedHeadlineFragmentPattern.test(headline)) return [headline];
  const clauses = normalizeVisibleLine(value)
    .split(/\s*(?:[.!?;]|:\s+|[—–]\s+)\s*/)
    .map(normalizeRepairLine)
    .filter(Boolean);
  const shortClauses = clauses.flatMap((clause) => clause
    .split(/\s+(?:и|но|а)\s+/i)
    .map(normalizeRepairLine)
    .filter(Boolean));
  const compactClauses = clauses
    .map((clause) => normalizeRepairLine(clause.replace(/^(?:продукт|средство|формула)\s+(?:содержит|включает)\s+/i, "")))
    .filter(Boolean);
  return [...new Set([headline, ...clauses, ...shortClauses, ...compactClauses])];
}

function looksLikeProductDump(value, product = {}) {
  const words = normalizeVisibleLine(value).split(/\s+/).filter(Boolean);
  return value.length > 90
    || (words.length > 10 && (value.match(/[.!?](?:\s|$)/g) || []).length > 1)
    || looksLikeProductNameLine(value, product);
}

function looksLikeProductNameLine(value, product) {
  const productWords = [product?.name, product?.aiPassport?.productName]
    .flatMap((name) => normalizeVisibleMeaningKey(name).split(" "))
    .filter((word) => word.length > 4);
  const headline = normalizeVisibleMeaningKey(value);
  const headlineWords = headline.split(" ").filter(Boolean);
  if (!productWords.some((word) => headlineWords.includes(word)) || headlineWords.length > 4) return false;
  const hasConflict = /(?:^|\s)(?:не|без|зря|слишком|ошиб|риск)(?:\s|$)/i.test(headline);
  const hasPredicate = headlineWords.some((word) => /[а-яё]{3,}(?:ет|ёт|ит|ат|ят|ут|ют|ется|ится|ался|илась|лись)$/i.test(word));
  return !hasConflict && !hasPredicate;
}

function normalizeVisibleWord(value) {
  return String(value || "").toLowerCase().replace(/[^а-яa-z0-9ё-]/gi, "");
}

function hasAdjacentDuplicateWords(value) {
  const words = normalizeVisibleLine(value).split(/\s+/).filter(Boolean);
  return words.some((word, index) => index > 0 && normalizeVisibleWord(word) === normalizeVisibleWord(words[index - 1]));
}

function lastHeadlineWord(value) {
  return normalizeVisibleWord(normalizeVisibleLine(value).split(/\s+/).at(-1));
}

function hasOrphanMeasurement(value) {
  return orphanMeasurementPattern.test(String(value || "")) && !supportedMeasurementPattern.test(String(value || ""));
}

function getPromisedItemCount(value) {
  const match = String(value || "").match(promisedItemCountPattern);
  return match ? promisedItemCountValues[match[1].toLowerCase()] || 0 : 0;
}

function removeMismatchedCountPromise(value, pointCount) {
  const promised = getPromisedItemCount(value);
  if (!promised || promised === pointCount) return value;
  return normalizeRepairLine(String(value).replace(
    /(?:^|[?!.,:;—–-]\s*|\s+)(?:2|два|две|3|три|4|четыре|5|пять|6|шесть|7|семь|8|восемь|9|девять)\s+(?:способ|совет|причин|шаг|правил|ошиб|привыч|факт|признак|вариант)[а-яё]*.*$/i,
    ""
  ));
}

function hasBrokenHeadlineStart(value) {
  const text = normalizeVisibleLine(value);
  if (/^почему\s+\d+(?:[.,]\d+)?\s+(?:лет|год|дн|час)/i.test(text)) return true;
  if (/^(?:нехватки|недостатка|ошибок|признаков|маркеров|вещей|способов)(?:\s|$)/i.test(text)) return true;
  return hasBrokenLineStart(text);
}

function hasBrokenLineStart(value) {
  const text = normalizeVisibleLine(value);
  const firstWord = normalizeVisibleWord(text.split(/\s+/)[0]);
  return firstWord.length > 0 && !/^\d+$/.test(firstWord) && firstWord.length <= 2 && !validShortHeadlineStarts.has(firstWord);
}

function normalizeVisibleMeaningKey(value) {
  return normalizeVisibleLine(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 2)
    .join(" ");
}

function hasSameMeaning(left, right) {
  const normalizedLeft = normalizeVisibleMeaningKey(left);
  const normalizedRight = normalizeVisibleMeaningKey(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;
  const leftWords = new Set(normalizedLeft.split(" "));
  const rightWords = new Set(normalizedRight.split(" "));
  const sharedWords = [...leftWords].filter((word) => rightWords.has(word)).length;
  return sharedWords >= 2 && sharedWords / Math.min(leftWords.size, rightWords.size) >= 0.6;
}
