import { escapeHtml } from "./infographic.js";
import { getDesignReferences } from "../domain/references.js";
import { getCharacterSelectOptions, isNoAvatarCharacterId, noAvatarCharacterId } from "../domain/avatar-selection.js";
import { getContext } from "../state/store.js";
import { createServerGenerationBatch } from "../services/generation-batches.js";

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
          <label class="generation-mode-toggle">
            <input id="generation-distribute-products" type="checkbox" />
            <span>Распределить по всем продуктам проекта</span>
          </label>
        </div>
      </div>
    </section>
  `;
}

export function bindGenerationPanelEvents(root, store) {
  root.querySelector("#create-job")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (button?.dataset?.busy === "true") return;
    const count = Math.max(1, Math.min(10, Number(root.querySelector("#generation-count")?.value || 1)));
    const status = root.querySelector("#creative-team-status");
    setLaunchBusy(button, status, true);
    let jobs = [];
    let reservation = null;
    try {
      if (!canRunCreativeTeamPreflight(store)) {
        throw new Error("Серверная очередь генерации недоступна");
      }
      const distributeProducts = shouldDistributeProducts(root);
      const selection = createGenerationSelection(store, root);
      reservation = store.createPendingServerGenerationBatch({
        count,
        distributeProducts,
        selection
      });
      if (reservation.accepted === false) {
        store.selectProjectTab("queue");
        if (status) status.textContent = `${reservation.reason || "Очередь не создала задачи"}. Генерация не запущена.`;
        return;
      }
      if (status) status.textContent = "Задача добавлена в очередь. Сервер подтверждает запуск...";
      const payload = await createServerGenerationBatch({
        count,
        distributeProducts,
        selection,
        reservation: {
          batchId: reservation.batchId,
          jobIds: reservation.jobs.map((job) => job.id)
        }
      });
      jobs = store.mergeServerJobs(payload.jobs || []);
      if (!jobs.length) throw new Error("Сервер не вернул созданные задачи");
      store.selectProjectTab("queue");
      if (status) status.textContent = jobs.length
        ? `Серверная очередь приняла ${jobs.length} из ${count}.`
        : "Очередь не создала задачи. Проверьте лимиты проекта.";
    } catch (error) {
      if (reservation?.batchId) {
        store.failPendingGenerationBatch(reservation.batchId, error.message || "Серверная очередь недоступна");
        store.selectProjectTab("queue");
      }
      if (status) status.textContent = `${error.message || "Серверная очередь недоступна"}. Генерация не запущена.`;
    } finally {
      setLaunchBusy(button, status, false);
    }
  });
}

function setLaunchBusy(button, status, busy) {
  if (button?.dataset) button.dataset.busy = busy ? "true" : "false";
  if (button) {
    if (busy) button.setAttribute("disabled", "");
    else button.removeAttribute("disabled");
  }
  if (busy && status) status.textContent = "Передаем запуск серверной очереди...";
}

function canRunCreativeTeamPreflight(store) {
  return typeof store.getState === "function"
    && typeof store.createPendingServerGenerationBatch === "function"
    && typeof store.failPendingGenerationBatch === "function"
    && typeof store.mergeServerJobs === "function"
    && typeof store.selectProjectTab === "function";
}

function shouldDistributeProducts(root) {
  return Boolean(root.querySelector("#generation-distribute-products")?.checked);
}

function createGenerationSelection(store, root) {
  const state = store.getState();
  return {
    projectId: state.selectedProjectId || "",
    productId: state.selectedProductId || "",
    referenceId: readVisibleControlValue(root, "#reference-select", state.selectedReferenceId),
    characterId: readVisibleControlValue(root, "#character-select", state.selectedCharacterId || noAvatarCharacterId),
    audioId: readVisibleControlValue(root, "#audio-select", state.selectedAudioId),
    freePrompt: state.freePrompt || ""
  };
}

function readVisibleControlValue(root, selector, fallback = "") {
  return root.querySelector(selector)?.value || fallback || "";
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
