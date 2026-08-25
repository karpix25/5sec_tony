import { isEditorialTopicEligible } from "./editorial-topic-policy.js";

const unsupportedClaimPatterns = [
  ["medical_treatment", /(?<!не )(?<![а-яё])леч(?:ит|ат|ить|ение|ебн|ащ)|терап|диагноз|лекарств/iu],
  ["medical_mechanism", /кровообращ|микроциркуля|лимф|гормон|инсулин|холестерин|давлени|метабол|обмен веществ|нагрузк.{0,24}(?:сустав|шею|спин|мышц)/iu],
  ["disease_or_pathogen", /воспален|инфекц|бактери|микроб|вирус|грибок|грибк|паразит/iu],
  ["skin_harm_or_treatment", /(?:кожа|кожу).{0,20}(?:горит|травм|раздраж|воспал|аллерг|зуд|жжен|покраснен)|(?:аллерг|раздраж|воспал|зуд|жжен|покраснен)|(?:травмиру|провоциру|вызыва).{0,24}(?:кож|аллерг|раздраж|воспал|зуд|жжен|покраснен)|успокаива.{0,16}кож/iu],
  ["detox_or_weight", /токсин|детокс|очища.{0,12}организм|сжига.{0,12}жир|похуд/iu],
  ["wellness_mechanism", /организм|клет|жкт|кишеч|вздут|пищевар|аппетит|самочувств|адаптац|накопительн|тяжест.{0,20}(?:еды|живот)|маскир.{0,16}запах|дезодор(?:ир|ант.{0,16}не\s+справл)|запах.{0,16}(?:тела|изнутри|изо рта)|свежест.{0,16}изнутри|внутренн.{0,16}(?:состояни|свежест|чистот)|энерги|тонус|иммун|кислород|митохондр|долгосрочн.{0,16}поддерж/iu],
  ["therapeutic_effect", /мышц.{0,20}(?:не\s+отдых|напряж|зажим)|(?:снима|устраня|разгоня|возвращ).{0,24}(?:зажим|напряж|тяжест|л[её]гкост)|помога.{0,28}(?:расслаб|восстанов)|подогрев.{0,40}(?:расслаб|восстанов)|глубок.{0,16}расслаб|эффективн.{0,16}восстанов/iu],
  ["invented_comparison", /(?:один|1).{0,16}вместо.{0,16}(?:двух|тр[её]х|четыр[её]х|пяти|шести|\d+)|заменя.{0,18}(?:гору|несколько|много|пять|четыре|три|\d+)/iu],
  ["physical_damage", /микротрещ|микроцарап|микроразрыв|разрыв.{0,12}кутик|уби(?:ть|ва[а-яё]*).{0,16}(?:эмал|кож|волос|зуб)|созда[а-яё]*.{0,16}трени|царап|стира.{0,16}эмал|истонч|шероховат|наждач|поврежд|ржаве|пятн.{0,20}раствор|растворя.{0,20}(?:пятн|нал[её]т)/iu],
  ["causal_certainty", /(?:главн|скрыт|прям).{0,16}причин|напрямую\s+влияет|зависит\s+от|указывает\s+на.{0,20}дефицит|требу(?:ет|ют).{0,24}(?:белк|жирн|витамин|минерал)|связан.{0,24}(?:дискомфорт|проблем|наруш|бол)/iu],
  ["effect", /обезвож|нормализ|стимулир|блокир|нейтрализ|избав|убира(?:ет|ют|ется)|гарантир|навсегда|мгновенн|бодр|энергич|(?<!без)вред/iu]
];

const strictWellnessClaims = new Set([
  "medical_treatment",
  "medical_mechanism",
  "disease_or_pathogen",
  "skin_harm_or_treatment",
  "detox_or_weight",
  "wellness_mechanism",
  "therapeutic_effect",
  "invented_comparison",
  "causal_certainty",
  "effect"
]);

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
  const evidence = direct.length > 1 ? direct : uniqueLines([
    ...direct,
    ...collectLines([productPassport.plainDescription, productPassport.safeFacts, productPassport.allowedClaims])
  ]);
  if (!isSensitiveConsumerHealthContext({ product, productPassport })) return evidence;
  return evidence.filter((line) => !lineHasStrictClaim(line));
}

export function getUnsupportedClaimViolations(contentScript = {}, context = {}) {
  const evidenceText = normalizeForMatch(getClaimEvidence(context).join(" "));
  const strictClaims = isSensitiveConsumerHealthContext(context) ? strictWellnessClaims : new Set();
  return getVisibleLines(contentScript).flatMap(({ field, text }) => unsupportedClaimPatterns
    .filter(([id, pattern]) => {
      const claims = getClaimMatches(text, pattern);
      const supported = new Set(getClaimMatches(evidenceText, pattern, true));
      return claims.length > 0 && (strictClaims.has(id) || claims.some((claim) => !supported.has(claim)));
    })
    .map(([id]) => `${field}:unsupported_${id}`));
}

export function repairUnsupportedClaims(contentScript = {}, context = {}) {
  const passportLines = collectLines([
    context.productPassport?.plainDescription,
    context.productPassport?.safeFacts,
    context.productPassport?.allowedClaims
  ]);
  const productName = normalizeForMatch(context.product?.name);
  const candidates = uniqueLines([...passportLines, ...safeFallbackPoints])
    .filter((line) => normalizeForMatch(line) !== productName)
    .filter((line) => isEditorialTopicEligible({ text: line, project: context.project, product: context.product }))
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
    headline: lineHasUnsupportedClaim(contentScript.headline, context) ? "" : contentScript.headline,
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

function getClaimMatches(value, pattern, excludeNegated = false) {
  const text = normalizeForMatch(value);
  const matcher = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return [...text.matchAll(matcher)]
    .filter((match) => !excludeNegated || !/(?:^|\s)(?:без|не|от)\s*$/u.test(text.slice(Math.max(0, match.index - 8), match.index)))
    .map((match) => normalizeForMatch(match[0]))
    .filter(Boolean);
}

function lineHasStrictClaim(value) {
  const normalized = normalizeForMatch(value);
  return unsupportedClaimPatterns.some(([id, pattern]) => strictWellnessClaims.has(id) && pattern.test(normalized));
}

function isSensitiveConsumerHealthContext({ project = {}, product = {}, productPassport = {} } = {}) {
  return /бад|wellness|нутрицевт|хлорофилл|добавк|массаж|роликов.{0,12}(?:стоп|ног)|подогрев.{0,12}(?:стоп|ног)|дезодорант|скраб|крем|сыворотк|космет|уход.{0,12}кож|кож.{0,12}уход|зубн.{0,12}паст|полост.{0,12}рт|брекет|эмал/iu.test(normalizeForMatch([
    project.name,
    project.niche,
    project.projectTheme,
    product.name,
    product.description,
    productPassport.category,
    productPassport.plainDescription
  ].filter(Boolean).join(" ")));
}
