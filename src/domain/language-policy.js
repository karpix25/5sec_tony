export const requiredRussianImageTextRule = "ЯЗЫК ФИНАЛЬНЫХ КАРТИНОК: весь видимый текст должен быть строго на русском языке; английские заголовки, служебные интерфейсные ярлыки, псевдолатинский текст и случайная латиница запрещены.";
export const russianImagePromptGuard = [
  "ЖЕСТКИЙ ЯЗЫКОВОЙ КОНТРАКТ ДЛЯ ФИНАЛЬНОЙ КАРТИНКИ: весь видимый текст на изображении должен быть только на русском языке.",
  "Запрещены английские заголовки, английские подписи, служебные интерфейсные ярлыки на английском, псевдолатинский текст, случайная латиница и англоязычные заглушки.",
  "Если в исходном промпте, референсе или брифе есть английские слова для видимого текста, переведи их на естественный русский до рендера.",
  "Исключение только для официальных названий брендов, если они реально являются частью продукта."
].join(" ");

export function ensureRussianImageTextRestriction(value = "") {
  const source = textValue(value).trim();
  if (hasRussianImageTextRestriction(source)) return source;
  return [requiredRussianImageTextRule, source].filter(Boolean).join("\n");
}

export function ensureRussianImagePromptGuard(value = "") {
  const source = textValue(value).trim();
  if (hasRussianImagePromptGuard(source)) return source;
  return [russianImagePromptGuard, source].filter(Boolean).join(" ");
}

function hasRussianImageTextRestriction(value) {
  return /видим(?:ый|ого)\s+текст.*строго\s+на\s+русском|язык\s+финальн(?:ых|ой)\s+картин/i.test(value || "");
}

function hasRussianImagePromptGuard(value) {
  return /жестк(?:ий|ого)\s+языков(?:ой|ого)\s+контракт/i.test(value || "");
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(textValue).filter(Boolean).join(" — ");
  return String(value);
}
