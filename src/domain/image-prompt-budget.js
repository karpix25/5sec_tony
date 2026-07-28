export const IMAGE_PROMPT_MAX_CHARS = 16000;

const compactSuffix = "...";
const essentialPromptPatterns = [
  /GPT Image 2/i,
  /КРИТИЧНО:/i,
  /ДИЗАЙН-РЕФЕРЕНС/i,
  /SAFE ZONE REFERENCE/i,
  /safe-zone маск/i,
  /Белая область safe-zone/i,
  /Фиолетовая область safe-zone/i,
  /DESIGN REFERENCE остается главным источником визуального стиля/i,
  /RECREATE DESIGN REFERENCE INSIDE SAFE-ZONE/i,
  /ТОЧНЫЙ SOCIAL SAFE-ZONE CONTRACT/i,
  /Рабочая область для важного контента/i,
  /Правый rail Instagram/i,
  /Нижние 30% кадра/i,
  /placement mask only/i,
  /generic centered checklist/i,
  /remap\/scale\/shift/i,
  /КОМПОЗИЦИЯ И ОТСТУПЫ/i,
  /ЯЗЫК НА ИЗОБРАЖЕНИИ/i,
  /ЖЕСТКИЙ ЯЗЫКОВОЙ КОНТРАКТ/i,
  /весь видимый текст.*только на русском/i,
  /Не использовать английские слова/i,
  /Если .*латиниц.*переведи/i,
  /английские слова.*латиницу.*русские аналоги/i,
  /официальные названия брендов и сервисов/i,
  /ТЕКСТ НА УПАКОВКЕ/i,
  /ТЕКСТ НА РЕАЛЬНОЙ УПАКОВКЕ/i,
  /ИСКЛЮЧЕНИЕ ДЛЯ УПАКОВКИ/i,
  /CTA НА ИЗОБРАЖЕНИИ ЗАПРЕЩЕН/i,
  /CTA: не добавлять на изображение/i,
  /без футера и без нижней рекламной или защитной плашки/i,
  /ТОЧНОСТЬ ПРОДУКТА/i,
  /не менять форму упаковки/i,
  /Не придумывать новые варианты упаковки/i,
  /ПРОДУКТ ПОКАЗЫВАТЬ/i,
  /ПРОДУКТ В КАДРЕ/i,
  /Не пихать упаковку/i,
  /Крупный продуктовый объект/i,
  /Не показывать упаковку продукта/i,
  /Не рисовать никакую банку/i,
  /generic bottle/i,
  /Не добавлять аватара\/персонажа/i,
  /Смыслы и формулировки создать только на основе компании/i,
  /АНКЕТА ПРОДУКТА/i,
  /Видимые обещания/i,
  /Поля 'Что нельзя обещать'/i,
  /не превращать в нижний дисклеймер/i,
  /ПОНЯТНЫЙ ЗАГОЛОВОК/i,
  /уровень 5 класса/i,
  /Curiosity score target/i,
  /бытовые боли, лайфхаки, советы, привычки, ошибки, мифы/i,
  /Не превращай все дизайны/i,
  /Кликбейт разрешен только честный/i,
  /КОРОТКИЙ ЗАГОЛОВОК/i,
  /ЛОГИКА ТЕКСТА/i,
  /РЕДАКЦИОННЫЙ СТАНДАРТ/i,
  /Только правдивая информация/i,
  /громкое обещание против проверяемой детали/i,
  /ФОРМАТ НОВЫХ ТЕМ/i,
  /Запрещены старые оболочки тем/i,
  /4-6 коротких смысловых блоков/i,
  /Номера использовать только если выбранный дизайн-референс/i,
  /ранги и номера разрешены только для layout формата ranking_leaderboard/i,
  /8-12 очень коротких rank-card/i,
  /Финальный top-chart должен содержать/i,
  /НЕ ДУБЛИРОВАТЬ ТЕКСТ/i,
  /НЕ ПЕРЕГРУЖАТЬ МАКЕТ/i,
  /НЕ ИСПОЛЬЗОВАТЬ ТЕХНИЧЕСКИЕ/i,
  /НИЖНИЕ ЗАЩИТНЫЕ ПОДПИСИ/i,
  /Дисклеймеры не являются контентом/i,
  /не называть.*лекарством/i,
  /РЕЖИМ ПРОДУКТА/i,
  /Локальные product reference images/i,
  /Тема инфографики/i,
  /Главный хук/i,
  /Заголовок:/i,
  /Подзаголовок:/i,
  /Смысловые блоки/i,
  /не нумеровать автоматически/i,
  /Формат смыслов/i,
  /количество видимых пунктов/i,
  /Главный визуальный объект/i,
  /Референс подачи/i,
  /Референсы продукта/i,
  /Факты, которые можно использовать/i,
  /Запрещено обещать/i,
  /ФИКСИРОВАННЫЙ ШРИФТ СТИЛЯ/i,
  /Не менять семейство/i,
  /Дополнительная визуальная инструкция/i,
  /КАРТА ПОЛЬЗЫ ПРОДУКТА/i,
  /Смысловые зоны/i,
  /Смежные привычки/i,
  /Не добавляй неуказанные проценты/i,
  /Продукт:/i,
  /ПЕРЕД ОТВЕТОМ/i
];

const essentialPromptLabels = [
  "Тема проекта",
  "Ниша",
  "Сценарные кластеры",
  "Боли аудитории",
  "Желания аудитории",
  "Возражения аудитории",
  "Разрешенные триггеры",
  "Запрещенные триггеры",
  "Контентные ограничения",
  "Компания",
  "ЦА компании",
  "Ограничения проекта",
  "Что НЕ копировать из референса",
  "Палитра как ориентир",
  "Стиль заголовка",
  "Плотность текста",
  "Состав или активные компоненты",
  "Боли",
  "Факты, которые можно использовать",
  "Запрещено обещать",
  "Комментарий к генерации",
  "Дополнительная задача"
];

export function compactImagePromptSource(value, maxChars = 700) {
  const text = normalizePromptText(value);
  if (text.length <= maxChars) return text;
  return fitPromptText(splitPromptClauses(text), maxChars);
}

export function limitImagePrompt(value, maxChars = IMAGE_PROMPT_MAX_CHARS) {
  const prompt = normalizePromptText(value);
  if (prompt.length <= maxChars) return prompt;

  const sentences = splitPromptSentences(prompt);
  const essential = new Set(sentences.filter(isEssentialPromptSentence));
  const essentialText = joinPromptParts(sentences.filter((sentence) => essential.has(sentence)));
  if (essentialText.length >= maxChars) {
    return fitPromptText(splitPromptSentences(essentialText), maxChars);
  }

  const optionalBudget = Math.max(0, maxChars - essentialText.length - compactSuffix.length - 1);
  let usedOptional = 0;
  const parts = [];

  for (const sentence of sentences) {
    if (essential.has(sentence)) {
      parts.push(sentence);
      continue;
    }
    if (usedOptional + sentence.length + 1 > optionalBudget) continue;
    parts.push(sentence);
    usedOptional += sentence.length + 1;
  }

  return fitPromptText(parts, maxChars);
}

function isEssentialPromptSentence(sentence) {
  return isUppercaseRule(sentence)
    || isEssentialPromptLabel(sentence)
    || essentialPromptPatterns.some((pattern) => pattern.test(sentence));
}

function isUppercaseRule(sentence) {
  return /^[А-ЯЁA-Z0-9\s/—-]{5,}:/.test(sentence);
}

function isEssentialPromptLabel(sentence) {
  return essentialPromptLabels.some((label) => sentence.startsWith(`${label}:`));
}

function fitPromptText(parts, maxChars) {
  const result = [];
  let used = 0;
  for (const part of parts) {
    const text = normalizePromptText(part);
    if (!text) continue;
    const nextUsed = used + text.length + (result.length ? 1 : 0);
    if (nextUsed <= maxChars) {
      result.push(text);
      used = nextUsed;
      continue;
    }
    const remaining = maxChars - used - (result.length ? 1 : 0) - compactSuffix.length;
    if (remaining > 40) result.push(`${text.slice(0, remaining).trim()}${compactSuffix}`);
    break;
  }
  return joinPromptParts(result);
}

function splitPromptSentences(value) {
  return normalizePromptText(value)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitPromptClauses(value) {
  return normalizePromptText(value)
    .split(/\n|;|(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinPromptParts(parts) {
  return parts.map(normalizePromptText).filter(Boolean).join(" ");
}

function normalizePromptText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
