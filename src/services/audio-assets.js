export async function uploadAudioAsset(audio) {
  const response = await fetch("/api/audio-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: audio.id || "",
      title: audio.title || "",
      audioData: audio.fileData,
      fileName: audio.fileName || "",
      fileType: audio.fileType || "",
      fileSize: audio.fileSize || 0,
      createdAt: audio.createdAt || ""
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось сохранить аудио в S3");
  if (!payload.url) throw new Error("Сервер не вернул URL аудио");
  return {
    ...(payload.audio || { ...audio, fileData: payload.url, fileType: payload.fileType || audio.fileType }),
    updatedAt: payload.updatedAt || payload.audio?.updatedAt || ""
  };
}

export async function deleteAudioAsset(audio) {
  const url = audio?.fileData || "";
  if (!/^https?:\/\//.test(url) && !audio?.id) return { deleted: false };
  const response = await fetch("/api/audio-assets/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: audio?.id || "", url })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось удалить аудио из S3");
  return payload;
}
