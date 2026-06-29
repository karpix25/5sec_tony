export async function uploadAudioAsset(audio) {
  const response = await fetch("/api/audio-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioData: audio.fileData,
      fileName: audio.fileName || "",
      fileType: audio.fileType || ""
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось сохранить аудио в S3");
  if (!payload.url) throw new Error("Сервер не вернул URL аудио");
  return { ...audio, fileData: payload.url, fileType: payload.fileType || audio.fileType };
}

export async function deleteAudioAsset(audio) {
  const url = audio?.fileData || "";
  if (!/^https?:\/\//.test(url)) return { deleted: false };
  const response = await fetch("/api/audio-assets/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось удалить аудио из S3");
  return payload;
}
