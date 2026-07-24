import { createImageUploadBody } from "./image-upload-body.js";

export async function uploadReferenceAsset({ imageData, imageName = "" }) {
  const upload = await createImageUploadBody({ imageName }, imageData, imageName);
  const response = await fetch("/api/reference-assets", {
    method: "POST",
    ...upload
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось сохранить референс");
  if (!payload.url) throw new Error("Сервер не вернул URL референса");
  return payload;
}
