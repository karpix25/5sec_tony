import { queryPostgres } from "../postgres-client.mjs";

const approvedStatus = "approved";
const pendingStatus = "pending";
const adminRole = "admin";
const userRole = "user";

export async function ensureAuthUsersTable(query = queryPostgres) {
  await query(`
    create table if not exists app_auth_users (
      telegram_id text primary key,
      first_name text,
      last_name text,
      username text,
      photo_url text,
      language_code text,
      role text not null default 'user',
      status text not null default 'pending',
      raw_user jsonb not null default '{}'::jsonb,
      approved_at timestamptz,
      approved_by text,
      rejected_at timestamptz,
      rejected_by text,
      blocked_at timestamptz,
      blocked_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

export async function upsertTelegramUser(telegramUser, options = {}) {
  const query = options.query || queryPostgres;
  await ensureAuthUsersTable(query);

  const initialAdmin = isInitialAdminTelegramId(telegramUser.id, options.initialAdminIds);
  const role = initialAdmin ? adminRole : userRole;
  const status = initialAdmin ? approvedStatus : pendingStatus;
  const result = await query(`
    insert into app_auth_users (
      telegram_id, first_name, last_name, username, photo_url, language_code,
      role, status, raw_user, approved_at, approved_by, updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, now())
    on conflict (telegram_id) do update set
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      username = excluded.username,
      photo_url = excluded.photo_url,
      language_code = excluded.language_code,
      raw_user = excluded.raw_user,
      role = case when excluded.role = 'admin' then 'admin' else app_auth_users.role end,
      status = case when excluded.role = 'admin' then 'approved' else app_auth_users.status end,
      approved_at = case
        when excluded.role = 'admin' and app_auth_users.approved_at is null then now()
        else app_auth_users.approved_at
      end,
      approved_by = case
        when excluded.role = 'admin' and app_auth_users.approved_by is null then excluded.approved_by
        else app_auth_users.approved_by
      end,
      updated_at = now()
    returning *
  `, [
    telegramUser.id,
    telegramUser.firstName,
    telegramUser.lastName,
    telegramUser.username,
    telegramUser.photoUrl,
    telegramUser.languageCode,
    role,
    status,
    JSON.stringify(telegramUser.raw || telegramUser),
    initialAdmin ? new Date() : null,
    initialAdmin ? "initial_admin" : null
  ]);
  return normalizeUserRow(result.rows[0]);
}

export async function getUserByTelegramId(telegramId, options = {}) {
  const query = options.query || queryPostgres;
  await ensureAuthUsersTable(query);
  const result = await query("select * from app_auth_users where telegram_id = $1 limit 1", [String(telegramId)]);
  return result.rows[0] ? normalizeUserRow(result.rows[0]) : null;
}

export async function listAuthUsers(options = {}) {
  const query = options.query || queryPostgres;
  await ensureAuthUsersTable(query);
  const result = await query(`
    select * from app_auth_users
    order by
      case status when 'pending' then 0 when 'approved' then 1 when 'blocked' then 2 else 3 end,
      created_at desc
  `);
  return result.rows.map(normalizeUserRow);
}

export async function updateUserApproval(telegramId, action, actorTelegramId, options = {}) {
  const query = options.query || queryPostgres;
  await ensureAuthUsersTable(query);
  const patch = getApprovalPatch(action);
  const result = await query(`
    update app_auth_users set
      status = $2,
      approved_at = case when $2 = 'approved' then now() else approved_at end,
      approved_by = case when $2 = 'approved' then $3 else approved_by end,
      rejected_at = case when $2 = 'rejected' then now() else rejected_at end,
      rejected_by = case when $2 = 'rejected' then $3 else rejected_by end,
      blocked_at = case when $2 = 'blocked' then now() else blocked_at end,
      blocked_by = case when $2 = 'blocked' then $3 else blocked_by end,
      updated_at = now()
    where telegram_id = $1
    returning *
  `, [String(telegramId), patch.status, String(actorTelegramId || "")]);
  return result.rows[0] ? normalizeUserRow(result.rows[0]) : null;
}

export function isApprovedUser(user) {
  return user?.status === approvedStatus;
}

export function isAdminUser(user) {
  return user?.role === adminRole && user?.status === approvedStatus;
}

export function isInitialAdminTelegramId(telegramId, configuredIds = process.env.INITIAL_ADMIN_TELEGRAM_IDS) {
  return parseInitialAdminTelegramIds(configuredIds).has(String(telegramId));
}

export function parseInitialAdminTelegramIds(configuredIds) {
  if (configuredIds instanceof Set) return new Set([...configuredIds].map(String));
  if (Array.isArray(configuredIds)) return new Set(configuredIds.map(String).filter(Boolean));
  return new Set(String(configuredIds || "").split(",").map((id) => id.trim()).filter(Boolean));
}

export function normalizeUserRow(row) {
  return {
    telegramId: row.telegram_id,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    username: row.username || null,
    photoUrl: row.photo_url || null,
    languageCode: row.language_code || null,
    role: row.role || userRole,
    status: row.status || pendingStatus,
    rawUser: row.raw_user || {},
    approvedAt: row.approved_at || null,
    approvedBy: row.approved_by || null,
    rejectedAt: row.rejected_at || null,
    rejectedBy: row.rejected_by || null,
    blockedAt: row.blocked_at || null,
    blockedBy: row.blocked_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function getApprovalPatch(action) {
  if (action === "approve") return { status: "approved" };
  if (action === "reject") return { status: "rejected" };
  if (action === "block") return { status: "blocked" };
  throw new Error(`Unsupported approval action: ${action}`);
}
