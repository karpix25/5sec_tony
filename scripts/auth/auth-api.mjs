import { verifyTelegramInitData } from "./telegram-init-data.mjs";
import { clearSessionCookie, createSessionCookie, readSessionFromCookie } from "./session.mjs";
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
    if (request.method === "POST" && url.pathname === "/api/auth/telegram") {
      return handleTelegramLogin(request, response, deps);
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
