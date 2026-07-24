export const requiredRussianImageTextRule = "ЯЗЫК ФИНАЛЬНЫХ КАРТИНОК: весь редакционный текст инфографики должен быть строго на русском языке; английские заголовки, служебные интерфейсные ярлыки, псевдолатинский текст и случайная латиница запрещены. Исключение: текст, логотипы, SKU и названия, напечатанные на реальной упаковке из product reference, не переводить и не перерисовывать.";
export const requiredRussianAvatarVideoRule = "ЯЗЫК ФИНАЛЬНОГО РОЛИКА: не добавлять английскую речь, английские субтитры, английские надписи, интерфейсные ярлыки или псевдолатинский текст. Если нужен видимый или озвученный текст, он должен быть только на русском языке. Для хромакей-аватара вообще не добавлять речь, субтитры и надписи.";
export const russianImagePromptGuard = [
  "ЖЕСТКИЙ ЯЗЫКОВОЙ КОНТРАКТ ДЛЯ ФИНАЛЬНОЙ КАРТИНКИ: весь редакционный текст, заголовки, подписи, карточки и служебные элементы инфографики должны быть только на русском языке.",
  "Запрещены английские заголовки, английские подписи, служебные интерфейсные ярлыки на английском, псевдолатинский текст, случайная латиница и англоязычные заглушки.",
  "Если в исходном промпте, дизайн-референсе или брифе есть английские слова для редакционного текста, переведи их на естественный русский до рендера.",
  "ТЕКСТ НА УПАКОВКЕ ИЗ PRODUCT REFERENCE: не переводить, не локализовать, не переписывать и не заменять надписи, логотипы, SKU, объем, вкус, линейку и название продукта, которые уже напечатаны на реальной упаковке; скопировать их как часть физического объекта.",
  "Официальные названия брендов и сервисов можно оставить латиницей, если они реально являются частью продукта."
].join(" ");
const packageTextRestrictionRule = "Исключение: текст, логотипы, SKU и названия, напечатанные на реальной упаковке из product reference, не переводить и не перерисовывать.";
const packageTextPromptGuard = "ТЕКСТ НА УПАКОВКЕ ИЗ PRODUCT REFERENCE: не переводить, не локализовать, не переписывать и не заменять надписи, логотипы, SKU, объем, вкус, линейку и название продукта, которые уже напечатаны на реальной упаковке; скопировать их как часть физического объекта.";

export function ensureRussianImageTextRestriction(value = "") {
  const source = textValue(value).trim();
  if (hasRussianImageTextRestriction(source)) {
    return hasProductPackageTextException(source) ? source : [source, packageTextRestrictionRule].filter(Boolean).join("\n");
  }
  return [requiredRussianImageTextRule, source].filter(Boolean).join("\n");
}

export function ensureRussianImagePromptGuard(value = "") {
  const source = textValue(value).trim();
  if (hasRussianImagePromptGuard(source)) {
    return hasProductPackageTextException(source) ? source : [packageTextPromptGuard, source].filter(Boolean).join(" ");
  }
  return [russianImagePromptGuard, source].filter(Boolean).join(" ");
}

export function ensureRussianAvatarVideoPromptGuard(value = "") {
  const source = textValue(value).trim();
  if (hasRussianAvatarVideoPromptGuard(source)) return source;
  return [requiredRussianAvatarVideoRule, source].filter(Boolean).join(" ");
}

function hasRussianImageTextRestriction(value) {
  return /видим(?:ый|ого)\s+текст.*строго\s+на\s+русском|язык\s+финальн(?:ых|ой)\s+картин/i.test(value || "");
}

function hasRussianImagePromptGuard(value) {
  return /жестк(?:ий|ого)\s+языков(?:ой|ого)\s+контракт/i.test(value || "");
}

function hasRussianAvatarVideoPromptGuard(value) {
  return /язык\s+финальн(?:ого|ых)\s+ролик/i.test(value || "");
}

function hasProductPackageTextException(value) {
  return /product reference.*не\s+перевод|текст\s+на\s+упаковке|текст\s+на\s+реальной\s+упаковке/i.test(value || "");
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(textValue).filter(Boolean).join(" — ");
  return String(value);
}
