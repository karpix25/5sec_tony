import { getLimitState, getProductsForProject } from "../domain/generation.js";
import { getContext } from "../state/store.js";
import { getAudioPayloads, renderAudioSettings } from "./audio.js";
import { bindAvatarOverlayComposerEvents } from "./avatar-overlay-composer.js";
import { renderAvatarSettings } from "./avatar.js";
import { renderDesignSettings } from "./design.js";
import { bindGenerationPanelEvents, renderStudioPanel } from "./generation.js";
import { bindHooksEvents, renderHooksPanel } from "./hooks.js";
import { escapeHtml } from "./infographic.js";
import { renderCreateProjectModal, renderDeleteProjectModal, renderMediaPreviewModal } from "./modals.js";
import { bindPreviewModalEvents } from "./preview-modal.js";
import { analyzeProductPhotos, getProductPhotoPayloads, productPayloadFromDraft, productReferencesFromImages } from "./product-ai.js";
import { runAudienceExpertAi, runProjectFieldAi, saveProjectAndRefreshAiMemory } from "./project-ai.js";
import { closeDeleteProductModal, getProductReferencePayload, openDeleteProductModal, renderProductSettings } from "./product.js";
import { renderProjectManagementSettings } from "./project.js";
import { renderQueuePanel } from "./queue.js";
import { bindYandexFolderPickers } from "./yandex-folder-picker.js";

export function renderApp(root, store) {
  const state = store.getState();
  const context = getContext(state);
  const projectProducts = getProductsForProject(state.products, context.project.id);

  root.innerHTML = `
    <main class="shell">
      ${renderSidebar(state, context, projectProducts)}
      <section class="workspace">
        ${renderHeader(context)}
        ${renderOperationsPanel(state, context)}
      </section>
    </main>
    ${renderCreateProjectModal(field)}
    ${renderDeleteProjectModal(context)}
    ${renderMediaPreviewModal()}
  `;

  bindEvents(root, store);
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
        ${projectProducts.map((product) => option(product.id, product.name, context.product.id)).join("")}
      </select>
      <button class="secondary-btn sidebar-action" data-project-tab="product" type="button">Открыть продукт</button>
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

function renderHeader({ project }) {
  return `
    <header class="topbar">
      <div>
        <span class="eyebrow">Текущий проект</span>
        <h1>${escapeHtml(project.name)}</h1>
      </div>
      <div class="export-box">
        <span>Экспорт</span>
        <strong>${escapeHtml(project.exportFolder)}</strong>
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

function renderProjectSettingsTabs(state, context) {
  const active = state.selectedProjectTab || "project";
  return `
    <div class="settings-tabs" role="tablist" aria-label="Настройки проекта">
      ${tabButton("project", "Управление", active)}
      ${tabButton("product", "Продукт", active)}
      ${tabButton("design", "Дизайн-референсы", active)}
      ${tabButton("avatars", "Аватары", active)}
      ${tabButton("generation", "Генерация", active)}
      ${tabButton("queue", "Очередь", active)}
    </div>
    <div class="settings-tab-panel">
      ${active === "project" ? renderProjectManagementSettings(context) : ""}
      ${active === "product" ? renderProductSettings(context) : ""}
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
      ${active === "hooks" ? renderHooksPanel() : ""}
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

function bindEvents(root, store) {
  root.querySelector("#project-select")?.addEventListener("change", (event) => store.selectProject(event.target.value));
  root.querySelector("#product-select")?.addEventListener("change", (event) => store.selectProduct(event.target.value));
  root.querySelector("#reference-select")?.addEventListener("change", (event) => store.selectReference(event.target.value));
  root.querySelector("#character-select")?.addEventListener("change", (event) => store.selectCharacter(event.target.value));
  root.querySelector("#audio-select")?.addEventListener("change", (event) => store.selectAudio(event.target.value));
  bindGenerationPanelEvents(root, store);
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
  root.querySelectorAll("[data-close-project-modal]").forEach((button) => {
    button.addEventListener("click", () => closeProjectModal(root));
  });
  root.querySelector("#project-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    store.createProject(getFormPayload(event.currentTarget));
    closeProjectModal(root);
  });
  root.querySelector("#open-product-modal")?.addEventListener("click", () => openProductModal(root));
  root.querySelector("#open-product-fields-modal")?.addEventListener("click", () => openProductFieldsModal(root));
  root.querySelector("#open-product-reference-modal")?.addEventListener("click", () => openProductReferenceModal(root));
  root.querySelector("#open-delete-product-modal")?.addEventListener("click", () => openDeleteProductModal(root));
  root.querySelectorAll("[data-close-product-modal]").forEach((button) => {
    button.addEventListener("click", () => closeProductModal(root));
  });
  root.querySelectorAll("[data-close-product-fields-modal]").forEach((button) => {
    button.addEventListener("click", () => closeProductFieldsModal(root));
  });
  root.querySelectorAll("[data-close-product-reference-modal]").forEach((button) => {
    button.addEventListener("click", () => closeProductReferenceModal(root));
  });
  root.querySelectorAll("[data-close-delete-product-modal]").forEach((button) => {
    button.addEventListener("click", () => closeDeleteProductModal(root));
  });
  root.querySelector("#product-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runCreateProductFromPhotos(root, store, event.currentTarget);
  });
  root.querySelector("#product-settings-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    store.updateProduct(getFormPayload(event.currentTarget));
  });
  root.querySelector("#product-photo-analysis-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runProductPhotoAnalysis(root, store, event.currentTarget);
  });
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
  root.querySelector("#product-reference-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    getProductReferencePayload(event.currentTarget).then((payload) => {
      store.createProductReference(payload);
      closeProductReferenceModal(root);
    });
  });
  root.querySelector("#reference-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    getAssetPayload(event.currentTarget).then((payload) => store.createReference(payload));
  });
  root.querySelector("#reference-template-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    store.createDesignReferenceTemplate(getFormPayload(event.currentTarget));
  });
  root.querySelector("#avatar-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    store.createCharacter(getFormPayload(event.currentTarget));
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
  root.querySelectorAll("[data-avatar-active]").forEach((button) => {
    button.addEventListener("click", () => {
      store.setCharacterActive(button.dataset.avatarActive, button.dataset.avatarNextActive === "true");
    });
  });
  root.querySelector("#audio-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    getAudioPayloads(event.currentTarget).then((payloads) => store.createAudioFiles(payloads));
  });
  root.querySelectorAll("[data-advance]").forEach((button) => {
    button.addEventListener("click", () => store.advanceJob(button.dataset.advance));
  });
  root.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      store.deleteProject(button.dataset.deleteProject);
      closeDeleteProjectModal(root);
    });
  });
  root.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => {
      store.deleteProduct(button.dataset.deleteProduct);
      closeDeleteProductModal(root);
    });
  });
  root.querySelectorAll("[data-delete-product-reference]").forEach((button) => {
    button.addEventListener("click", () => store.deleteProductReference(button.dataset.deleteProductReference));
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
    button.addEventListener("click", () => store.deleteAudio(button.dataset.deleteAudio));
  });
  root.querySelectorAll("[data-delete-job]").forEach((button) => {
    button.addEventListener("click", () => store.deleteJob(button.dataset.deleteJob));
  });
  bindAvatarOverlayComposerEvents(root, store);
  bindHooksEvents(root, () => renderApp(root, store));
}

function getFormPayload(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  form.reset();
  return payload;
}

function getFormSnapshot(form) {
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}

async function runProductPhotoAnalysis(root, store, form) {
  const status = root.querySelector("#product-ai-status");
  const productForm = root.querySelector("#product-settings-form");
  const state = store.getState();
  const context = getContext(state);
  let product = context.product;
  let references = [];
  try {
    if (status) status.textContent = "Анализируем фото и читаем этикетку...";
    const images = await getProductPhotoPayloads(form);
    product = { ...context.product, ...getFormSnapshot(productForm) };
    references = productReferencesFromImages(images);
    const result = await analyzeProductPhotos({ project: context.project, product, images });
    store.updateProduct(productPayloadFromDraft(product, result.draft || {}, references));
  } catch (error) {
    if (references.length) store.updateProduct(productPayloadFromDraft(product, {}, references));
    if (status) status.textContent = error.message || "Не удалось проанализировать фото.";
  }
}

async function runCreateProductFromPhotos(root, store, form) {
  const status = root.querySelector("#new-product-ai-status");
  const state = store.getState();
  const context = getContext(state);
  try {
    if (status) status.textContent = "Создаем продукт и анализируем фото...";
    const images = await getProductPhotoPayloads(form);
    const base = getFormSnapshot(form);
    const references = productReferencesFromImages(images);
    const result = await analyzeProductPhotos({ project: context.project, product: base, images });
    store.createProduct(productPayloadFromDraft(base, result.draft || {}, references));
    closeProductModal(root);
  } catch (error) {
    if (status) status.textContent = error.message || "Не удалось создать продукт по фото.";
  }
}

async function getAssetPayload(form) {
  const file = form.querySelector("input[type='file']")?.files?.[0];
  const payload = getFormPayload(form);
  if (!file) return payload;
  payload.imageName = file.name;
  payload.imageData = await readFileAsDataUrl(file);
  return payload;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
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

function openProductModal(root) {
  const modal = root.querySelector("#product-modal");
  if (!modal) return;
  modal.hidden = false;
  root.querySelector("#product-form input[name='name']")?.focus();
}

function closeProductModal(root) {
  const modal = root.querySelector("#product-modal");
  if (modal) modal.hidden = true;
}

function openProductFieldsModal(root) {
  const modal = root.querySelector("#product-fields-modal");
  if (modal) modal.hidden = false;
}

function closeProductFieldsModal(root) {
  const modal = root.querySelector("#product-fields-modal");
  if (modal) modal.hidden = true;
}

function openProductReferenceModal(root) {
  const modal = root.querySelector("#product-reference-modal");
  if (modal) modal.hidden = false;
}

function closeProductReferenceModal(root) {
  const modal = root.querySelector("#product-reference-modal");
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
