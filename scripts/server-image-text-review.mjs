const maxImageTextRepairAttempts = 2;

export async function reviewServerImageText(record, imageUrl, deps = {}) {
  const content = record.job.finalContent || record.job.contentScript || record.job.aiPlan || {};
  if (!content.headline) return { retry: false, skipped: true };
  const fetchImpl = deps.fetchImpl || fetch;
  const patchJob = deps.patchJob || (async () => {});
  try {
    const response = await fetchImpl(`${record.origin}/api/generation/image-text-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, contentScript: content })
    });
    const review = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(review.error || `Image text review failed: ${response.status}`);
    if (review.passed) {
      await patchJob({ imageTextReview: review, imageTextReviewWarning: "" });
      return { retry: false, review };
    }
    const attempts = Number(record.job.imageTextReviewAttempts || 0);
    if (attempts >= maxImageTextRepairAttempts) {
      await patchJob({ imageTextReview: review, imageTextReviewWarning: "Текст картинки не совпал с финальным сценарием после повторных попыток." });
      return { retry: false, review, exhausted: true };
    }
    const basePrompt = record.job.imageTextBasePrompt || record.job.prompt;
    await patchJob({
      imageTaskId: "",
      imageTextReview: review,
      imageTextReviewAttempts: attempts + 1,
      imageTextReviewWarning: "",
      imageTextBasePrompt: basePrompt,
      inputUrls: uniqueUrls([imageUrl, ...(record.job.inputUrls || [])]).slice(0, 5),
      inputRefs: [{ role: "image_text_repair", title: "Предыдущий рендер", isLocalData: false }, ...(record.job.inputRefs || [])].slice(0, 5),
      prompt: buildImageTextRepairPrompt(basePrompt, content),
      failMsg: "Исправляем текст на картинке..."
    });
    return { retry: true, review };
  } catch (error) {
    await patchJob({ imageTextReviewWarning: `Автопроверка текста недоступна: ${error.message || error}` });
    return { retry: false, skipped: true, error: error.message || String(error) };
  }
}

export function buildImageTextRepairPrompt(prompt, content) {
  const contract = JSON.stringify({
    headline: content.headline || "",
    subhead: content.subhead || "",
    points: Array.isArray(content.points) ? content.points : []
  });
  return [
    "РЕЖИМ ТОЧЕЧНОГО ИСПРАВЛЕНИЯ ТЕКСТА. Первое входное изображение — предыдущий рендер.",
    "Сохрани его композицию, стиль, цвета, объекты и расположение блоков. Исправь только редакционный текст.",
    `Напиши без изменений и без опечаток только этот JSON-контракт: ${contract}.`,
    "Не обрезай слова, не добавляй новый текст и не переписывай формулировки.",
    String(prompt || "")
  ].filter(Boolean).join(" ");
}

function uniqueUrls(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}
