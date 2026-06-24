export function createCurrentDateContext(now = new Date()) {
  const date = Number.isFinite(now?.getTime?.()) ? now : new Date();
  const year = String(date.getFullYear());
  return {
    isoDate: date.toISOString().slice(0, 10),
    russianDate: formatRussianDate(date),
    year
  };
}

export function formatCurrentDatePrompt(now = new Date()) {
  const context = createCurrentDateContext(now);
  return `АКТУАЛЬНАЯ ДАТА: ${context.russianDate}. Текущий год: ${context.year}. В актуальном контенте не писать старые годы из референса вроде 2025/2024; заменить на ${context.year} или убрать год, если не просили исторический материал.`;
}

function formatRussianDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}
