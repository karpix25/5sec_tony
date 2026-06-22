import test from "node:test";
import assert from "node:assert/strict";
import {
  isAdminUser,
  isApprovedUser,
  updateUserApproval,
  upsertTelegramUser
} from "../scripts/auth/users-store.mjs";

test("upserts initial admin as approved admin", async () => {
  const queries = [];
  const query = async (sql, params = []) => {
    queries.push({ sql, params });
    if (/returning \*/i.test(sql)) {
      return { rows: [rowFromUpsertParams(params)] };
    }
    return { rows: [] };
  };

  const user = await upsertTelegramUser({
    id: "42",
    firstName: "Anton",
    lastName: null,
    username: "anton",
    photoUrl: null,
    languageCode: "ru",
    raw: { id: 42 }
  }, { query, initialAdminIds: "42,99" });

  assert.equal(user.telegramId, "42");
  assert.equal(user.role, "admin");
  assert.equal(user.status, "approved");
  assert.equal(isApprovedUser(user), true);
  assert.equal(isAdminUser(user), true);
  assert.equal(queries.length, 2);
});

test("upserts non-admin users as pending", async () => {
  const query = async (sql, params = []) => {
    if (/returning \*/i.test(sql)) return { rows: [rowFromUpsertParams(params)] };
    return { rows: [] };
  };

  const user = await upsertTelegramUser({
    id: "77",
    firstName: "Guest",
    raw: { id: 77 }
  }, { query, initialAdminIds: "42" });

  assert.equal(user.role, "user");
  assert.equal(user.status, "pending");
  assert.equal(isApprovedUser(user), false);
  assert.equal(isAdminUser(user), false);
});

test("updates user approval status through fake query dependency", async () => {
  const query = async (sql, params = []) => {
    if (/returning \*/i.test(sql)) {
      return {
        rows: [{
          telegram_id: params[0],
          first_name: "Guest",
          role: "user",
          status: params[1],
          approved_by: params[2]
        }]
      };
    }
    return { rows: [] };
  };

  const user = await updateUserApproval("77", "approve", "42", { query });

  assert.equal(user.telegramId, "77");
  assert.equal(user.status, "approved");
  assert.equal(user.approvedBy, "42");
});

function rowFromUpsertParams(params) {
  return {
    telegram_id: params[0],
    first_name: params[1],
    last_name: params[2],
    username: params[3],
    photo_url: params[4],
    language_code: params[5],
    role: params[6],
    status: params[7],
    raw_user: JSON.parse(params[8]),
    approved_at: params[9],
    approved_by: params[10]
  };
}
