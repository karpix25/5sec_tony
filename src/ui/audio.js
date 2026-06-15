import { escapeHtml } from "./infographic.js";

export function renderAudioSettings({ audioLibrary }) {
  return `
    ${renderAudioList(audioLibrary)}
    <form id="audio-form" class="ops-form audio-upload-form">
      <label class="stacked-field">
        <span>Глобальные аудио файлы</span>
        <input name="audioFiles" class="file-input" type="file" accept="audio/*" multiple />
      </label>
      <button class="secondary-btn" type="submit">Загрузить</button>
    </form>
  `;
}

export async function getAudioPayloads(form) {
  const files = [...(form.querySelector("input[type='file']")?.files || [])];
  const payloads = await Promise.all(files.map(readAudioFile));
  form.reset();
  return payloads;
}

function renderAudioList(items) {
  return `
    <div class="audio-list">
      ${items.map(renderAudioItem).join("")}
    </div>
  `;
}

function renderAudioItem(audio) {
  return `
    <article class="audio-item">
      <div class="audio-icon">♪</div>
      <div>
        <strong>${escapeHtml(audio.title || audio.fileName || "Аудио файл")}</strong>
        <small>Добавлено: ${escapeHtml(formatDate(audio.createdAt))}</small>
      </div>
      <button class="danger-icon" data-delete-audio="${audio.id}" type="button" aria-label="Удалить аудио">×</button>
    </article>
  `;
}

async function readAudioFile(file) {
  return {
    title: file.name.replace(/\.[^.]+$/, "") || file.name,
    fileName: file.name,
    fileType: file.type || "audio",
    fileSize: file.size,
    fileData: await readAudioAsDataUrl(file),
    createdAt: new Date().toISOString()
  };
}

function readAudioAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(value) {
  if (!value) return "не указана";
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}
