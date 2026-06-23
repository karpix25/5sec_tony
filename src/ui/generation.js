import { escapeHtml } from "./infographic.js";
import { getDesignReferences } from "../domain/references.js";
import { runImageJob } from "./job-runner.js";
import { getCharacterSelectOptions, isNoAvatarCharacterId, noAvatarCharacterId } from "../domain/avatar-selection.js";
import { generateAiBrief } from "../services/brief-ai.js";
import { getContext } from "../state/store.js";

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
          <div id="creative-team-status" class="auto-generation-note">
            AI-команда соберет паспорт продукта, угол внимания, сценарий и короткий промпт для картинки.
          </div>
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
  root.querySelector("#create-job")?.addEventListener("click", async () => {
    const count = Math.max(1, Math.min(10, Number(root.querySelector("#generation-count")?.value || 1)));
    const jobs = canRunCreativeTeamPreflight(store) && typeof store.createJob === "function"
      ? await createCreativeTeamJobs(root, store, count)
      : store.createJobs(count);
    store.selectProjectTab("queue");
    jobs.forEach((job) => runImageJob(store, job.id));
  });
}

function canRunCreativeTeamPreflight(store) {
  return typeof store.getState === "function" && typeof store.updateGenerationBrief === "function";
}

async function runCreativeTeamPreflight(root, store, batch = {}) {
  const status = root.querySelector("#creative-team-status");
  const state = store.getState();
  const context = getContext(state);
  const batchLabel = batch.count > 1 ? ` ${batch.index + 1}/${batch.count}` : "";
  if (status) status.textContent = `AI-команда собирает паспорт продукта, сценарий и промпт${batchLabel}...`;
  try {
    const brief = await generateAiBrief({
      project: context.project,
      product: context.product,
      reference: context.reference,
      existingJobs: state.jobs?.filter((job) => job.projectId === context.project.id) || [],
      hookLibrary: context.hookLibrary
    });
    store.updateGenerationBrief(brief);
    if (status) status.textContent = "AI-команда подготовила сценарий и промпт.";
  } catch (error) {
    if (status) status.textContent = error.message || "AI-команда недоступна, используем локальный fallback.";
  }
}

async function createCreativeTeamJobs(root, store, count) {
  const jobs = [];
  for (let index = 0; index < count; index += 1) {
    await runCreativeTeamPreflight(root, store, { index, count });
    const job = store.createJob();
    if (job) jobs.push(job);
  }
  return jobs;
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
