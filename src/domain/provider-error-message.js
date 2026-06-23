export function humanizeProviderErrorMessage(message = "") {
  const text = String(message || "").trim();
  if (isTextLengthLimitError(text)) {
    return "Промпт получился слишком длинным для генератора. Мы оставляем главное: тему, хук, продукт и стиль, а лишний контекст нужно сократить перед повтором.";
  }
  return text
    .replaceAll("Kie.ai", "Сервис генерации")
    .replaceAll("GPT Image 2", "Основной способ")
    .replaceAll("Nano Banana 2", "резервный способ")
    .replaceAll("taskId", "номер задачи");
}

export function isTextLengthLimitError(message = "") {
  return /text length.*maximum limit|maximum.*text length|prompt.*too long|maximum.*prompt/i.test(String(message || ""));
}
