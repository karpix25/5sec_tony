export async function uploadVideoToYandexDisk({ fileUrl, targetFolder, fileName }) {
  const response = await fetch("/api/yandex-disk/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl, targetFolder, fileName })
  });
  const payload = await readYandexJson(response);
  if (!response.ok) throw new Error(payload.error || "Не удалось сохранить файл на Яндекс.Диск");
  return payload;
}

export async function listYandexDiskFolders({ root = "disk:/ВИДЕО", depth = 2, max = 120 } = {}) {
  const params = new URLSearchParams({ root, depth: String(depth), max: String(max) });
  const response = await fetch(`/api/yandex-disk/folders?${params}`);
  const payload = await readYandexJson(response);
  if (!response.ok) throw new Error(payload.error || "Не удалось получить папки Яндекс.Диска");
  return payload;
}

async function readYandexJson(response) {
  try {
    return await response.json();
  } catch {
    return { error: "Локальный API вернул пустой ответ от Яндекс.Диска." };
  }
}
