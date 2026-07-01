export const requiredRussianImageTextRule = "ЯЗЫК ФИНАЛЬНЫХ КАРТИНОК: весь видимый текст должен быть строго на русском языке; английские заголовки, UI labels, lorem ipsum и случайная латиница запрещены.";

export function ensureRussianImageTextRestriction(value = "") {
  const source = textValue(value).trim();
  if (hasRussianImageTextRestriction(source)) return source;
  return [requiredRussianImageTextRule, source].filter(Boolean).join("\n");
}

function hasRussianImageTextRestriction(value) {
  return /видим(?:ый|ого)\s+текст.*строго\s+на\s+русском|язык\s+финальн(?:ых|ой)\s+картин/i.test(value || "");
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(textValue).filter(Boolean).join(" — ");
  return String(value);
}
