import { verifyTelegramInitData } from "./telegram-init-data.mjs";
import { verifyTelegramLoginWidgetUser } from "./telegram-login-widget.mjs";
import { clearSessionCookie, createSessionCookie, readSessionFromCookie } from "./session.mjs";
import {
  createCodeChallenge,
  createCodeVerifier,
  createOidcState,
  createOidcStateCookie,
  clearOidcStateCookie,
  normalizeReturnTo,
  readOidcStateCookie
} from "./oidc-state.mjs";
import {
  buildAuthorizationUrl,
  exchangeTelegramCode,
  extractTelegramOidcUser,
  getRedirectUri,
  getTelegramOidcConfig,
  verifyTelegramIdToken
} from "./telegram-oidc.mjs";
import {
  getUserByTelegramId,
  isAdminUser,
  isApprovedUser,
  listAuthUsers,
  updateUserApproval,
  upsertTelegramUser
} from "./users-store.mjs";

export const handleAuthApi = createAuthApiHandler();

export function createAuthApiHandler(deps = {}) {
  return async function handleAuthApiRequest(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/auth/telegram/config") {
      return handleTelegramConfig(response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/auth/telegram/start") {
      return handleTelegramOidcStart(request, response, url, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/auth/telegram/callback") {
      return handleTelegramOidcCallback(request, response, url, deps);
    }
    if (request.method === "POST" && url.pathname === "/api/auth/telegram") {
      return handleTelegramLogin(request, response, deps);
    }
    if (request.method === "POST" && url.pathname === "/api/auth/telegram/widget") {
      return handleTelegramWidgetLogin(request, response, deps);
    }
    if (request.method === "POST" && url.pathname === "/api/auth/telegram/oidc") {
      return handleTelegramIdTokenLogin(request, response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      return handleMe(request, response, deps);
    }
    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      return handleLogout(response, deps);
    }
    if (request.method === "GET" && url.pathname === "/api/admin/users") {
      return handleListUsers(request, response, deps);
    }
    const adminAction = matchAdminUserAction(request.method, url.pathname);
    if (adminAction) return handleAdminAction(request, response, adminAction, deps);
    return false;
  };
}

export async function requireApprovedUser(request, response, deps = {}) {
  const user = await getCurrentAuthUser(request, deps);
  if (!user) {
    sendJson(response, 401, { error: "auth_required" });
    return null;
  }
  if (!isApprovedUser(user)) {
    sendJson(response, 403, { error: "approval_required", user });
    return null;
  }
  return user;
}

export async function requireAdmin(request, response, deps = {}) {
  const user = await requireApprovedUser(request, response, deps);
  if (!user) return null;
  if (!isAdminUser(user)) {
    sendJson(response, 403, { error: "admin_required" });
    return null;
  }
  return user;
}

export async function getCurrentAuthUser(request, deps = {}) {
  const session = readSessionFromCookie(request.headers?.cookie, deps.session || deps);
  if (!session?.telegramId) return null;
  return deps.getUserByTelegramId
    ? deps.getUserByTelegramId(session.telegramId, deps)
    : getUserByTelegramId(session.telegramId, deps);
}

async function handleTelegramLogin(request, response, deps) {
  try {
    const body = await readJsonBody(request);
    const verified = (deps.verifyTelegramInitData || verifyTelegramInitData)(body.initData, deps.telegram || deps);
    const user = await (deps.upsertTelegramUser || upsertTelegramUser)(verified.user, deps);
    response.setHeader?.("Set-Cookie", createSessionCookie({
      telegramId: user.telegramId,
      role: user.role
    }, deps.session || deps));
    return sendJson(response, 200, { user });
  } catch (error) {
    return sendJson(response, 401, { error: error.message || "telegram_auth_failed" });
  }
}

function handleTelegramConfig(response, deps) {
  try {
    return sendJson(response, 200, getPublicTelegramConfig(deps));
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "telegram_config_failed" });
  }
}

async function handleTelegramWidgetLogin(request, response, deps) {
  try {
    const body = await readJsonBody(request);
    const verified = (deps.verifyTelegramLoginWidgetUser || verifyTelegramLoginWidgetUser)(
      body.user || body,
      deps.telegram || deps
    );
    const user = await (deps.upsertTelegramUser || upsertTelegramUser)(verified.user, deps);
    response.setHeader?.("Set-Cookie", createSessionCookie({
      telegramId: user.telegramId,
      role: user.role
    }, deps.session || deps));
    return sendJson(response, 200, { user });
  } catch (error) {
    return sendJson(response, 401, { error: error.message || "telegram_widget_auth_failed" });
  }
}

async function handleTelegramIdTokenLogin(request, response, deps) {
  try {
    const body = await readJsonBody(request);
    if (!body.idToken) throw new Error("Telegram id_token is required");
    const claims = await (deps.verifyTelegramIdToken || verifyTelegramIdToken)(body.idToken, deps.oidc || deps);
    const user = await (deps.upsertTelegramUser || upsertTelegramUser)(extractTelegramOidcUser(claims), deps);
    response.setHeader?.("Set-Cookie", createSessionCookie({
      telegramId: user.telegramId,
      role: user.role
    }, deps.session || deps));
    return sendJson(response, 200, { user });
  } catch (error) {
    return sendJson(response, 401, { error: error.message || "telegram_oidc_failed" });
  }
}

function handleTelegramOidcStart(request, response, url, deps) {
  try {
    const config = (deps.getTelegramOidcConfig || getTelegramOidcConfig)(deps.oidc || deps);
    const redirectUri = (deps.getRedirectUri || getRedirectUri)(request, deps.oidc || deps);
    const state = createOidcState();
    const codeVerifier = createCodeVerifier();
    const returnTo = normalizeReturnTo(url.searchParams.get("returnTo"));
    const authUrl = buildAuthorizationUrl({
      clientId: config.clientId,
      redirectUri,
      scope: config.scope,
      state,
      codeChallenge: createCodeChallenge(codeVerifier)
    });
    response.setHeader?.("Set-Cookie", createOidcStateCookie({ state, codeVerifier, redirectUri, returnTo }, deps.session || deps));
    return redirect(response, authUrl);
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "telegram_oidc_start_failed" });
  }
}

async function handleTelegramOidcCallback(request, response, url, deps) {
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) throw new Error("Telegram OIDC callback is missing code or state");
    const stored = readOidcStateCookie(request.headers?.cookie, deps.session || deps);
    if (!stored?.state || stored.state !== state) throw new Error("Telegram OIDC state is invalid");
    const tokens = await (deps.exchangeTelegramCode || exchangeTelegramCode)({
      code,
      redirectUri: stored.redirectUri,
      codeVerifier: stored.codeVerifier
    }, deps.oidc || deps);
    const claims = await (deps.verifyTelegramIdToken || verifyTelegramIdToken)(tokens.id_token, deps.oidc || deps);
    const user = await (deps.upsertTelegramUser || upsertTelegramUser)(extractTelegramOidcUser(claims), deps);
    response.setHeader?.("Set-Cookie", [
      clearOidcStateCookie(deps.session || deps),
      createSessionCookie({ telegramId: user.telegramId, role: user.role }, deps.session || deps)
    ]);
    return redirect(response, normalizeReturnTo(stored.returnTo));
  } catch (error) {
    response.setHeader?.("Set-Cookie", clearOidcStateCookie(deps.session || deps));
    return redirect(response, `/?auth_error=${encodeURIComponent(error.message || "telegram_oidc_failed")}`);
  }
}

async function handleMe(request, response, deps) {
  const user = await getCurrentAuthUser(request, deps);
  return sendJson(response, 200, { user, authenticated: Boolean(user), approved: isApprovedUser(user), admin: isAdminUser(user) });
}

function handleLogout(response, deps) {
  response.setHeader?.("Set-Cookie", clearSessionCookie(deps.session || deps));
  return sendJson(response, 200, { loggedOut: true });
}

async function handleListUsers(request, response, deps) {
  const admin = await requireAdmin(request, response, deps);
  if (!admin) return true;
  const users = await (deps.listAuthUsers || listAuthUsers)(deps);
  const status = request.url ? new URL(request.url, "http://localhost").searchParams.get("status") : "";
  const filteredUsers = status ? users.filter((user) => user.status === status) : users;
  return sendJson(response, 200, { users: filteredUsers });
}

async function handleAdminAction(request, response, action, deps) {
  const admin = await requireAdmin(request, response, deps);
  if (!admin) return true;
  const user = await (deps.updateUserApproval || updateUserApproval)(action.telegramId, action.action, admin.telegramId, deps);
  if (!user) return sendJson(response, 404, { error: "user_not_found" });
  return sendJson(response, 200, { user });
}

function matchAdminUserAction(method, pathname) {
  if (method !== "POST") return null;
  const match = pathname.match(/^\/api\/admin\/users\/([^/]+)\/(approve|reject|block)$/);
  if (!match) return null;
  return { telegramId: decodeURIComponent(match[1]), action: match[2] };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        request.destroy?.();
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
  return true;
}

function redirect(response, location) {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store"
  });
  response.end();
  return true;
}

function getPublicTelegramConfig(deps = {}) {
  const botUsername = getTelegramBotUsername(deps.telegram || deps);
  const botId = getTelegramBotId(deps.telegram || deps);
  const payload = {
    mode: botUsername ? "widget" : "oidc",
    botUsername,
    botId
  };
  try {
    const config = (deps.getTelegramOidcConfig || getTelegramOidcConfig)(deps.oidc || deps);
    payload.clientId = config.clientId;
    payload.scope = config.scope;
  } catch {
    if (!botUsername) throw new Error("TELEGRAM_BOT_USERNAME or TELEGRAM_CLIENT_ID is required");
  }
  return payload;
}

function getTelegramBotUsername(options = {}) {
  const value = options.botUsername || process.env.TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_LOGIN_BOT_USERNAME || "";
  return String(value).replace(/^@/, "").trim();
}

function getTelegramBotId(options = {}) {
  const value = options.botId || process.env.TELEGRAM_BOT_ID || process.env.TELEGRAM_CLIENT_ID || "";
  if (value) return String(value).trim();
  const token = options.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
  return String(token).split(":")[0] || "";
}
