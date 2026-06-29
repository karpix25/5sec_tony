const conceptFamilies = [
  { id: "freshness", pattern: /свеж|дезодор|запах|ощущени.*чист/i },
  { id: "morning", pattern: /утр|просып|завтрак|начал.*дн|стакан.*вод/i },
  { id: "inner-state", pattern: /изнутр|внутрен|организм|самочувств/i },
  { id: "routine", pattern: /рутин|ритуал|привыч|регуляр|ежеднев/i, weak: true },
  { id: "energy", pattern: /энерг|бодр|сил|устал|разбит/i },
  { id: "sleep", pattern: /сон|усн|спать|вечер/i },
  { id: "stress", pattern: /стресс|нерв|напряж|перегруз/i },
  { id: "skin", pattern: /кож|ше[ие]я|уход|beauty|бьюти/i },
  { id: "promise-check", pattern: /обещ|ожидан|пустыш|маркетинг|провер/i }
];

const lightStopWords = new Set([
  "для",
  "как",
  "что",
  "это",
  "или",
  "если",
  "после",
  "перед",
  "вместо",
  "когда",
  "почему",
  "который",
  "которая",
  "которые",
  "продукт",
  "продукта",
  "продуктом"
]);

export function buildTopicSimilarityKey(parts = []) {
  const text = normalizeTopicText(parts.filter(Boolean).join(" "));
  const tokens = new Set(text.split(" ").map(stemTopicToken).filter(isUsefulToken));
  const families = new Set(conceptFamilies.filter((family) => family.pattern.test(text)).map((family) => family.id));
  const strongFamilies = new Set(conceptFamilies
    .filter((family) => !family.weak && family.pattern.test(text))
    .map((family) => family.id));
  return { text, tokens, families, strongFamilies };
}

export function isSimilarTopicSignature(left, right) {
  if (!left?.text || !right?.text) return false;
  if (left.text === right.text) return true;
  if (countOverlap(left.tokens, right.tokens) >= 2) return true;
  return countOverlap(left.strongFamilies, right.strongFamilies) >= 1 && hasSpecificTopicOverlap(left, right);
}

export function normalizeTopicText(value) {
  return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
}

function hasSpecificTopicOverlap(left, right) {
  return countOverlap(left.tokens, right.tokens) >= 1 || countOverlap(left.families, right.families) >= 2;
}

function countOverlap(left = new Set(), right = new Set()) {
  let matches = 0;
  for (const item of right) {
    if (left.has(item)) matches += 1;
  }
  return matches;
}

function stemTopicToken(value) {
  return String(value || "")
    .replace(/(иями|ями|ами|ого|ему|ыми|ими|ией|иях|ах|ях|ую|юю|ая|яя|ое|ее|ые|ие|ой|ей|ом|ем|ам|ям|ах|ях|ов|ев|ий|ый|ия|ья|ие|ых|их|а|я|ы|и|у|ю|е|о)$/i, "");
}

function isUsefulToken(value) {
  return value.length > 4 && !lightStopWords.has(value);
}
