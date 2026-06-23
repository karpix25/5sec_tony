export async function uploadReferenceAsset({ imageData, imageName = "" }) {
  const response = await fetch("/api/reference-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageData, imageName })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось сохранить референс");
  if (!payload.url) throw new Error("Сервер не вернул URL референса");
  return payload;
}
