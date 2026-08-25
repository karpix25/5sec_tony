const unsupportedClaimPatterns = [
  ["medical_treatment", /(?<!не )(?<![а-яё])леч(?:ит|ат|ить|ение|ебн|ащ)|терап|диагноз|лекарств/iu],
  ["medical_mechanism", /кровообращ|микроциркуля|лимф|гормон|инсулин|холестерин|давлени|метабол|обмен веществ/iu],
  ["disease_or_pathogen", /воспален|инфекц|бактери|вирус|грибок|грибк|паразит/iu],
  ["detox_or_weight", /токсин|детокс|очища.{0,12}организм|сжига.{0,12}жир|похуд/iu],
  ["physical_damage", /микротрещ|микроцарап|царап|стира.{0,16}эмал|истонч|шероховат|наждач|поврежд|ржаве|пятн.{0,20}раствор|растворя.{0,20}(?:пятн|нал[её]т)/iu],
  ["effect", /обезвож|нормализ|стимулир|блокир|избав|убира(?:ет|ют|ется)|гарантир|навсегда|мгновенн|бодр|энергич|(?<!без)вред/iu]
];

const safeFallbackPoints = [
  "Смотрите на состав и способ применения",
  "Сверяйте обещания с описанием продукта",
  "Оценивайте комфорт в привычном сценарии",
  "Следуйте инструкции на упаковке"
];

export const claimEvidenceRules = [
  "Факты, причины, механизмы и эффекты можно брать только из исходных полей product: name, description, offer, components, facts и allowed.",
  "safeFacts и allowedClaims в productPassport помогают искать формулировки, но не разрешают новый claim, которого нет в исходном product.",
  "Боли, сценарии, objections, productWorld и contentTerritory задают темы, но не являются доказательствами причин, физиологии или эффекта продукта.",
  "Не превращай смежную тему в причинное утверждение: например, упоминание гаджетов не доказывает обезвоживание, а тема сна не доказывает нарушение кровообращения.",
  "Возраст или опыт бренда не означает, что конкретный продукт, состав или формула разрабатывались все эти годы.",
  "Если доказательства не хватает, убери причинное объяснение и напиши безопасное наблюдение, инструкцию или факт из product; генерацию не останавливай."
];

export function getClaimEvidence({ product = {}, productPassport = {} } = {}) {
  const direct = collectLines([
    product.name,
    product.description,
    product.offer,
    product.components,
    product.facts,
    product.allowed,
    product.physicalProperties
  ]);
  if (direct.length > 1) return direct;
  return uniqueLines([
    ...direct,
    ...collectLines([productPassport.plainDescription, productPassport.safeFacts, productPassport.allowedClaims])
  ]);
}

export function getUnsupportedClaimViolations(contentScript = {}, context = {}) {
  const evidenceText = normalizeForMatch(getClaimEvidence(context).join(" "));
  return getVisibleLines(contentScript).flatMap(({ field, text }) => unsupportedClaimPatterns
    .filter(([, pattern]) => pattern.test(normalizeForMatch(text)) && !pattern.test(evidenceText))
    .map(([id]) => `${field}:unsupported_${id}`));
}

export function repairUnsupportedClaims(contentScript = {}, context = {}) {
  const evidence = getClaimEvidence(context);
  const productName = normalizeForMatch(context.product?.name);
  const candidates = uniqueLines([...evidence, ...safeFallbackPoints])
    .filter((line) => normalizeForMatch(line) !== productName)
    .filter((line) => line.length >= 18 && line.length <= 120);
  const used = new Set(getVisibleLines(contentScript)
    .filter(({ text }) => !lineHasUnsupportedClaim(text, context))
    .map(({ text }) => normalizeForMatch(text)));
  let candidateIndex = 0;
  const nextCandidate = () => {
    while (candidateIndex < candidates.length) {
      const candidate = candidates[candidateIndex++];
      const key = normalizeForMatch(candidate);
      if (!used.has(key) && !lineHasUnsupportedClaim(candidate, context)) {
        used.add(key);
        return candidate;
      }
    }
    return safeFallbackPoints.find((line) => !used.has(normalizeForMatch(line))) || safeFallbackPoints[0];
  };
  const points = asPointLines(contentScript.points).map((point) => lineHasUnsupportedClaim(point, context) ? nextCandidate() : point);
  return {
    ...contentScript,
    headline: lineHasUnsupportedClaim(contentScript.headline, context) ? "Что важно знать заранее" : contentScript.headline,
    subhead: lineHasUnsupportedClaim(contentScript.subhead, context) ? "" : contentScript.subhead,
    points
  };
}

function lineHasUnsupportedClaim(text, context) {
  return getUnsupportedClaimViolations({ points: [text] }, context).length > 0;
}

function getVisibleLines(contentScript) {
  return [
    { field: "headline", text: String(contentScript.headline || "") },
    { field: "subhead", text: String(contentScript.subhead || "") },
    ...asPointLines(contentScript.points).map((text, index) => ({ field: `points[${index}]`, text }))
  ].filter(({ text }) => text.trim());
}

function asPointLines(points) {
  return (Array.isArray(points) ? points : []).map((point) => {
    if (!point || typeof point !== "object") return String(point || "").trim();
    return Object.values(point).map((value) => String(value || "").trim()).filter(Boolean).join(": ");
  }).filter(Boolean);
}

function collectLines(value) {
  if (Array.isArray(value)) return value.flatMap(collectLines);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectLines);
  return String(value || "").split(/[\n;]+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function uniqueLines(lines) {
  return [...new Map(lines.map((line) => [normalizeForMatch(line), line])).values()];
}

function normalizeForMatch(value) {
  return String(value || "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/giu, " ").trim();
}
