import { escapeHtml } from "./infographic.js";

export function bindPreviewModalEvents(root) {
  if (root.dataset.previewModalBound === "true") return;
  root.dataset.previewModalBound = "true";
  root.addEventListener("click", (event) => {
    const closeTrigger = findClosestEventTarget(event.target, "[data-close-preview-media]");
    if (closeTrigger) {
      event.preventDefault();
      closeMediaPreview(root);
      return;
    }
    const trigger = findClosestEventTarget(event.target, "[data-preview-media]");
    if (trigger) {
      event.preventDefault();
      openMediaPreview(root, trigger);
      return;
    }
    if (isPreviewBackdropClick(event)) {
      event.preventDefault();
      closeMediaPreview(root);
    }
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMediaPreview(root);
  });
}

export function getOpenMediaPreviewState(root) {
  const modal = root.querySelector("#media-preview-modal");
  if (!modal || modal.hidden) return null;
  return {
    src: modal.dataset.previewMedia || "",
    type: modal.dataset.previewType || "",
    title: root.querySelector("#media-preview-title")?.textContent || "Превью",
    key: getPreviewStateKey({
      src: modal.dataset.previewMedia || "",
      type: modal.dataset.previewType || "",
      title: root.querySelector("#media-preview-title")?.textContent || "Превью"
    })
  };
}

export function restoreMediaPreviewState(root, state) {
  if (!state?.src) return;
  if (root.dataset.previewDismissedKey === getPreviewStateKey(state)) return;
  openMediaPreviewFromState(root, state);
}

export function renderPreviewTrigger({ src, title, type = "image", className = "", label = "Открыть превью", content = "" }) {
  if (!src) return "";
  const body = content || renderPreviewTriggerBody(src, type);
  return `
    <button class="${escapeHtml(className)}" data-preview-media="${escapeHtml(src)}" data-preview-type="${escapeHtml(type)}" data-preview-title="${escapeHtml(title || label)}" type="button" aria-label="${escapeHtml(label)}">
      ${body}
    </button>
  `;
}

function renderPreviewTriggerBody(src, type) {
  if (type === "video") return `<video src="${escapeHtml(src)}" muted loop playsinline></video>`;
  return `<img src="${escapeHtml(src)}" alt="">`;
}

function openMediaPreview(root, trigger) {
  const modal = root.querySelector("#media-preview-modal");
  const body = root.querySelector("#media-preview-body");
  const title = root.querySelector("#media-preview-title");
  const src = trigger.dataset.previewMedia || "";
  const type = trigger.dataset.previewType || guessPreviewType(src);
  if (!modal || !body || !title || !src) return;

  title.textContent = trigger.dataset.previewTitle || "Превью";
  openMediaPreviewFromState(root, { src, type, title: title.textContent });
}

function openMediaPreviewFromState(root, state) {
  const modal = root.querySelector("#media-preview-modal");
  const body = root.querySelector("#media-preview-body");
  const title = root.querySelector("#media-preview-title");
  const src = state.src || "";
  const type = state.type || guessPreviewType(src);
  if (!modal || !body || !title || !src) return;

  title.textContent = state.title || "Превью";
  delete root.dataset.previewDismissedKey;
  modal.dataset.previewMedia = src;
  modal.dataset.previewType = type;
  body.innerHTML = type === "video" ? renderPreviewVideo(src) : renderPreviewImage(src);
  modal.hidden = false;
}

function closeMediaPreview(root) {
  const modal = root.querySelector("#media-preview-modal");
  const body = root.querySelector("#media-preview-body");
  if (modal) {
    root.dataset.previewDismissedKey = getPreviewStateKey({
      src: modal.dataset.previewMedia || "",
      type: modal.dataset.previewType || "",
      title: root.querySelector("#media-preview-title")?.textContent || "Превью"
    });
    modal.hidden = true;
    delete modal.dataset.previewMedia;
    delete modal.dataset.previewType;
  }
  if (body) body.innerHTML = "";
}

function renderPreviewImage(src) {
  return `<img src="${escapeHtml(src)}" alt="">`;
}

function renderPreviewVideo(src) {
  const safeSrc = escapeHtml(src);
  return `
    <video src="${safeSrc}" controls autoplay muted loop playsinline></video>
    <div class="media-preview-actions">
      <a href="${safeSrc}" target="_blank" rel="noreferrer">Открыть видео в новой вкладке</a>
    </div>
  `;
}

function guessPreviewType(src) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(src) ? "video" : "image";
}

function isPreviewBackdropClick(event) {
  const target = findClosestEventTarget(event.target, "#media-preview-modal, #media-preview-modal > .modal-backdrop");
  return Boolean(
    target?.matches?.("#media-preview-modal, #media-preview-modal > .modal-backdrop")
  );
}

function getPreviewStateKey(state) {
  return [state?.src || "", state?.type || "", state?.title || ""].join("|");
}

function findClosestEventTarget(target, selector) {
  let node = target || null;
  while (node) {
    if (typeof node.closest === "function") return node.closest(selector);
    if (typeof node.matches === "function" && node.matches(selector)) return node;
    node = node.parentElement || node.parentNode || null;
  }
  return null;
}
