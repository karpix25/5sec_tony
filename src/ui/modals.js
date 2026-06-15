import { escapeHtml } from "./infographic.js";

export function renderCreateProjectModal(field) {
  return `
    <div id="project-modal" class="modal-shell" hidden>
      <div class="modal-backdrop" data-close-project-modal></div>
      <section class="panel project-modal">
        <div class="panel-head compact">
          <div><span class="eyebrow">Новый проект</span><h2>Создать проект</h2></div>
          <button class="danger-icon" data-close-project-modal type="button" aria-label="Закрыть">×</button>
        </div>
        <form id="project-form" class="ops-form text-editor-form create-project-form">
          ${field("Название проекта", "name", "Например: БАДы", "input", true)}
          ${field("Первый продукт", "productName", "Например: Магний вечерний", "input", true)}
          <button class="secondary-btn" type="submit">+ Создать проект</button>
        </form>
      </section>
    </div>
  `;
}

export function renderDeleteProjectModal({ project }) {
  return `
    <div id="delete-project-modal" class="modal-shell" hidden>
      <div class="modal-backdrop" data-close-delete-project-modal></div>
      <section class="panel project-modal danger-modal">
        <div class="panel-head compact">
          <div><span class="eyebrow">Удаление</span><h2>Удалить проект</h2></div>
          <button class="danger-icon" data-close-delete-project-modal type="button" aria-label="Закрыть">×</button>
        </div>
        <div class="danger-zone">
          <div>
            <strong>${escapeHtml(project.name)}</strong>
            <small>Будут удалены продукты, задачи, аудио, дизайн-референсы и аватары этого проекта.</small>
          </div>
          <button class="danger-btn" data-delete-project="${project.id}" type="button">Удалить проект навсегда</button>
        </div>
      </section>
    </div>
  `;
}

export function renderAvatarPreviewModal() {
  return `
    <div id="avatar-preview-modal" class="modal-shell" hidden>
      <div class="modal-backdrop" data-close-avatar-preview></div>
      <section class="avatar-preview-modal">
        <div class="avatar-preview-head">
          <strong id="avatar-preview-title">Превью аватара</strong>
          <button class="danger-icon" data-close-avatar-preview type="button" aria-label="Закрыть">×</button>
        </div>
        <img id="avatar-preview-image" src="" alt="">
      </section>
    </div>
  `;
}

export function renderAssetPreviewModal() {
  return `
    <div id="asset-preview-modal" class="modal-shell" hidden>
      <div class="modal-backdrop" data-close-asset-preview></div>
      <section class="avatar-preview-modal">
        <div class="avatar-preview-head">
          <strong id="asset-preview-title">Превью референса</strong>
          <button class="danger-icon" data-close-asset-preview type="button" aria-label="Закрыть">×</button>
        </div>
        <img id="asset-preview-image" src="" alt="">
      </section>
    </div>
  `;
}
