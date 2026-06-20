import { normalizeCtaOverlay } from "../domain/cta-overlay.js";
import { escapeHtml } from "./infographic.js";

export function renderCtaOverlayControls({ targetId, ctaOverlay, className = "", title = "Плашка / текст" }) {
  const normalized = normalizeCtaOverlay(ctaOverlay);
  const isGeneratingBadge = ["submitting", "generating"].includes(normalized.candidate?.status);
  return `
    <form class="avatar-cta-controls ${escapeHtml(className)}" data-cta-overlay-form="${escapeHtml(targetId)}">
      <div class="avatar-cta-head">
        <strong>${escapeHtml(title)}</strong>
        <label><input name="enabled" type="checkbox" ${normalized.enabled ? "checked" : ""}> Включено</label>
      </div>
      <div class="avatar-cta-mode">
        ${renderCtaModeRadio("text", "Текст", normalized.mode)}
        ${renderCtaModeRadio("badge", "Плашка", normalized.mode)}
      </div>
      <label class="avatar-overlay-range">
        <span>Текст</span>
        <input name="text" class="text-input" value="${escapeHtml(normalized.text)}" maxlength="32">
      </label>
      <label class="avatar-overlay-range avatar-cta-prompt-field">
        <span>Промт генерации плашки</span>
        <textarea name="prompt" class="textarea" maxlength="280" placeholder="Например: яркая заметная плашка в стиле выбранного референса, без логотипов">${escapeHtml(normalized.prompt || "")}</textarea>
      </label>
      ${renderCtaControlRange("x", "CTA горизонталь", normalized.x, 5, 95)}
      ${renderCtaControlRange("y", "CTA вертикаль", normalized.y, 5, 95)}
      ${renderCtaControlRange("scale", "CTA размер", normalized.scale, 60, 150)}
      ${renderCtaControlRange("opacity", "CTA прозрачность", normalized.opacity, 20, 100)}
      <div class="avatar-cta-actions">
        <button class="ghost-btn" data-cta-generate="${escapeHtml(targetId)}" type="button" ${isGeneratingBadge ? "disabled" : ""}>
          ${isGeneratingBadge ? "Генерируем..." : "Сгенерировать плашку"}
        </button>
        ${normalized.candidate?.status === "review" ? `<button class="secondary-btn" data-cta-approve="${escapeHtml(targetId)}" type="button">Апрув плашки</button>` : ""}
        ${renderCtaStatusPill(normalized.candidate)}
      </div>
      ${renderCtaCandidateStatus(normalized.candidate)}
    </form>
  `;
}

export function bindCtaOverlayControlEvents(root, handlers = {}) {
  root.querySelectorAll("[data-cta-overlay-form]").forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("input", () => {
      const payload = getCtaOverlayPayload(form);
      updateCtaRangeLabels(form, normalizeCtaOverlay(payload));
      handlers.onInput?.(form, payload);
    });
    form.addEventListener("change", () => {
      handlers.onChange?.(form.dataset.ctaOverlayForm, getCtaOverlayPayload(form), form);
    });
  });
  root.querySelectorAll("[data-cta-generate]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest("[data-cta-overlay-form]");
      setCtaGenerateButtonBusy(button, form);
      handlers.onGenerate?.(button.dataset.ctaGenerate, getCtaOverlayPayload(form), button, form);
    });
  });
  root.querySelectorAll("[data-cta-approve]").forEach((button) => {
    button.addEventListener("click", () => {
      handlers.onApprove?.(button.dataset.ctaApprove, button);
    });
  });
}

export function getCtaOverlayPayload(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  return { ...payload, enabled: payload.enabled === "on" };
}

function renderCtaStatusPill(candidate) {
  if (!candidate) return "";
  if (candidate.status === "failed") return "<span class=\"avatar-cta-status failed\">Ошибка</span>";
  if (candidate.status === "review") return "<span class=\"avatar-cta-status ready\">Готово</span>";
  return "<span class=\"avatar-cta-status loading\">Генерация...</span>";
}

function renderCtaCandidateStatus(candidate) {
  if (!candidate) return "";
  if (candidate.status === "failed") return `<small>Ошибка плашки: ${escapeHtml(candidate.failMsg || "не удалось сгенерировать")}</small>`;
  if (candidate.status === "review") return "<small>AI-плашка готова. Нажмите апрув, чтобы использовать ее в видео.</small>";
  return "<small data-cta-status-note>Генерируем AI-плашку. После готовности появится апрув.</small>";
}

function renderCtaModeRadio(value, label, mode) {
  return `
    <label>
      <input name="mode" type="radio" value="${value}" ${mode === value ? "checked" : ""}>
      ${escapeHtml(label)}
    </label>
  `;
}

function renderCtaControlRange(name, label, value, min, max) {
  return `
    <label class="avatar-overlay-range">
      <span>${escapeHtml(label)} <b>${Number(value)}</b></span>
      <input name="${name}" type="range" min="${min}" max="${max}" value="${Number(value)}">
    </label>
  `;
}

function updateCtaRangeLabels(form, overlay) {
  ["x", "y", "scale", "opacity"].forEach((name) => {
    const label = form.querySelector(`input[name="${name}"]`)?.closest(".avatar-overlay-range");
    const valueNode = label?.querySelector("b");
    if (valueNode) valueNode.textContent = String(overlay[name]);
  });
}

function setCtaGenerateButtonBusy(button, form) {
  button.disabled = true;
  button.textContent = "Генерируем...";
  const actions = button.closest(".avatar-cta-actions");
  const status = actions?.querySelector(".avatar-cta-status");
  if (status) {
    status.className = "avatar-cta-status loading";
    status.textContent = "Генерация...";
  } else {
    actions?.insertAdjacentHTML("beforeend", "<span class=\"avatar-cta-status loading\">Генерация...</span>");
  }
  const note = form?.querySelector("[data-cta-status-note]");
  if (note) note.textContent = "Генерируем AI-плашку. После готовности появится апрув.";
  else form?.insertAdjacentHTML("beforeend", "<small data-cta-status-note>Генерируем AI-плашку. После готовности появится апрув.</small>");
}
