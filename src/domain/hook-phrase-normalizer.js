export function normalizeHookPhrase(value) {
  const firstPart = String(value || "")
    .split(/\n|;|,/)
    .map((item) => item.trim())
    .find(Boolean) || "";
  const withoutLead = firstPart.replace(/^(о|об|про)\s+/i, "").trim();
  return normalizePluralPrepositional(withoutLead || firstPart);
}

function normalizePluralPrepositional(value) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return value;

  const [first, second, ...rest] = words;
  if (isPluralPrepositionalNoun(first) && isPluralPrepositionalAdjective(second)) {
    return [toNominativePluralAdjective(second), toNominativePluralNoun(first), ...rest].join(" ");
  }
  if (isPluralPrepositionalAdjective(first) && isPluralPrepositionalNoun(second)) {
    return [toNominativePluralAdjective(first), toNominativePluralNoun(second), ...rest].join(" ");
  }

  return value;
}

function isPluralPrepositionalAdjective(value) {
  return /(их|ых)$/i.test(value);
}

function isPluralPrepositionalNoun(value) {
  return /(ах|ях)$/i.test(value);
}

function toNominativePluralAdjective(value) {
  return value.replace(/их$/i, "ие").replace(/ых$/i, "ые");
}

function toNominativePluralNoun(value) {
  return value.replace(/ях$/i, "и").replace(/ах$/i, "ы");
}
