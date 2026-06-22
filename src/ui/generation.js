import { escapeHtml } from "./infographic.js";
import { getDesignReferences } from "../domain/references.js";
import { runImageJob } from "./job-runner.js";
import { getCharacterSelectOptions, isNoAvatarCharacterId, noAvatarCharacterId } from "../domain/avatar-selection.js";
import { bindCtaOverlayControlEvents, renderCtaOverlayControls } from "./cta-overlay-controls.js";

export function renderStudioPanel(state, context) {
  return `
    <section class="embedded-panel studio-panel">
      <div class="panel-head">
        <div><span class="eyebrow">Автогенерация</span><h2>Генерация инфографики</h2></div>
        <button id="create-job" class="primary-btn" type="button">Запустить</button>
      </div>
      <div class="studio-layout">
        <div class="controls generation-controls">
          ${renderReferenceSelect(context)}
          ${renderCharacterSelect(context)}
          ${renderAudioSelect(context)}
          <div class="auto-generation-note">
            Система сама подберет тему, хук, формат и объекты на основе проекта, продукта, референсов и истории генераций.
          </div>
          ${renderGenerationCtaSettings(context.project)}
          <label class="stacked-field">
            <span>Количество</span>
            <input id="generation-count" class="text-input" type="number" min="1" max="10" value="1" />
          </label>
        </div>
      </div>
    </section>
  `;
}

export function bindGenerationPanelEvents(root, store) {
  root.querySelector("#create-job")?.addEventListener("click", () => {
    const count = Math.max(1, Math.min(10, Number(root.querySelector("#generation-count")?.value || 1)));
    const jobs = store.createJobs(count);
    store.selectProjectTab("queue");
    jobs.forEach((job) => runImageJob(store, job.id));
  });
  bindCtaOverlayControlEvents(root, {
    filter(form) {
      return Boolean(form?.closest(".generation-cta-panel"));
    },
    onChange(_projectId, payload) {
      store.updateProjectCtaOverlay(payload);
    },
    onGenerate(_projectId, payload) {
      store.createProjectCtaCandidate(payload);
    },
    onApprove() {
      store.approveProjectCtaCandidate();
    },
    onReset() {
      store.resetProjectCtaOverlay();
    }
  });
}

function renderReferenceSelect({ project, reference }) {
  const references = getDesignReferences(project);
  return `
    <label class="field-label" for="reference-select">Референс визуального стиля</label>
    <select id="reference-select" class="select">
      ${references.map((item) => briefOption(item.id, item.title, reference?.id)).join("")}
    </select>
  `;
}

function renderCharacterSelect({ project, character }) {
  const options = getCharacterSelectOptions(project.characters);
  const selectedId = character?.id || noAvatarCharacterId;
  return `
    <label class="field-label" for="character-select">Персонаж проекта</label>
    <select id="character-select" class="select">
      ${options.map((item) => briefOption(item.id, getCharacterOptionLabel(item), selectedId)).join("")}
    </select>
  `;
}

function renderAudioSelect({ audioLibrary, audio }) {
  return `
    <label class="field-label" for="audio-select">Глобальное аудио</label>
    <select id="audio-select" class="select">
      ${audioLibrary.map((item) => briefOption(item.id, item.title, audio?.id)).join("")}
    </select>
  `;
}

function renderGenerationCtaSettings(project) {
  return `
    <section class="generation-cta-panel">
      <div class="generation-cta-note">Эти настройки работают и в режиме без аватара.</div>
      ${renderCtaOverlayControls({ targetId: project.id, ctaOverlay: project.ctaOverlay, scope: "project" })}
    </section>
  `;
}

function briefOption(id, label, selectedId) {
  return `<option value="${id}" ${id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function characterStatusLabel(status) {
  if (status === "no-avatar") return "без оверлея";
  if (status === "approved") return "готов";
  if (status === "draft") return "черновик";
  return "в работе";
}

function getCharacterOptionLabel(item) {
  if (isNoAvatarCharacterId(item.id)) return item.name;
  return `${item.name} · ${characterStatusLabel(item.status)}`;
}
