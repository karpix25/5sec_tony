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

export async function getTelegramLoginConfig(options = {}) {
  const response = await fetch("/api/auth/telegram/config", { method: "GET", signal: options.signal });
  return readAuthResponse(response, "Не удалось загрузить Telegram Login");
}

export async function openTelegramLogin(clientId, options = {}) {
  await ensureTelegramOidcLibrary();
  const login = globalThis.Telegram?.Login;
  if (!login?.auth) throw new Error("Telegram Login Library не загрузилась");
  const redirectUri = options.redirectUri || getTelegramLoginRedirectUri();
  return new Promise((resolve, reject) => {
    login.auth({
      client_id: normalizeTelegramClientId(clientId),
      redirect_uri: redirectUri,
      scope: options.scope || "profile",
      lang: options.lang || "ru"
    }, (result) => {
      if (result?.id_token) {
        resolve(result);
        return;
      }
      reject(new Error(result?.error || "Telegram Login отменен"));
    });
  });
}

export function getTelegramLoginRedirectUri(source = globalThis.location) {
  if (!source?.origin) throw new Error("Telegram redirect_uri отсутствует");
  return `${source.origin}${source.pathname || "/"}`;
}

export async function loginWithTelegramIdToken(idToken, options = {}) {
  if (!idToken) throw new Error("Telegram id_token отсутствует");
  const response = await fetch("/api/auth/telegram/oidc", {
    method: "POST",
    headers: authJsonHeaders,
    body: JSON.stringify({ idToken }),
    signal: options.signal
  });
  return readAuthResponse(response, "Не удалось войти через Telegram");
}

export async function loginWithTelegramWidgetUser(user, options = {}) {
  if (!user?.id) throw new Error("Telegram user отсутствует");
  const response = await fetch("/api/auth/telegram/widget", {
    method: "POST",
    headers: authJsonHeaders,
    body: JSON.stringify({ user }),
    signal: options.signal
  });
  return readAuthResponse(response, "Не удалось войти через Telegram");
}

export async function openTelegramWidgetLogin(botId, options = {}) {
  await ensureTelegramWidgetLibrary();
  const login = globalThis.Telegram?.Login;
  if (!login?.auth) throw new Error("Telegram Widget Library не загрузилась");
  return new Promise((resolve, reject) => {
    login.auth({
      bot_id: normalizeTelegramClientId(botId),
      lang: options.lang || "ru"
    }, (user) => {
      if (user?.id) {
        resolve(user);
        return;
      }
      reject(new Error("Telegram Login отменен"));
    });
  });
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

function normalizeTelegramClientId(clientId) {
  const numeric = Number(clientId);
  return Number.isSafeInteger(numeric) ? numeric : String(clientId);
}

function ensureTelegramWidgetLibrary() {
  if (document.querySelector("script[data-anton-telegram-widget-library-loaded]")) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-anton-telegram-widget-library]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Telegram Widget Library не загрузилась")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.dataset.antonTelegramWidgetLibrary = "true";
    script.onload = () => {
      script.dataset.antonTelegramWidgetLibraryLoaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Telegram Widget Library не загрузилась"));
    document.head.appendChild(script);
  });
}

function ensureTelegramOidcLibrary() {
  if (document.querySelector("script[data-anton-telegram-oidc-library-loaded]")) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-anton-telegram-oidc-library]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Telegram Login Library не загрузилась")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-login.js";
    script.dataset.antonTelegramOidcLibrary = "true";
    script.onload = () => {
      script.dataset.antonTelegramOidcLibraryLoaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Telegram Login Library не загрузилась"));
    document.head.appendChild(script);
  });
}
