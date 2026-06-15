import { escapeHtml } from "./infographic.js";
import { renderAvatarOverlayComposer } from "./avatar-overlay-composer.js";

export function renderAvatarSettings({ project, character }) {
  return `
    ${renderAvatarCandidate(project.avatarCandidates?.[0])}
    ${renderApprovedAvatars(project.characters, character?.id)}
    ${renderAvatarVideoPanel(character)}
    <form id="avatar-form" class="ops-form text-editor-form avatar-generator">
      ${avatarField("Имя аватара", "name", "Например: Эксперт Антон", "input", true)}
      ${avatarField("Описание образа", "prompt", "Лицо, возраст, одежда, эмоция, фон, роль, стабильные признаки.", "textarea", true)}
      <button class="secondary-btn" type="submit">Создать аватар</button>
    </form>
  `;
}

function renderAvatarCandidate(candidate) {
  if (!candidate) {
    return `
      <div class="avatar-review empty-review">
        <span>Проверка аватара</span>
        <strong>Нет аватара на проверке</strong>
        <small>Создайте аватар по описанию, затем одобрите или отклоните результат.</small>
      </div>
    `;
  }

  return `
    <article class="avatar-review">
      ${candidate.imageData ? renderPreviewButton(candidate.imageData, candidate.name) : `<div class="avatar-pending">...</div>`}
      <div>
        <span>${escapeHtml(getCandidateStatus(candidate))}</span>
        <strong>${escapeHtml(candidate.name)}</strong>
        <small>${escapeHtml(getCandidateNote(candidate))}</small>
      </div>
      <div class="avatar-review-actions">
        ${candidate.status === "review" ? `<button class="secondary-btn" data-approve-avatar="${candidate.id}" type="button">Одобрить</button>` : ""}
        ${isAvatarLoading(candidate) ? "<div class=\"avatar-loader\" aria-label=\"Ожидание результата\"><span></span><span></span><span></span></div>" : ""}
        ${canRejectAvatarCandidate(candidate) ? `<button class="ghost-btn" data-reject-avatar="${candidate.id}" type="button">${getRejectLabel(candidate)}</button>` : ""}
      </div>
    </article>
  `;
}

function getCandidateNote(candidate) {
  if (candidate.failMsg) return candidate.failMsg;
  if (candidate.status === "submitting") return "Запускаем создание. Обычно это занимает несколько секунд.";
  if (candidate.status !== "review" && candidate.status !== "failed") return "Результат появится автоматически, обычно нужно 20-40 секунд.";
  return "Проверьте результат и одобрите, если образ подходит проекту.";
}

function isAvatarLoading(candidate) {
  return ["submitting", "waiting", "generating"].includes(candidate.status);
}

function canRejectAvatarCandidate(candidate) {
  return !isAvatarLoading(candidate);
}

function getRejectLabel(candidate) {
  return candidate.status === "failed" ? "Убрать ошибку" : "Отклонить";
}

function getCandidateStatus(candidate) {
  const labels = {
    submitting: "Запускаем создание",
    waiting: "Задача создана",
    generating: "Создаем аватар",
    review: "Результат готов",
    failed: "Ошибка создания"
  };
  return labels[candidate.status] || "В работе";
}

function renderApprovedAvatars(items, selectedId) {
  const canDelete = items.length > 1;
  return `
    <div class="avatar-list">
      ${items.map((item) => `
        <article class="avatar-item ${item.id === selectedId ? "active" : ""}">
          ${item.imageData ? renderPreviewButton(item.imageData, item.name) : `<span class="asset-thumb">${escapeHtml(item.name.slice(0, 1))}</span>`}
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.id === selectedId ? "Используется в проекте" : "Аватар проекта")}</small>
          </div>
          ${item.id === selectedId ? "" : `<button class="secondary-btn" data-select-character="${item.id}" type="button">Выбрать</button>`}
          <button class="danger-icon" data-delete-character="${item.id}" type="button" ${canDelete ? "" : "disabled"} aria-label="Удалить аватар">×</button>
        </article>
      `).join("")}
    </div>
  `;
}

function renderAvatarVideoPanel(character) {
  const videos = character?.avatarVideos || [];
  const canCreate = Boolean(character?.imageData);
  return `
    <section class="avatar-video-panel">
      <div class="avatar-video-head">
        <div>
          <span class="eyebrow">Хромакей</span>
          <strong>Видео активного аватара</strong>
          <small>Один reusable ролик на проект: 9:16, по пояс, чистый #00FF00. Потом он накладывается на генерации.</small>
        </div>
      </div>
      <form id="avatar-video-form" class="ops-form text-editor-form avatar-video-form">
        ${avatarField("Движение", "motionPrompt", "Небольшие естественные жесты руками, спокойная поза, легкое движение корпуса.", "textarea", false)}
        <button class="secondary-btn" type="submit" ${canCreate ? "" : "disabled"}>Создать хромакей-видео</button>
      </form>
      ${canCreate ? "" : "<small class=\"avatar-system-note\">Для видео нужен одобренный аватар с изображением.</small>"}
      ${renderAvatarVideoList(videos)}
      ${renderAvatarOverlayComposer(character)}
    </section>
  `;
}

function renderAvatarVideoList(videos) {
  if (!videos.length) return "<small class=\"avatar-system-note\">Видео для активного аватара еще не создавались.</small>";
  return `
    <div class="avatar-video-list">
      ${videos.map((video) => `
        <article class="avatar-video-item">
          ${getPlayableVideoUrl(video) ? `<video src="${escapeHtml(getPlayableVideoUrl(video))}" controls muted loop playsinline></video>` : `<div class="avatar-video-pending">9:16</div>`}
          <div>
            <strong>${escapeHtml(getVideoStatus(video))}</strong>
            <small>${escapeHtml(video.failMsg || video.motionPrompt)}</small>
            ${video.chromaImageUrl ? `<small>Кадр подготовлен</small>` : ""}
            ${video.alphaStatus === "ready" ? "<small>Прозрачный слой сохранен</small>" : ""}
            ${video.alphaStatus === "converting" ? "<small>Удаляем зеленый фон...</small>" : ""}
            ${video.alphaStatus === "failed" ? `<small>${escapeHtml(video.alphaFailMsg || "Прозрачный слой не создан")}</small>` : ""}
          </div>
          ${isVideoLoading(video) ? "<div class=\"avatar-loader\" aria-label=\"Ожидание видео\"><span></span><span></span><span></span></div>" : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function getVideoStatus(video) {
  const labels = {
    "preparing-image": "Готовим хромакей-кадр",
    "generating-image": "Генерируем хромакей-кадр",
    "submitting-video": "Запускаем видео",
    submitting: "Запускаем видео",
    waiting: "Задача создана",
    generating: "Создаем хромакей",
    ready: "Аватар-видео проекта готово",
    failed: "Ошибка видео"
  };
  return labels[video.status] || "В работе";
}

function isVideoLoading(video) {
  return ["preparing-image", "generating-image", "submitting-video", "submitting", "waiting", "generating", "compositing"].includes(video.status)
    || video.alphaStatus === "converting";
}

function getPlayableVideoUrl(video) {
  return video.alphaVideoUrl || video.compositeVideoUrl || video.videoUrl || "";
}


function avatarField(label, name, placeholder, type = "input", required = false) {
  const requiredAttr = required ? "required" : "";
  const control = type === "textarea"
    ? `<textarea name="${name}" class="textarea editor-textarea" placeholder="${escapeHtml(placeholder)}" ${requiredAttr}></textarea>`
    : `<input name="${name}" class="text-input" placeholder="${escapeHtml(placeholder)}" ${requiredAttr} />`;

  return `<label class="stacked-field"><span>${escapeHtml(label)}</span>${control}</label>`;
}

function renderPreviewButton(src, title) {
  return `
    <button class="avatar-preview-trigger" data-preview-avatar="${escapeHtml(src)}" data-preview-title="${escapeHtml(title)}" type="button" aria-label="Открыть превью">
      <img src="${escapeHtml(src)}" alt="">
    </button>
  `;
}
