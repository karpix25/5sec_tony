import { escapeHtml } from "./infographic.js";
import { renderAvatarOverlayComposer } from "./avatar-overlay-composer.js";
import { renderPreviewTrigger } from "./preview-modal.js";

export function renderAvatarSettings({ project, character }) {
  return `
    ${renderAvatarUploadPanel()}
    ${renderToggleSection("Аватары проекта", renderApprovedAvatars(project.characters, character?.id), { section: "approved" })}
    ${renderAvatarVideoPanel(project, character)}
    ${renderAvatarOverlayComposer({ project, character })}
  `;
}

function renderAvatarUploadPanel() {
  return renderToggleSection("Загрузить аватар", `
    <form id="avatar-form" class="ops-form text-editor-form avatar-generator">
      ${avatarField("Имя аватара", "name", "Например: Эксперт Антон", "input", true)}
      <label class="stacked-field">
        <span>Картинка аватара</span>
        <input name="imageFile" class="file-input" type="file" accept="image/*" required />
      </label>
      <small class="avatar-system-note">Хромакей-видео будет создано из загруженного изображения активного аватара.</small>
      <button class="secondary-btn" type="submit">Загрузить аватар</button>
    </form>
  `, { section: "upload", open: true });
}

function renderToggleSection(title, content, options = {}) {
  const detailsAttrs = [
    options.open ? "open" : "",
    options.section ? `data-avatar-section="${escapeHtml(options.section)}"` : "",
    options.forceOpen ? "data-force-open=\"true\"" : ""
  ].filter(Boolean).join(" ");
  return `
    <details class="avatar-toggle-section" ${detailsAttrs}>
      <summary>${escapeHtml(title)}</summary>
      <div class="avatar-toggle-body">${content}</div>
    </details>
  `;
}

function renderApprovedAvatars(items, selectedId) {
  const canDelete = items.length > 1;
  return `
    <div class="avatar-list">
      ${items.map((item) => `
        <article class="avatar-item ${item.id === selectedId ? "active" : ""} ${item.isActive === false ? "disabled" : ""}">
          ${item.imageData ? renderPreviewButton(item.imageData, item.name) : `<span class="asset-thumb">${escapeHtml(item.name.slice(0, 1))}</span>`}
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(getAvatarActiveLabel(item, item.id === selectedId))}</small>
          </div>
          ${item.id === selectedId ? "" : `<button class="secondary-btn" data-select-character="${item.id}" type="button">Выбрать</button>`}
          ${renderAvatarActiveButton(item)}
          <button class="danger-icon" data-delete-character="${item.id}" type="button" ${canDelete ? "" : "disabled"} aria-label="Удалить аватар">×</button>
        </article>
      `).join("")}
    </div>
  `;
}

function renderAvatarActiveButton(item) {
  const isActive = item.isActive !== false;
  return `
    <button class="ghost-btn" data-avatar-active="${escapeHtml(item.id)}" data-avatar-next-active="${isActive ? "false" : "true"}" type="button">
      ${isActive ? "Выключить" : "Активировать"}
    </button>
  `;
}

function getAvatarActiveLabel(item, isSelected) {
  if (item.isActive === false) return "Выключен из avatar round robin";
  return isSelected ? "Выбран и активен в avatar round robin" : "Активен в avatar round robin";
}

function renderAvatarVideoPanel(project, character) {
  const videos = character?.avatarVideos || [];
  const videoRows = getProjectAvatarVideoRows(project);
  const canCreate = Boolean(character?.imageData);
  const hasLoadingVideo = videoRows.some(({ video }) => isVideoLoading(video));
  return renderToggleSection("Видео аватаров проекта", `
    <section class="avatar-video-panel">
      <div class="avatar-video-head">
        <div>
          <span class="eyebrow">Хромакей</span>
          <strong>Видео аватаров проекта</strong>
          <small>Reusable ролики 9:16, по пояс, чистый #00FF00. Их можно выключать независимо от выбранного режима генерации.</small>
        </div>
      </div>
      <form id="avatar-video-form" class="ops-form text-editor-form avatar-video-form">
        ${avatarField("Название / эмоция ролика", "name", "Например: спокойная экспертность, тревожное предупреждение, дружелюбный совет", "input", false)}
        ${avatarField("Движение", "motionPrompt", "Небольшие естественные жесты руками, спокойная поза, легкое движение корпуса.", "textarea", false)}
        <button class="secondary-btn" type="submit" ${canCreate ? "" : "disabled"}>Создать хромакей-видео</button>
      </form>
      ${canCreate ? "" : "<small class=\"avatar-system-note\">Для видео нужен одобренный аватар с изображением.</small>"}
      ${renderAvatarVideoList(videoRows)}
    </section>
  `, { section: "video", open: hasLoadingVideo, forceOpen: hasLoadingVideo });
}

function renderAvatarVideoList(videoRows) {
  if (!videoRows.length) return "<small class=\"avatar-system-note\">Видео аватаров проекта еще не создавались.</small>";
  return `
    <div class="avatar-video-list">
      ${videoRows.map(({ character, video }) => `
        <article class="avatar-video-item">
          ${getPlayableVideoUrl(video) ? renderPreviewTrigger({
            src: getPlayableVideoUrl(video),
            title: getVideoStatus(video),
            type: "video",
            className: "avatar-video-preview",
            label: "Открыть видео крупно"
          }) : `<div class="avatar-video-pending">9:16</div>`}
          <div>
            <strong>${escapeHtml(video.name || getVideoStatus(video))}</strong>
            <small>Аватар: ${escapeHtml(character.name || "Без имени")}</small>
            <small>${escapeHtml(getVideoStatus(video))}</small>
            <small>${escapeHtml(video.failMsg || video.motionPrompt)}</small>
            <small>${escapeHtml(getVideoActiveLabel(video))}</small>
            <form class="avatar-video-name-form" data-avatar-video-name-form="${escapeHtml(video.id)}">
              <input name="name" class="text-input" value="${escapeHtml(video.name || "")}" placeholder="Эмоция ролика" />
              <button class="ghost-btn" type="submit">Сохранить</button>
            </form>
            ${video.chromaImageUrl ? `<small>Кадр подготовлен</small>` : ""}
            ${video.alphaStatus === "ready" ? "<small>Прозрачный слой сохранен</small>" : ""}
            ${video.alphaStatus === "converting" ? "<small>Удаляем зеленый фон...</small>" : ""}
            ${video.alphaStatus === "failed" ? `<small>${escapeHtml(video.alphaFailMsg || "Прозрачный слой не создан")}</small>` : ""}
          </div>
          ${video.status === "ready" ? renderAvatarVideoActiveButton(video) : ""}
          ${isVideoLoading(video) ? "<div class=\"avatar-loader\" aria-label=\"Ожидание видео\"><span></span><span></span><span></span></div>" : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function getProjectAvatarVideoRows(project) {
  return (project?.characters || []).flatMap((character) =>
    (character.avatarVideos || []).map((video) => ({ character, video }))
  );
}

function renderAvatarVideoActiveButton(video) {
  const isActive = video.isActive !== false;
  return `
    <button class="ghost-btn" data-avatar-video-active="${escapeHtml(video.id)}" data-avatar-video-next-active="${isActive ? "false" : "true"}" type="button">
      ${isActive ? "Выключить" : "Активировать"}
    </button>
  `;
}

function getVideoActiveLabel(video) {
  if (video.status !== "ready") return "Не участвует в round robin";
  return video.isActive === false ? "Выключено" : "Активно в round robin";
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
  return renderPreviewTrigger({ src, title, className: "avatar-preview-trigger" });
}
