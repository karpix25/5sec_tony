import {
  getCurrentAuthUser,
  getTelegramLoginConfig,
  listAdminAuthUsers,
  loginWithTelegramIdToken,
  logoutAuthUser,
  openTelegramLogin,
  runAdminAuthUserAction,
} from "../services/auth-client.js";
import { escapeHtml } from "./infographic.js";
import { renderAdminAuthPanel } from "./auth-admin.js";

export function createAuthState(overrides = {}) {
  return {
    status: "loading",
    user: null,
    error: "",
    adminUsers: [],
    adminStatus: "pending",
    adminLoading: false,
    adminError: "",
    ...overrides
  };
}

export function createAuthController(options = {}) {
  const root = options.root || null;
  const onAuthorized = options.onAuthorized || (() => {});
  const onStateChange = options.onStateChange || (() => {});
  const renderApprovedState = options.renderApprovedState !== false;
  let state = createAuthState(options.initialState);
  let telegramLoginConfig = null;

  async function start() {
    updateState({ status: "loading", error: "" });
    try {
      const session = await getCurrentAuthUser();
      if (!getAuthPayloadUser(session)) {
        await ensureTelegramLoginConfig();
        updateState({ status: "login", user: null, error: "" });
        return;
      }
      await acceptAuthPayload(session);
    } catch {
      updateState({ status: "login", user: null, error: "" });
    }
  }

  async function loginFromTelegram() {
    updateState({ status: "loading", error: "" });
    try {
      const config = await ensureTelegramLoginConfig();
      const result = await openTelegramLogin(config.clientId, { scope: config.scope });
      const session = await loginWithTelegramIdToken(result.id_token);
      await acceptAuthPayload(session);
    } catch (error) {
      updateState({ status: "error", error: error.message || "Ошибка входа" });
    }
  }

  async function ensureTelegramLoginConfig() {
    if (!telegramLoginConfig) telegramLoginConfig = await getTelegramLoginConfig();
    return telegramLoginConfig;
  }

  async function acceptAuthPayload(payload = {}) {
    const user = payload.user || payload.authUser || null;
    const status = getAccessStatus(payload, user);
    updateState({ status, user, error: payload.error || "" });
    if (status === "approved") {
      onAuthorized(payload);
      if (isAdminUser(user)) await loadAdminUsers();
    }
  }

  async function logout() {
    updateState({ status: "loading", error: "" });
    try {
      await logoutAuthUser();
      updateState(createAuthState({ status: "login" }));
    } catch (error) {
      updateState({ status: "error", error: error.message || "Ошибка выхода" });
    }
  }

  async function loadAdminUsers(status = state.adminStatus) {
    updateState({ adminStatus: status, adminLoading: true, adminError: "" });
    try {
      const payload = await listAdminAuthUsers({ status });
      updateState({ adminUsers: payload.users || payload.items || [], adminLoading: false });
    } catch (error) {
      updateState({ adminLoading: false, adminError: error.message || "Ошибка загрузки" });
    }
  }

  async function runAdminAction(userId, action) {
    updateState({ adminLoading: true, adminError: "" });
    try {
      await runAdminAuthUserAction(userId, action);
      await loadAdminUsers(state.adminStatus);
    } catch (error) {
      updateState({ adminLoading: false, adminError: error.message || "Ошибка действия" });
    }
  }

  function render() {
    if (!root) return;
    if (state.status === "approved" && !renderApprovedState) return;
    root.innerHTML = renderAuthGate(state);
    bindAuthGateEvents(root, { start, logout, loadAdminUsers, runAdminAction });
  }

  function updateState(patch) {
    state = { ...state, ...patch };
    onStateChange(state);
    render();
  }

  return {
    start,
    loginWithTelegram: loginFromTelegram,
    retryTelegramLogin: loginFromTelegram,
    logout,
    loadAdminUsers,
    runAdminAction,
    getState: () => state,
    render
  };
}

function getAuthPayloadUser(payload = {}) {
  return payload.user || payload.authUser || null;
}

export function renderAuthGate(state = createAuthState()) {
  const view = getAuthView(state);
  return `
    <main class="auth-shell">
      <section class="auth-card ${view.tone}">
        <div class="auth-brand">
          <span class="brand-mark">A5</span>
          <div>
            <span class="eyebrow">Anton 5 sec</span>
            <h1>${escapeHtml(view.title)}</h1>
          </div>
        </div>
        <p>${escapeHtml(view.message)}</p>
        ${state.error ? `<p class="auth-alert danger">${escapeHtml(state.error)}</p>` : ""}
        ${renderAuthActions(state)}
        ${state.user ? renderUserSummary(state.user) : ""}
      </section>
      ${state.status === "approved" && isAdminUser(state.user) ? renderAdminAuthPanel(state) : ""}
    </main>
  `;
}

export function bindAuthGateEvents(root, controller) {
  root.querySelector("[data-auth-login]")?.addEventListener("click", () => {
    (controller.loginWithTelegram || controller.start)();
  });
  root.querySelector("[data-auth-refresh]")?.addEventListener("click", () => controller.start());
  root.querySelector("[data-auth-logout]")?.addEventListener("click", () => controller.logout());
  root.querySelector("[data-auth-admin-refresh]")?.addEventListener("click", () => controller.loadAdminUsers());
  root.querySelectorAll("[data-auth-admin-status]").forEach((button) => {
    button.addEventListener("click", () => controller.loadAdminUsers(button.dataset.authAdminStatus));
  });
  root.querySelectorAll("[data-auth-user-action]").forEach((button) => {
    button.addEventListener("click", () => controller.runAdminAction(button.dataset.authUserId, button.dataset.authUserAction));
  });
}

function renderAuthActions(state) {
  if (state.status === "loading") return "<button class=\"primary-btn\" type=\"button\" disabled>Проверяем доступ...</button>";
  if (state.status === "approved") return "<button class=\"secondary-btn\" data-auth-logout type=\"button\">Выйти</button>";
  if (["error", "login"].includes(state.status)) {
    return "<button class=\"primary-btn\" data-auth-login type=\"button\">Войти через Telegram</button>";
  }
  return "<button class=\"ghost-btn\" data-auth-refresh type=\"button\">Обновить статус</button>";
}

function renderUserSummary(user = {}) {
  const username = user.username || user.telegramUsername || "";
  const label = user.name || user.firstName || username || user.telegramId || "Пользователь";
  return `
    <div class="auth-user-summary">
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(username ? `@${String(username).replace(/^@/, "")}` : getAccessStatus({}, user))}</small>
    </div>
  `;
}

function getAuthView(state) {
  return {
    loading: { tone: "loading", title: "Проверяем доступ", message: "Сверяем Telegram-сессию и статус одобрения." },
    login: { tone: "empty", title: "Вход через Telegram", message: "Войдите через Telegram Login. После первого входа администратор одобрит доступ." },
    approved: { tone: "approved", title: "Доступ открыт", message: "Аккаунт одобрен, можно запускать студию." },
    pending: { tone: "pending", title: "Заявка на проверке", message: "Администратор должен одобрить доступ перед входом." },
    rejected: { tone: "rejected", title: "Заявка отклонена", message: "Доступ не выдан. Напишите администратору, если это ошибка." },
    blocked: { tone: "blocked", title: "Доступ заблокирован", message: "Этот Telegram-аккаунт не может войти в студию." },
    error: { tone: "error", title: "Не удалось войти", message: "Проверьте подключение или попробуйте снова." }
  }[state.status] || { tone: "error", title: "Неизвестный статус", message: "Обновите страницу или повторите вход." };
}

function getAccessStatus(payload = {}, user = {}) {
  const status = payload.status || payload.accessStatus || user?.status || "";
  if (["approved", "pending", "rejected", "blocked"].includes(status)) return status;
  if (payload.authenticated || payload.ok || user?.approvedAt) return "approved";
  return "pending";
}

function isAdminUser(user = {}) {
  return Boolean(user?.isAdmin || user?.role === "admin" || user?.admin);
}
