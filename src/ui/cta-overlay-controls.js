import { normalizeCtaOverlay } from "../domain/cta-overlay.js";
import { escapeHtml } from "./infographic.js";

export function renderCtaOverlayControls({ targetId, ctaOverlay, className = "", title = "Плашка / текст", scope = "project" }) {
  const normalized = normalizeCtaOverlay(ctaOverlay);
  const statusView = getCtaStatusView(normalized);
  return `
    <form class="avatar-cta-controls ${escapeHtml(className)}" data-cta-overlay-form="${escapeHtml(targetId)}" data-cta-scope="${escapeHtml(scope)}">
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
        <button class="ghost-btn" data-cta-generate="${escapeHtml(targetId)}" type="button" ${statusView.isBusy ? "disabled" : ""}>
          ${escapeHtml(statusView.generateLabel)}
        </button>
        ${statusView.canApprove ? `<button class="secondary-btn" data-cta-approve="${escapeHtml(targetId)}" type="button">Апрув плашки</button>` : ""}
        ${renderCtaStatusPill(statusView)}
      </div>
      ${renderCtaCandidateStatus(statusView)}
    </form>
  `;
}

export function bindCtaOverlayControlEvents(root, handlers = {}) {
  root.querySelectorAll("[data-cta-overlay-form]").forEach((form) => {
    if (handlers.filter && !handlers.filter(form)) return;
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
      if (handlers.filter && !handlers.filter(form)) return;
      setCtaGenerateButtonBusy(button, form);
      handlers.onGenerate?.(button.dataset.ctaGenerate, getCtaOverlayPayload(form), button, form);
    });
  });
  root.querySelectorAll("[data-cta-approve]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest("[data-cta-overlay-form]");
      if (handlers.filter && !handlers.filter(form)) return;
      button.disabled = true;
      button.textContent = "Апрувим...";
      handlers.onApprove?.(button.dataset.ctaApprove, button, form);
    });
  });
}

export function getCtaOverlayPayload(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  return { ...payload, enabled: payload.enabled === "on" };
}

function renderCtaStatusPill(statusView) {
  if (!statusView.label) return "";
  return `<span class="avatar-cta-status ${escapeHtml(statusView.tone)}">${escapeHtml(statusView.label)}</span>`;
}

function renderCtaCandidateStatus(statusView) {
  if (!statusView.note) return "";
  return `<small data-cta-status-note>${escapeHtml(statusView.note)}</small>`;
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
  button.textContent = "Отправляем...";
  const actions = button.closest(".avatar-cta-actions");
  const status = actions?.querySelector(".avatar-cta-status");
  if (status) {
    status.className = "avatar-cta-status loading";
    status.textContent = "Стартуем...";
  } else {
    actions?.insertAdjacentHTML("beforeend", "<span class=\"avatar-cta-status loading\">Стартуем...</span>");
  }
  const note = form?.querySelector("[data-cta-status-note]");
  if (note) note.textContent = "Отправляем запрос на AI-плашку. После рендера появится апрув.";
  else form?.insertAdjacentHTML("beforeend", "<small data-cta-status-note>Отправляем запрос на AI-плашку. После рендера появится апрув.</small>");
}

function getCtaStatusView(overlay) {
  const candidate = overlay.candidate;
  if (candidate?.status === "failed") {
    return {
      isBusy: false,
      canApprove: false,
      generateLabel: "Сгенерировать заново",
      label: "Ошибка",
      tone: "failed",
      note: candidate.failMsg || "Не удалось сгенерировать плашку."
    };
  }
  if (candidate?.status === "review") {
    return {
      isBusy: false,
      canApprove: true,
      generateLabel: "Сгенерировать заново",
      label: "Ждет апрува",
      tone: "ready",
      note: "AI-плашка готова. Проверьте превью и нажмите апрув, чтобы использовать ее в видео."
    };
  }
  if (candidate?.status === "generating") {
    return {
      isBusy: true,
      canApprove: false,
      generateLabel: "Генерируем...",
      label: "Рендерим",
      tone: "loading",
      note: "AI уже рендерит плашку. Как только файл будет готов, здесь появится апрув."
    };
  }
  if (candidate?.status === "submitting") {
    return {
      isBusy: true,
      canApprove: false,
      generateLabel: "Отправляем...",
      label: "Отправляем",
      tone: "loading",
      note: "Отправляем запрос на генерацию плашки."
    };
  }
  if (overlay.badge?.status === "approved") {
    return {
      isBusy: false,
      canApprove: false,
      generateLabel: "Сгенерировать заново",
      label: "Используется",
      tone: "ready",
      note: "Апрувнутая AI-плашка уже используется в превью и финальном видео."
    };
  }
  return {
    isBusy: false,
    canApprove: false,
    generateLabel: "Сгенерировать плашку",
    label: "Стандарт",
    tone: "idle",
    note: "Сейчас используется стандартная плашка проекта. Можно сгенерировать AI-вариант и апрувнуть его."
  };
}
