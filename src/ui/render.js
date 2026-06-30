import { getLimitState, getProductsForProject } from "../domain/generation.js";
import { getContext } from "../state/store.js";
import { getAudioPayloads, renderAudioSettings } from "./audio.js";
import { bindAvatarOverlayComposerEvents } from "./avatar-overlay-composer.js";
import { renderAvatarSettings } from "./avatar.js";
import { bindDesignReferenceFormEvents } from "./design-form.js";
import { bindAiMemoryControls } from "./ai-memory-controls.js";
import { renderDesignSettings } from "./design.js";
import { bindGenerationPanelEvents, renderStudioPanel } from "./generation.js";
import { bindProjectAutomationControls } from "./project-automation-controls.js";
import { bindHooksEvents, renderHooksPanel } from "./hooks.js";
import { escapeHtml } from "./infographic.js";
import { renderCreateProjectModal, renderDeleteProjectModal, renderMediaPreviewModal } from "./modals.js";
import { bindPreviewModalEvents } from "./preview-modal.js";
import { runAudienceExpertAi, runProjectFieldAi, saveProjectAndRefreshAiMemory } from "./project-ai.js";
import { renderProductSettings } from "./product.js";
import { renderProductSelectOptions } from "./product-select.js";
import { bindProductEvents } from "./product-events.js";
import { getFormPayload, getFormSnapshot, readFileAsDataUrl } from "./form-data.js";
import { deleteAudioAsset } from "../services/audio-assets.js";
import { renderProjectManagementSettings } from "./project.js";
import { bindProjectRangeControls } from "./project-range-controls.js";
import { getProjectAutomationState } from "../domain/project-automation.js";
import { bindQueuePanelEvents, renderQueuePanel } from "./queue.js";
import { bindYandexFolderPickers } from "./yandex-folder-picker.js";
import { bindWorkspaceAuthEvents, renderWorkspaceAuthAdmin } from "./auth-workspace.js";
import { renderPersistenceStatus, updatePersistenceStatusView } from "./persistence-status.js";

export function renderApp(root, store, options = {}) {
  const state = store.getState();
  const context = getContext(state);
  const projectProducts = getProductsForProject(state.products, context.project.id);
  const persistenceStatus = store.getPersistenceStatus?.() || {};

  root.innerHTML = `
    <main class="shell">
      ${renderSidebar(state, context, projectProducts)}
      <section class="workspace">
        ${renderHeader(context, persistenceStatus, options.auth)}
        ${renderOperationsPanel(state, context)}
        ${renderWorkspaceAuthAdmin(options.auth)}
      </section>
    </main>
    ${renderCreateProjectModal(field)}
    ${renderDeleteProjectModal(context)}
    ${renderMediaPreviewModal()}
  `;

  bindEvents(root, store, options);
}

export function updatePersistenceStatus(root, status) {
  updatePersistenceStatusView(root, status);
}

function renderSidebar(state, context, projectProducts) {
  return `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">A5</span>
        <div><strong>Anton 5 sec</strong><small>студия инфографики</small></div>
      </div>
      <label class="field-label" for="project-select">Проект</label>
      <select id="project-select" class="select">
        ${state.projects.map((project) => option(project.id, project.name, context.project.id)).join("")}
      </select>
      <button id="open-project-modal" class="primary-btn sidebar-action" type="button">+ Создать проект</button>
      <label class="field-label" for="product-select">Продукт</label>
      <select id="product-select" class="select">
        ${renderProductSelectOptions(projectProducts, context.product.id)}
      </select>
      <button class="secondary-btn sidebar-action" data-project-tab="product" type="button">Открыть продукт</button>
      <button id="open-product-modal" class="ghost-btn sidebar-action" type="button">+ Новый продукт</button>
      ${renderGlobalReferenceNav(state)}
      ${renderLimit(context.project)}
      <button id="open-delete-project-modal" class="danger-btn sidebar-danger" type="button">Опасная зона</button>
    </aside>
  `;
}

function renderGlobalReferenceNav(state) {
  const active = state.selectedProjectTab || "project";
  return `
    <nav class="sidebar-nav" aria-label="Глобальные референсы">
      <span class="field-label">Глобальные референсы</span>
      ${sidebarNavButton("audio", "Аудио", active)}
      ${sidebarNavButton("hooks", "Хуки", active)}
    </nav>
  `;
}

function sidebarNavButton(tab, label, active) {
  return `<button class="sidebar-nav-btn ${tab === active ? "active" : ""}" data-project-tab="${tab}" type="button">${label}</button>`;
}

function renderHeader({ project }, persistenceStatus, auth) {
  const authState = auth?.getState?.() || {};
  return `
    <header class="topbar">
      <div>
        <span class="eyebrow">Текущий проект</span>
        <h1>${escapeHtml(project.name)}</h1>
      </div>
      <div class="export-box">
        <span>Экспорт</span>
        <strong>${escapeHtml(project.exportFolder)}</strong>
        ${renderPersistenceStatus(persistenceStatus)}
        ${authState.user ? `<button class="ghost-btn" data-auth-logout type="button">Выйти</button>` : ""}
      </div>
    </header>
  `;
}

function renderOperationsPanel(state, context) {
  return `
    <section class="panel ops-panel">
      <div class="ops-column assets-column">
        <div class="panel-head compact">
          <div><span class="eyebrow">${isGlobalReferenceTab(state) ? "Общая библиотека" : "Настройки"}</span><h2>${isGlobalReferenceTab(state) ? "Глобальные референсы" : "Настройки проекта"}</h2></div>
        </div>
        ${isGlobalReferenceTab(state) ? renderGlobalReferencePanel(state, context) : renderProjectSettingsTabs(state, context)}
        <small class="asset-summary">${context.project.references.length} рефов · ${context.project.characters.length} персонажей · ${context.audioLibrary.length} глобальных аудио</small>
      </div>
    </section>
  `;
}

function isGlobalReferenceTab(state) {
  return ["audio", "hooks"].includes(state.selectedProjectTab);
}

export function renderProjectSettingsTabs(state, context) {
  const active = state.selectedProjectTab || "project";
  const automationState = getProjectAutomationState({ project: context.project, jobs: state.jobs });
  return `
    <div class="settings-tabs" role="tablist" aria-label="Настройки проекта">
      ${tabButton("project", "Управление", active)}
      ${tabButton("product", "Продукт", active)}
      ${tabButton("design", "Дизайн-референсы", active)}
      ${tabButton("avatars", "Аватар + плашка", active)}
      ${tabButton("generation", "Генерация", active)}
      ${tabButton("queue", "Очередь", active)}
    </div>
    <div class="settings-tab-panel">
      ${active === "project" ? renderProjectManagementSettings({ ...context, automationState }) : ""}
      ${active === "product" ? renderProductSettings({ ...context, product: { ...context.product, projectProductCount: getProductsForProject(state.products, context.project.id).length } }) : ""}
      ${active === "design" ? renderDesignSettings(context) : ""}
      ${active === "avatars" ? renderAvatarSettings(context) : ""}
      ${active === "generation" ? renderStudioPanel(state, context) : ""}
      ${active === "queue" ? renderQueuePanel(state, context) : ""}
    </div>
  `;
}

function renderGlobalReferencePanel(state, context) {
  const active = state.selectedProjectTab || "project";
  return `
    <div class="settings-tabs" role="tablist" aria-label="Глобальные референсы">
      ${tabButton("audio", "Аудио", active)}
      ${tabButton("hooks", "Хуки", active)}
    </div>
    <div class="settings-tab-panel">
      ${active === "audio" ? renderAudioSettings(context) : ""}
      ${active === "hooks" ? renderHooksPanel(state.hookLibrary) : ""}
    </div>
  `;
}

function tabButton(tab, label, active) {
  return `<button class="tab-btn ${tab === active ? "active" : ""}" data-project-tab="${tab}" type="button">${label}</button>`;
}

function renderLimit(project) {
  const limit = getLimitState(project);
  return `
    <div class="limit-card ${limit.isNearLimit ? "warn" : ""}">
      <div><span>Лимит дня</span><strong>${limit.daily.used}/${limit.daily.limit}</strong></div>
      <div class="meter"><i style="width:${limit.percent}%"></i></div>
      <small>Проект: ${limit.total.used}/${limit.total.limit}. Осталось генераций: ${limit.remaining}</small>
    </div>
  `;
}

function option(id, label, selectedId) {
  return `<option value="${id}" ${id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function field(label, name, placeholder, type = "input", required = false) {
  const requiredAttr = required ? "required" : "";
  const escapedLabel = escapeHtml(label);
  const escapedName = escapeHtml(name);
  const escapedPlaceholder = escapeHtml(placeholder);
  const control = type === "textarea"
    ? `<textarea name="${escapedName}" class="textarea editor-textarea" placeholder="${escapedPlaceholder}" ${requiredAttr}></textarea>`
    : `<input name="${escapedName}" class="text-input" placeholder="${escapedPlaceholder}" ${requiredAttr} />`;

  return `<label class="stacked-field"><span>${escapedLabel}</span>${control}</label>`;
}

function bindEvents(root, store, options = {}) {
  root.querySelector("#project-select")?.addEventListener("change", (event) => store.selectProject(event.target.value));
  root.querySelector("#product-select")?.addEventListener("change", (event) => store.selectProduct(event.target.value));
  root.querySelector("#reference-select")?.addEventListener("change", (event) => store.selectReference(event.target.value));
  root.querySelector("#character-select")?.addEventListener("change", (event) => store.selectCharacter(event.target.value));
  root.querySelector("#audio-select")?.addEventListener("change", (event) => store.selectAudio(event.target.value));
  bindGenerationPanelEvents(root, store);
  bindProjectAutomationControls(root, store);
  root.querySelector("#open-project-modal")?.addEventListener("click", () => openProjectModal(root));
  root.querySelector("#open-delete-project-modal")?.addEventListener("click", () => openDeleteProjectModal(root));
  root.querySelectorAll("[data-close-delete-project-modal]").forEach((button) => {
    button.addEventListener("click", () => closeDeleteProjectModal(root));
  });
  root.querySelectorAll("[data-project-tab]").forEach((button) => {
    button.addEventListener("click", () => store.selectProjectTab(button.dataset.projectTab));
  });
  root.querySelectorAll("[data-select-reference]").forEach((button) => {
    button.addEventListener("click", () => store.selectReference(button.dataset.selectReference));
  });
  bindYandexFolderPickers(root);
  bindWorkspaceAuthEvents(root, options.auth);
  root.querySelectorAll("[data-close-project-modal]").forEach((button) => {
    button.addEventListener("click", () => closeProjectModal(root));
  });
  root.querySelector("#project-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    store.createProject(getFormPayload(event.currentTarget));
    closeProjectModal(root);
  });
  bindProductEvents(root, store);
  root.querySelector("#project-settings-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveProjectAndRefreshAiMemory(event.currentTarget, store);
  });
  root.querySelectorAll("[data-ai-project-field]").forEach((button) => {
    button.addEventListener("click", () => runProjectFieldAi(button, store));
  });
  root.querySelector("#audience-expert-ai")?.addEventListener("click", (event) => {
    runAudienceExpertAi(event.currentTarget, store);
  });
  root.querySelector("#generation-brief-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    store.updateGenerationBrief(getFormPayload(event.currentTarget));
  });
  bindDesignReferenceFormEvents(root, store);
  bindAiMemoryControls(root, store);
  bindProjectRangeControls(root);
  root.querySelector("#avatar-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    getAvatarUploadPayload(event.currentTarget).then((payload) => store.uploadCharacter(payload));
  });
  root.querySelector("#avatar-video-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    store.createAvatarVideo(getFormPayload(event.currentTarget));
  });
  root.querySelectorAll("[data-avatar-video-active]").forEach((button) => {
    button.addEventListener("click", () => {
      store.setAvatarVideoActive(button.dataset.avatarVideoActive, button.dataset.avatarVideoNextActive === "true");
    });
  });
  root.querySelectorAll("[data-avatar-video-name-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      store.updateAvatarVideoName?.(form.dataset.avatarVideoNameForm, getFormSnapshot(form).name || "");
    });
  });
  root.querySelectorAll("[data-avatar-active]").forEach((button) => {
    button.addEventListener("click", () => {
      store.setCharacterActive(button.dataset.avatarActive, button.dataset.avatarNextActive === "true");
    });
  });
  root.querySelector("#audio-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    getAudioPayloads(event.currentTarget)
      .then((payloads) => store.createAudioFiles(payloads))
      .catch((error) => window.alert?.(error.message || "Не удалось загрузить аудио"));
  });
  root.querySelectorAll("[data-advance]").forEach((button) => {
    button.addEventListener("click", () => store.advanceJob(button.dataset.advance));
  });
  bindQueuePanelEvents(root, store);
  root.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      store.deleteProject(button.dataset.deleteProject);
      closeDeleteProjectModal(root);
    });
  });
  root.querySelectorAll("[data-delete-reference]").forEach((button) => {
    button.addEventListener("click", () => store.deleteReference(button.dataset.deleteReference));
  });
  root.querySelectorAll("[data-approve-design-reference]").forEach((button) => {
    button.addEventListener("click", () => store.approveDesignReference(button.dataset.approveDesignReference));
  });
  root.querySelectorAll("[data-reject-design-reference]").forEach((button) => {
    button.addEventListener("click", () => store.rejectDesignReference(button.dataset.rejectDesignReference));
  });
  root.querySelectorAll("[data-reset-project-usage]").forEach((button) => {
    button.addEventListener("click", () => store.resetProjectDailyUsage(button.dataset.resetProjectUsage));
  });
  root.querySelectorAll("[data-reset-project-total-usage]").forEach((button) => {
    button.addEventListener("click", () => store.resetProjectTotalUsage(button.dataset.resetProjectTotalUsage));
  });
  root.querySelectorAll("[data-delete-character]").forEach((button) => {
    button.addEventListener("click", () => store.deleteCharacter(button.dataset.deleteCharacter));
  });
  root.querySelectorAll("[data-select-character]").forEach((button) => {
    button.addEventListener("click", () => store.selectCharacter(button.dataset.selectCharacter));
  });
  root.querySelectorAll("[data-approve-avatar]").forEach((button) => {
    button.addEventListener("click", () => store.approveAvatar(button.dataset.approveAvatar));
  });
  root.querySelectorAll("[data-reject-avatar]").forEach((button) => {
    button.addEventListener("click", () => store.rejectAvatar(button.dataset.rejectAvatar));
  });
  bindPreviewModalEvents(root);
  root.querySelectorAll("[data-delete-audio]").forEach((button) => {
    button.addEventListener("click", () => {
      const audio = store.getState().audioLibrary.find((item) => item.id === button.dataset.deleteAudio);
      deleteAudioAsset(audio)
        .then(() => store.deleteAudio(button.dataset.deleteAudio))
        .catch((error) => window.alert?.(error.message || "Не удалось удалить аудио"));
    });
  });
  bindAvatarOverlayComposerEvents(root, store);
  bindHooksEvents(root, { getLibrary: () => store.getState().hookLibrary, saveLibrary: (hookLibrary) => store.updateHookLibrary(hookLibrary), refresh: options.rerender || (() => renderApp(root, store, options)) });
}

function getAvatarUploadPayload(form) {
  const file = form.querySelector("input[type='file']")?.files?.[0];
  const payload = Object.fromEntries(new FormData(form).entries());
  if (!file) return Promise.resolve(payload);
  return readFileAsDataUrl(file).then((imageData) => {
    form.reset();
    return { ...payload, imageName: file.name, imageData };
  });
}

function openProjectModal(root) {
  const modal = root.querySelector("#project-modal");
  if (!modal) return;
  modal.hidden = false;
  root.querySelector("#project-form input[name='name']")?.focus();
}

function closeProjectModal(root) {
  const modal = root.querySelector("#project-modal");
  if (modal) modal.hidden = true;
}

function openDeleteProjectModal(root) {
  const modal = root.querySelector("#delete-project-modal");
  if (modal) modal.hidden = false;
}

function closeDeleteProjectModal(root) {
  const modal = root.querySelector("#delete-project-modal");
  if (modal) modal.hidden = true;
}
