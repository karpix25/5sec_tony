import { createHash } from "node:crypto";

const audioFingerprintKeys = ["id", "fileData", "url", "fileName", "fileSize", "fileType", "createdAt", "uploadedAt"];

export function createAudioLibraryFingerprint(audioLibrary = []) {
  const normalized = audioLibrary
    .map(normalizeAudioForFingerprint)
    .filter((audio) => audio.id || audio.fileData || audio.url || audio.fileName)
    .sort(compareAudioFingerprintItems);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function countAudioLibraryAssets(audioLibrary = []) {
  return audioLibrary.filter((audio) => audio?.id || audio?.fileData || audio?.url || audio?.fileName).length;
}

export function inferAudioLibraryChangedAt(audioLibrary = [], fallback = new Date()) {
  const timestamps = audioLibrary
    .flatMap((audio) => [audio?.createdAt, audio?.uploadedAt, audio?.updatedAt])
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  const latest = timestamps.length ? Math.max(...timestamps) : new Date(fallback).getTime();
  return new Date(Number.isFinite(latest) ? latest : Date.now()).toISOString();
}

function normalizeAudioForFingerprint(audio = {}) {
  return Object.fromEntries(audioFingerprintKeys.map((key) => [key, String(audio[key] || "")]));
}

function compareAudioFingerprintItems(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
