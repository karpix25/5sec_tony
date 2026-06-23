const authJsonHeaders = { "Content-Type": "application/json" };

export function getTelegramInitData(source = globalThis.window) {
  return source?.Telegram?.WebApp?.initData || "";
}

export async function getCurrentAuthUser(options = {}) {
  const response = await fetch("/api/auth/me", { method: "GET", signal: options.signal });
  return readAuthResponse(response, "Не удалось проверить сессию");
}

export async function loginWithTelegramInitData(initData, options = {}) {
  if (!initData) throw new Error("Telegram initData отсутствует");
  const response = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: authJsonHeaders,
    body: JSON.stringify({ initData }),
    signal: options.signal
  });
  return readAuthResponse(response, "Не удалось войти через Telegram");
}

export function startTelegramBrowserLogin(returnTo = getCurrentReturnTo()) {
  globalThis.location.href = getTelegramBrowserLoginUrl(returnTo);
}

export function getTelegramBrowserLoginUrl(returnTo = getCurrentReturnTo()) {
  const query = new URLSearchParams({ returnTo });
  return `/api/auth/telegram/start?${query}`;
}

export async function logoutAuthUser(options = {}) {
  const response = await fetch("/api/auth/logout", { method: "POST", signal: options.signal });
  return readAuthResponse(response, "Не удалось выйти");
}

export async function listAdminAuthUsers(filters = {}, options = {}) {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.search) query.set("search", filters.search);
  const suffix = query.toString() ? `?${query}` : "";
  const response = await fetch(`/api/admin/users${suffix}`, { method: "GET", signal: options.signal });
  return readAuthResponse(response, "Не удалось загрузить пользователей");
}

export function approveAuthUser(userId, options = {}) {
  return runAdminAuthUserAction(userId, "approve", {}, options);
}

export function rejectAuthUser(userId, reason = "", options = {}) {
  return runAdminAuthUserAction(userId, "reject", { reason }, options);
}

export function blockAuthUser(userId, reason = "", options = {}) {
  return runAdminAuthUserAction(userId, "block", { reason }, options);
}

export async function runAdminAuthUserAction(userId, action, payload = {}, options = {}) {
  if (!userId) throw new Error("Не указан пользователь");
  if (!["approve", "reject", "block"].includes(action)) throw new Error("Неизвестное действие");
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/${action}`, {
    method: "POST",
    headers: authJsonHeaders,
    body: JSON.stringify(payload || {}),
    signal: options.signal
  });
  return readAuthResponse(response, "Не удалось обновить пользователя");
}

async function readAuthResponse(response, fallbackMessage) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok) throw new Error(payload.error || payload.message || fallbackMessage);
  return payload;
}

function getCurrentReturnTo() {
  const location = globalThis.location;
  if (!location) return "/";
  return `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
}
