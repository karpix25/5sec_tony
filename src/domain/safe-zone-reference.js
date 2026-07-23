const safeZoneMaskPng = "iVBORw0KGgoAAAANSUhEUgAAAGwAAADACAYAAADhuIZYAAABVElEQVR42u3RQQ0AIAwEwapEDkIxAwr4NaEls8kZuIk51rY+CycAM2AGDJgBM2DADJgBA2bADBgwA2bAgBkwAwbMgBkwYAbMgAGzzmB6GzBgAiZgwARMwIAJmIABEzABAwYMmIABAwZMwIABAyZgwIABEzBgwIAJGDBgwARMwIAJmIABEzABAyZgAgZMwAQMGDBgAgYMGDABAwYMmIABAwZMwIABAyZgAgZMwAQMmIAJGDABEzBgAiZgwIABEzBgwIAJGDBgwAQMGDBgAgYMGDABE7AaZ2cMGDABAwYMmIABAwZMwIABAyZgwIABEzBgwIAJGDBgwAQMGDBgwIABAwYMGDBgwIABAwYMGDBgwAQMGDBgAgYM2PdgVnPAgBkwAwbMgBkwYAbMgAEzYAYMmAEzYMAMmAEDZsAMGDADZsCAGTADBswJwAyYAQNmwAwYMANm1x2PfbvlbQH+EAAAAABJRU5ErkJggg==";

export const safeZoneReferenceRole = "safe_zone";

export const safeZoneReferenceRules = [
  "SAFE ZONE REFERENCE: среди input images есть служебная 9:16 маска размещения; это не дизайн-референс, не палитра и не фон для финальной картинки.",
  "Белая область safe-zone маски — единственное место для важного содержимого: текста, карточек, номеров, продукта, символов, иконок, декоративных дуг и главного объекта.",
  "Фиолетовая область safe-zone маски — запретная зона: там разрешен только нейтральный фон, свет, градиент или текстура без букв, символов, карточек и важных деталей.",
  "Не копируй цвета, прямоугольники, форму маски или контраст safe-zone reference в финальную картинку; используй ее только как карту размещения.",
  "Если дизайн-референс прижимает элементы к краям или конфликтует с safe-zone reference, приоритет всегда у safe-zone reference."
];

export function getSafeZoneInputReference() {
  return {
    role: safeZoneReferenceRole,
    title: "Safe zone placement mask",
    url: `data:image/png;base64,${safeZoneMaskPng}`
  };
}
