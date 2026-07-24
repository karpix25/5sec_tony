const safeZoneMaskPng = "iVBORw0KGgoAAAANSUhEUgAAAGwAAADACAYAAADhuIZYAAABVElEQVR42u3RQQ0AIAwEwapEDkIxAwr4NaEls8kZuIk51rY+CycAM2AGDJgBM2DADJgBA2bADBgwA2bAgBkwAwbMgBkwYAbMgAGzzmB6GzBgAiZgwARMwIAJmIABEzABAwYMmIABAwZMwIABAyZgwIABEzBgwIAJGDBgwARMwIAJmIABEzABAyZgAgZMwAQMGDBgAgYMGDABAwYMmIABAwZMwIABAyZgAgZMwAQMmIAJGDABEzBgAiZgwIABEzBgwIAJGDBgwAQMGDBgAgYMGDABE7AaZ2cMGDABAwYMmIABAwZMwIABAyZgwIABEzBgwIAJGDBgwAQMGDBgwIABAwYMGDBgwIABAwYMGDBgwAQMGDBgAgYM2PdgVnPAgBkwAwbMgBkwYAbMgAEzYAYMmAEzYMAMmAEDZsAMGDADZsCAGTADBswJwAyYAQNmwAwYMANm1x2PfbvlbQH+EAAAAABJRU5ErkJggg==";

export const safeZoneReferenceRole = "safe_zone";

export const safeZoneReferenceRules = [
  "SAFE ZONE REFERENCE: среди input images есть служебная 9:16 маска размещения; это первый служебный референс только для границ размещения, не дизайн-референс, не палитра, не фон и не источник композиционного стиля.",
  "DESIGN REFERENCE остается главным источником визуального стиля: сохраняй его layout skeleton, ритм, типографический характер, палитру, плотность, формы карточек и композиционную идею.",
  "RECREATE DESIGN REFERENCE INSIDE SAFE-ZONE: сначала воссоздай визуальную грамматику дизайн-референса, затем адаптируй расположение важных элементов внутрь белой safe-zone области.",
  "Белая область safe-zone маски — единственное место для важного содержимого: текста, карточек, номеров, продукта, символов, иконок, декоративных дуг и главного объекта.",
  "Фиолетовая область safe-zone маски — запретная зона: там разрешен только нейтральный фон, свет, градиент или текстура без букв, символов, карточек и важных деталей.",
  "Не копируй цвета, прямоугольники, форму маски или контраст safe-zone reference в финальную картинку; используй ее только как карту размещения и placement mask only.",
  "Если дизайн-референс прижимает элементы к краям, не отказывайся от его стиля: сохрани дизайн-систему референса, но аккуратно remap/scale/shift важный контент внутрь белой safe-zone области.",
  "Не заменяй дизайн-референс generic centered checklist, если выбранный референс не является чеклистом."
];

export function getSafeZoneInputReference() {
  return {
    role: safeZoneReferenceRole,
    title: "Safe zone placement mask",
    url: `data:image/png;base64,${safeZoneMaskPng}`
  };
}
