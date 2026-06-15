import { createHookDraft } from "../domain/hook-library.js";

export async function extractHooksFromImage({ imageData, title }) {
  const response = await fetch("/api/hooks/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageData, title })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Не удалось извлечь хуки");
  return createHookDraft({
    title: title || "Хуки со скрина",
    sourceType: "image",
    text: (payload.hooks || []).join("\n")
  });
}

export async function extractHooksFromPdf({ pdfData, title, fileName }) {
  const response = await fetch("/api/hooks/extract-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfData, title, fileName })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Не удалось прочитать PDF");
  const draft = createHookDraft({
    title: title || "Хуки из PDF",
    sourceType: "pdf",
    text: payload.text || ""
  });
  if (!draft.hooks.length) throw new Error("В PDF не нашлись отдельные хуки.");
  return draft;
}
