import { escapeHtml } from "./infographic.js";

const defaultOverlay = { x: 50, y: 98, scale: 96, opacity: 100 };
const overlayPresets = [
  { id: "lower-center", label: "Снизу центр", settings: { x: 50, y: 98, scale: 96, opacity: 100 } },
  { id: "lower-left", label: "Снизу слева", settings: { x: 32, y: 98, scale: 92, opacity: 100 } },
  { id: "lower-right", label: "Снизу справа", settings: { x: 68, y: 98, scale: 92, opacity: 100 } }
];

export function renderAvatarOverlayComposer(character) {
  const video = getLatestAvatarVideo(character);
  if (!video) return "";

  const overlay = normalizeOverlay(video.overlay);
  const videoUrl = getOverlayVideoUrl(video);
  const canPreview = Boolean(videoUrl);
  return `
    <section class="avatar-overlay-composer">
      <div class="avatar-video-head">
        <div>
          <span class="eyebrow">Превью слоя</span>
          <strong>Позиция аватара в ролике</strong>
          <small>${escapeHtml(getAlphaNote(video))}</small>
        </div>
      </div>
      <div class="avatar-overlay-workbench">
        <div class="avatar-overlay-stage">
          ${canPreview ? renderOverlayVideo(videoUrl, overlay) : "<div class=\"avatar-overlay-empty\">Видео еще готовится</div>"}
        </div>
        <form class="avatar-overlay-controls" data-avatar-overlay-form="${escapeHtml(video.id)}">
          ${renderPresetButtons(video.id)}
          ${renderRange("x", "Горизонталь", overlay.x, 15, 85)}
          ${renderRange("y", "Вертикаль", overlay.y, 45, 100)}
          ${renderRange("scale", "Размер", overlay.scale, 60, 150)}
          ${renderRange("opacity", "Прозрачность", overlay.opacity, 30, 100)}
        </form>
      </div>
    </section>
  `;
}

export function bindAvatarOverlayComposerEvents(root, store) {
  root.querySelectorAll("[data-avatar-overlay-form]").forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("input", () => {
      applyOverlayPreview(form);
      store.updateAvatarVideoOverlay(form.dataset.avatarOverlayForm, getOverlayPayload(form));
    });
    form.addEventListener("change", () => {
      store.updateAvatarVideoOverlay(form.dataset.avatarOverlayForm, getOverlayPayload(form));
    });
  });
  root.querySelectorAll("[data-avatar-overlay-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = overlayPresets.find((item) => item.id === button.dataset.avatarOverlayPreset);
      if (!preset) return;
      const form = button.closest("[data-avatar-overlay-form]");
      setOverlayFormPayload(form, preset.settings);
      applyOverlayPreview(form);
      store.updateAvatarVideoOverlay(button.dataset.avatarVideoId, preset.settings);
    });
  });
}

function applyOverlayPreview(form) {
  const overlay = normalizeOverlay(getOverlayPayload(form));
  const stage = form.closest(".avatar-overlay-workbench")?.querySelector(".avatar-overlay-stage");
  const video = stage?.querySelector(".avatar-overlay-video");
  if (!video) return;

  video.style.left = `${overlay.x}%`;
  video.style.top = `${overlay.y}%`;
  video.style.width = `${overlay.scale}%`;
  video.style.opacity = String(overlay.opacity / 100);
  updateRangeLabels(form, overlay);
}

function setOverlayFormPayload(form, overlay) {
  if (!form) return;
  Object.entries(normalizeOverlay(overlay)).forEach(([name, value]) => {
    const input = form.querySelector(`input[name="${name}"]`);
    if (input) input.value = String(value);
  });
}

function updateRangeLabels(form, overlay) {
  Object.entries(overlay).forEach(([name, value]) => {
    const label = form.querySelector(`input[name="${name}"]`)?.closest(".avatar-overlay-range");
    const valueNode = label?.querySelector("b");
    if (valueNode) valueNode.textContent = String(value);
  });
}

function renderOverlayVideo(videoUrl, overlay) {
  const style = [
    `left:${overlay.x}%`,
    `top:${overlay.y}%`,
    `width:${overlay.scale}%`,
    `opacity:${overlay.opacity / 100}`,
    "transform:translate(-50%, -100%)"
  ].join(";");
  return `<video class="avatar-overlay-video" src="${escapeHtml(videoUrl)}" style="${style}" autoplay muted loop playsinline></video>`;
}

function renderPresetButtons(videoId) {
  return `
    <div class="avatar-overlay-presets">
      ${overlayPresets.map((preset) => `
        <button class="ghost-btn" data-avatar-video-id="${escapeHtml(videoId)}" data-avatar-overlay-preset="${preset.id}" type="button">${escapeHtml(preset.label)}</button>
      `).join("")}
    </div>
  `;
}

function renderRange(name, label, value, min, max) {
  return `
    <label class="avatar-overlay-range">
      <span>${escapeHtml(label)} <b>${Number(value)}</b></span>
      <input name="${name}" type="range" min="${min}" max="${max}" value="${Number(value)}">
    </label>
  `;
}

function getOverlayPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function getLatestAvatarVideo(character) {
  return (character?.avatarVideos || [])[0];
}

function getOverlayVideoUrl(video) {
  return video.alphaVideoUrl || video.compositeVideoUrl || video.videoUrl || "";
}

function getAlphaNote(video) {
  if (video.alphaStatus === "ready") return "Сохранена прозрачная WEBM-версия. Ее можно двигать поверх будущего ролика.";
  if (video.alphaStatus === "converting") return "Удаляем зеленый фон и сохраняем прозрачный слой.";
  if (video.alphaStatus === "failed") return video.alphaFailMsg || "Прозрачность не создана, показан исходный хромакей.";
  if (video.videoUrl) return "Хромакей готов, прозрачный слой появится после обработки.";
  return "Слой появится после генерации видео.";
}

function normalizeOverlay(payload = {}) {
  return {
    x: clampOverlayNumber(payload.x, defaultOverlay.x, 15, 85),
    y: clampOverlayNumber(payload.y, defaultOverlay.y, 45, 100),
    scale: clampOverlayNumber(payload.scale, defaultOverlay.scale, 60, 150),
    opacity: clampOverlayNumber(payload.opacity, defaultOverlay.opacity, 30, 100)
  };
}

function clampOverlayNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
