import { escapeHtml } from "./infographic.js";
import { normalizeCtaOverlay } from "../domain/cta-overlay.js";
import { bindCtaOverlayControlEvents, getCtaOverlayPayload, renderCtaOverlayControls } from "./cta-overlay-controls.js";

const defaultOverlay = { x: 75, y: 100, scale: 37, opacity: 100 };
const overlayPresets = [
  { id: "lower-center", label: "Снизу центр", settings: { x: 50, y: 100, scale: 37, opacity: 100 } },
  { id: "lower-left", label: "Снизу слева", settings: { x: 25, y: 100, scale: 37, opacity: 100 } },
  { id: "lower-right", label: "Снизу справа", settings: { x: 75, y: 100, scale: 37, opacity: 100 } }
];

export function renderAvatarOverlayComposer(character) {
  const context = normalizeOverlayComposerContext(character);
  const { project, video } = context;
  const ctaScope = video ? "avatar-video" : "project";

  const overlay = normalizeOverlay(video?.overlay);
  const ctaOverlay = normalizeCtaOverlay(video?.ctaOverlay || project?.ctaOverlay);
  const videoUrl = getOverlayVideoUrl(video);
  const canPreview = Boolean(videoUrl);
  return `
    <details class="avatar-overlay-composer" open>
      <summary>
        <span class="eyebrow">Превью слоя</span>
        <strong>Позиция аватара и плашки в ролике</strong>
        <small>${escapeHtml(getAlphaNote(video))}</small>
      </summary>
      <div class="avatar-overlay-workbench">
        <div class="avatar-overlay-stage">
          ${canPreview ? renderOverlayVideo(videoUrl, overlay) : "<div class=\"avatar-overlay-empty\">Аватар еще не создан. Плашку уже можно настраивать.</div>"}
          ${renderCtaOverlayPreview(ctaOverlay)}
        </div>
        <div class="avatar-overlay-control-stack">
          ${canPreview ? `
            <form class="avatar-overlay-controls" data-avatar-overlay-form="${escapeHtml(video.id)}">
              ${renderPresetButtons(video.id)}
              ${renderRange("x", "Горизонталь", overlay.x, 15, 85)}
              ${renderRange("y", "Вертикаль", overlay.y, 45, 100)}
              ${renderRange("scale", "Размер", overlay.scale, 35, 150)}
              ${renderRange("opacity", "Прозрачность", overlay.opacity, 30, 100)}
            </form>
          ` : "<small class=\"avatar-system-note\">Сначала создайте аватар-видео, потом здесь появится настройка его позиции. Плашка уже работает отдельно.</small>"}
          ${renderAvatarCtaControls(video?.id || project?.id || "project-cta", ctaOverlay, ctaScope)}
        </div>
      </div>
    </details>
  `;
}

export function bindAvatarOverlayComposerEvents(root, store) {
  root.querySelectorAll("[data-avatar-overlay-form]").forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("input", () => {
      applyOverlayPreview(form);
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
  bindCtaOverlayControlEvents(root, {
    filter(form) {
      return Boolean(form?.closest(".avatar-overlay-workbench"));
    },
    onInput(form) {
      if (form.closest(".avatar-overlay-workbench")) applyAvatarCtaOverlayPreview(form);
    },
    onChange(targetId, payload, form) {
      if (form?.dataset.ctaScope === "project") {
        store.updateProjectCtaOverlay(payload);
        return;
      }
      store.updateAvatarVideoCtaOverlay(targetId, payload);
    },
    onGenerate(targetId, payload, _button, form) {
      if (form?.dataset.ctaScope === "project") {
        store.createProjectCtaCandidate(payload);
        return;
      }
      store.createAvatarVideoCtaCandidate(targetId, payload);
    },
    onApprove(targetId, _button, form) {
      if (form?.dataset.ctaScope === "project") {
        store.approveProjectCtaCandidate();
        return;
      }
      store.approveAvatarVideoCtaCandidate(targetId);
    }
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

function renderCtaOverlayPreview(ctaOverlay) {
  const badge = ctaOverlay.mode === "badge" ? ctaOverlay.badge || ctaOverlay.candidate : null;
  const style = [
    `left:${ctaOverlay.x}%`,
    `top:${ctaOverlay.y}%`,
    `opacity:${ctaOverlay.opacity / 100}`,
    `transform:translate(-50%, -50%) scale(${ctaOverlay.scale / 100})`,
    `--cta-bg:${badge?.background || ctaOverlay.background}`,
    `--cta-color:${badge?.color || ctaOverlay.color}`,
    `--cta-border:${badge?.border || ctaOverlay.border}`,
    `--cta-radius:${Number(badge?.radius || ctaOverlay.radius)}px`
  ].filter(Boolean).join(";");
  if (badge?.imageUrl) {
    return `
      <img class="avatar-cta-overlay badge image-badge ${ctaOverlay.enabled ? "" : "disabled"}" src="${escapeHtml(badge.imageUrl)}" alt="${escapeHtml(ctaOverlay.text)}" style="${style}">
    `;
  }
  return `
    <div class="avatar-cta-overlay ${ctaOverlay.mode} ${ctaOverlay.enabled ? "" : "disabled"}" style="${style}">
      ${escapeHtml(ctaOverlay.text)}
    </div>
  `;
}

function renderAvatarCtaControls(videoId, ctaOverlay, scope) {
  return renderCtaOverlayControls({ targetId: videoId, ctaOverlay, scope });
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

function applyAvatarCtaOverlayPreview(form) {
  const ctaOverlay = normalizeCtaOverlay(getCtaOverlayPayload(form));
  const stage = form.closest(".avatar-overlay-workbench")?.querySelector(".avatar-overlay-stage");
  const preview = stage?.querySelector(".avatar-cta-overlay");
  if (!preview) return;
  if (preview.tagName !== "IMG") preview.textContent = ctaOverlay.text;
  preview.classList.toggle("disabled", !ctaOverlay.enabled);
  preview.classList.toggle("text", ctaOverlay.mode === "text");
  preview.classList.toggle("badge", ctaOverlay.mode === "badge");
  preview.style.left = `${ctaOverlay.x}%`;
  preview.style.top = `${ctaOverlay.y}%`;
  preview.style.opacity = String(ctaOverlay.opacity / 100);
  preview.style.transform = `translate(-50%, -50%) scale(${ctaOverlay.scale / 100})`;
}

function normalizeOverlayComposerContext(input) {
  if (input && typeof input === "object" && ("project" in input || "character" in input)) {
    return {
      project: input.project || null,
      character: input.character || null,
      video: getLatestAvatarVideo(input.character || null)
    };
  }
  return {
    project: null,
    character: input || null,
    video: getLatestAvatarVideo(input || null)
  };
}

function getLatestAvatarVideo(character) {
  const videos = character?.avatarVideos || [];
  return videos.find((video) => video.isActive !== false) || videos[0];
}

function getOverlayVideoUrl(video) {
  if (!video) return "";
  return video.alphaVideoUrl || video.compositeVideoUrl || video.videoUrl || "";
}

function getAlphaNote(video) {
  if (!video) return "Плашку можно настроить заранее, даже если аватар еще не создан.";
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
    scale: clampOverlayNumber(payload.scale, defaultOverlay.scale, 35, 150),
    opacity: clampOverlayNumber(payload.opacity, defaultOverlay.opacity, 30, 100)
  };
}

function clampOverlayNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
