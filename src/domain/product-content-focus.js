import { normalizeHookPhrase } from "./hook-phrase-normalizer.js";

export function getProductContentFocus({ project, product }) {
  const facts = focusList(product?.facts).map(normalizeHookPhrase).filter(Boolean);
  const pains = focusList(product?.pains).map(normalizeHookPhrase).filter(Boolean);
  const offer = normalizeHookPhrase(product?.offer || "");
  const description = normalizeHookPhrase(product?.description || "");
  const projectTheme = normalizeHookPhrase(project?.projectTheme || project?.companyInfo || "");
  const productName = product?.name || "";

  return {
    fact: focusFirst([facts[0], description, offer, projectTheme], productName),
    context: focusFirst([description, facts[0], projectTheme, offer], productName),
    pain: focusFirst([pains[0], facts[0], description, projectTheme], productName),
    action: focusFirst([offer, facts[1], description, projectTheme], productName),
    subject: focusFirst([...facts, ...pains, description, offer, projectTheme], productName),
    list: focusUnique([...facts, ...pains, description, offer, projectTheme], productName)
  };
}

export function focusList(value) {
  if (Array.isArray(value)) return value.flatMap(splitFocusItem);
  return splitFocusItem(value);
}

function splitFocusItem(value) {
  return String(value || "")
    .split(/\n|;|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function focusFirst(items, productName) {
  return focusUnique(items, productName)[0] || "";
}

function focusUnique(items, productName) {
  const blocked = normalizeFocusValue(productName);
  const seen = new Set();
  return items
    .map((item) => normalizeHookPhrase(item))
    .map((item) => item.replace(/^(о|об|про)\s+/i, "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeFocusValue(item);
      if (!key || key === blocked || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeFocusValue(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}
