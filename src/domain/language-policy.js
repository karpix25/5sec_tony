export const requiredRussianImageTextRule = "ЯЗЫК ФИНАЛЬНЫХ КАРТИНОК: весь редакционный текст инфографики должен быть строго на русском языке; английские заголовки, служебные интерфейсные ярлыки, псевдолатинский текст и случайная латиница запрещены. Исключение: текст, логотипы, SKU и названия, напечатанные на реальной упаковке из product reference, не переводить и не перерисовывать.";
export const requiredRussianAvatarVideoRule = "ЯЗЫК ФИНАЛЬНОГО РОЛИКА: не добавлять английскую речь, английские субтитры, английские надписи, интерфейсные ярлыки или псевдолатинский текст. Если нужен видимый или озвученный текст, он должен быть только на русском языке. Для хромакей-аватара вообще не добавлять речь, субтитры и надписи.";
export const russianImagePromptGuard = [
  "ЖЕСТКИЙ ЯЗЫКОВОЙ КОНТРАКТ ДЛЯ ФИНАЛЬНОЙ КАРТИНКИ: весь добавляемый редакционный текст, заголовки, подписи, карточки и служебные элементы инфографики должны быть только на русском языке.",
  "Запрещены английские заголовки, английские подписи, служебные интерфейсные ярлыки на английском, псевдолатинский текст, случайная латиница и англоязычные заглушки в добавляемом редакционном слое.",
  "Если в исходном промпте, дизайн-референсе или брифе есть английские слова для добавляемого редакционного текста, переведи их на естественный русский до рендера; текст реальной упаковки product reference к этому правилу не относится.",
  "ТЕКСТ НА УПАКОВКЕ ИЗ PRODUCT REFERENCE: не переводить, не локализовать, не переписывать и не заменять надписи, логотипы, SKU, объем, вкус, линейку и название продукта, которые уже напечатаны на реальной упаковке; скопировать их как часть физического объекта.",
  "Официальные названия брендов и сервисов можно оставить латиницей, если они реально являются частью продукта."
].join(" ");
const packageTextRestrictionRule = "Исключение: текст, логотипы, SKU и названия, уже напечатанные на реальной упаковке из product reference, не переводить и не перерисовывать.";
const packageTextPromptGuard = "ТЕКСТ НА УПАКОВКЕ ИЗ PRODUCT REFERENCE: не переводить, не локализовать, не переписывать и не заменять надписи, логотипы, SKU, объем, вкус, линейку и название продукта, которые уже напечатаны на реальной упаковке; скопировать их как часть физического объекта.";

export function getImagePromptProductTextRules({ productVisualMode = "", shouldPassProductRefs } = {}) {
  const exactProduct = productVisualMode === "exact-product" && shouldPassProductRefs !== false;
  if (exactProduct) {
    return [
      "ПРИОРИТЕТ PRODUCT REFERENCE: product reference является источником физического объекта; текст, логотипы и названия, уже напечатанные на упаковке, являются частью изображения.",
      "ТЕКСТ НА РЕАЛЬНОЙ УПАКОВКЕ: текст, логотипы, SKU, объем, вкус, линейка и название продукта, уже напечатанные на упаковке, не переводить на русский, не переводить их на русский, не локализовать, не переписывать и не заменять похожими русскими словами.",
      "ИСКЛЮЧЕНИЕ ДЛЯ УПАКОВКИ: текст, логотипы, SKU, вкус, объем и название продукта, уже напечатанные на реальной упаковке из product reference, не переводить и не менять.",
      "Совместимость с legacy prompt contract: текст, логотипы и названия, уже напечатанные на упаковке, не переводить их на русский, не локализовать и не заменять похожими русскими словами.",
      "ЯЗЫКОВАЯ ГРАНИЦА: русский язык обязателен только для добавляемого редакционного текста инфографики; латиница на реальной упаковке product reference не является редакционным текстом."
    ];
  }

  if (productVisualMode === "no-package" || shouldPassProductRefs === false) {
    return [
      "РЕЖИМ NO-PACKAGE: не использовать product reference images, упаковку, этикетку, логотип продукта или SKU как видимый объект; кадр строится без товарного слоя.",
      "ЯЗЫК NO-PACKAGE: весь добавляемый видимый редакционный текст должен быть только на русском языке."
    ];
  }

  return [packageTextRestrictionRule];
}

export function sanitizeAiImagePrompt(value = "", options = {}) {
  const source = textValue(value).trim();
  const exactProduct = options.productVisualMode === "exact-product" && options.shouldPassProductRefs !== false;
  const safeParts = splitPromptParts(source)
    .filter((part) => !exactProduct || !isConflictingGlobalTranslationRule(part));
  return [...safeParts, ...getImagePromptProductTextRules(options)].filter(Boolean).join("\n");
}

export function ensureRussianImageTextRestriction(value = "") {
  const source = textValue(value).trim();
  const normalizedSource = stripConflictingGlobalTranslationRules(source);
  if (hasRussianImageTextRestriction(normalizedSource)) {
    return hasProductPackageTextException(normalizedSource)
      ? normalizedSource
      : [normalizedSource, packageTextRestrictionRule].filter(Boolean).join("\n");
  }
  return [requiredRussianImageTextRule, normalizedSource].filter(Boolean).join("\n");
}

export function ensureRussianImagePromptGuard(value = "") {
  const source = textValue(value).trim();
  const normalizedSource = hasProductPackageTextException(source)
    ? stripConflictingGlobalTranslationRules(source)
    : source;
  if (hasRussianImagePromptGuard(normalizedSource)) {
    return hasProductPackageTextException(normalizedSource)
      ? normalizedSource
      : [packageTextPromptGuard, normalizedSource].filter(Boolean).join(" ");
  }
  return [russianImagePromptGuard, normalizedSource].filter(Boolean).join(" ");
}

function stripConflictingGlobalTranslationRules(prompt) {
  return splitPromptParts(prompt)
    .filter((part) => !isConflictingGlobalTranslationRule(part))
    .join(" ")
    .trim();
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

function splitPromptParts(value) {
  return String(value || "")
    .split(/\r?\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isConflictingGlobalTranslationRule(value) {
  const text = String(value || "");
  return [
    /заменяй\s+любые\s+английские.*(?:латин|русск)/i,
    /обязательно\s+адаптируй\s+и\s+переводи.*(?:референс|упаков)/i,
    /(?:переводи|переводить|перевести|translate)\b.*(?:весь|всю|люб(?:ой|ые)|all|any).*\b(?:текст|латин|latin|english)/i,
    /(?:весь|любой|all)\s+(?:видимый\s+)?текст.*(?:только\s+на\s+русск|translate)/i,
    /(?:translate|replace)\b.*(?:package|label|sku|packaging)/i
  ].some((pattern) => pattern.test(text));
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(textValue).filter(Boolean).join(" — ");
  return String(value);
}
