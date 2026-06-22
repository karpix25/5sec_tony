import { escapeHtml } from "./infographic.js";

const userStatuses = ["pending", "approved", "rejected", "blocked"];

export function renderAdminAuthPanel(state = {}) {
  const users = Array.isArray(state.adminUsers) ? state.adminUsers : [];
  const activeStatus = state.adminStatus || "pending";
  return `
    <section class="auth-admin-panel" aria-label="Админ-панель доступа">
      <div class="auth-section-head">
        <div>
          <span class="eyebrow">Админ</span>
          <h2>Заявки пользователей</h2>
        </div>
        <button class="ghost-btn" data-auth-admin-refresh type="button">Обновить</button>
      </div>
      <div class="auth-admin-tabs" role="tablist" aria-label="Статус пользователей">
        ${userStatuses.map((status) => renderAdminStatusButton(status, activeStatus)).join("")}
      </div>
      ${state.adminError ? `<p class="auth-alert danger">${escapeHtml(state.adminError)}</p>` : ""}
      ${state.adminLoading ? "<p class=\"auth-muted\">Загружаем пользователей...</p>" : renderAdminUserList(users)}
    </section>
  `;
}

function renderAdminStatusButton(status, activeStatus) {
  return `
    <button class="auth-tab ${status === activeStatus ? "active" : ""}" data-auth-admin-status="${status}" type="button">
      ${getStatusLabel(status)}
    </button>
  `;
}

function renderAdminUserList(users) {
  if (!users.length) return "<p class=\"auth-muted\">В этом статусе пока никого нет.</p>";
  return `
    <div class="auth-user-list">
      ${users.map(renderAdminUser).join("")}
    </div>
  `;
}

function renderAdminUser(user = {}) {
  const id = user.id || user.userId || user.telegramId || "";
  const title = user.name || user.username || user.telegramUsername || `ID ${id}`;
  const subtitle = [
    user.username || user.telegramUsername ? `@${String(user.username || user.telegramUsername).replace(/^@/, "")}` : "",
    user.telegramId ? `tg: ${user.telegramId}` : "",
    user.requestedAt ? `заявка: ${formatAuthDate(user.requestedAt)}` : ""
  ].filter(Boolean).join(" · ");
  return `
    <article class="auth-user-row">
      <div class="auth-user-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(subtitle || getStatusLabel(user.status))}</small>
      </div>
      <div class="auth-user-actions">
        ${renderActionButton(id, "approve", "Одобрить", "primary-btn")}
        ${renderActionButton(id, "reject", "Отклонить", "secondary-btn")}
        ${renderActionButton(id, "block", "Блок", "danger-btn")}
      </div>
    </article>
  `;
}

function renderActionButton(id, action, label, className) {
  if (!id) return "";
  return `<button class="${className}" data-auth-user-action="${action}" data-auth-user-id="${escapeHtml(id)}" type="button">${label}</button>`;
}

function getStatusLabel(status) {
  return {
    pending: "Ожидают",
    approved: "Одобрены",
    rejected: "Отклонены",
    blocked: "Заблокированы"
  }[status] || "Пользователи";
}

function formatAuthDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}
