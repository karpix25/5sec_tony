import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createAuthApiHandler } from "../scripts/auth/auth-api.mjs";

test("auth api exposes Telegram Login client config", async () => {
  const response = createResponse();
  const handled = await createAuthApiHandler({
    oidc: { clientId: "123", clientSecret: "secret", scope: "openid profile" }
  })(createRequest("", "GET"), response, new URL("http://localhost/api/auth/telegram/config"));

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { clientId: "123", scope: "openid profile" });
});

test("auth api accepts Telegram Login id_token and sets a session", async () => {
  const response = createResponse();
  const handler = createAuthApiHandler({
    verifyTelegramIdToken: async (idToken) => ({ id: "42", sub: "42", name: "Anton Admin", token: idToken }),
    upsertTelegramUser: async (user) => ({ telegramId: user.id, role: "admin", status: "approved" }),
    sessionSecret: "test-secret"
  });
  const handled = await handler(
    createRequest(JSON.stringify({ idToken: "signed-token" }), "POST"),
    response,
    new URL("http://localhost/api/auth/telegram/oidc")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.match(String(response.headers["Set-Cookie"]), /anton_auth_session=/);
  assert.deepEqual(JSON.parse(response.body), {
    user: { telegramId: "42", role: "admin", status: "approved" }
  });
});

function createRequest(body = "", method = "GET") {
  const request = new EventEmitter();
  request.method = method;
  request.headers = {};
  process.nextTick(() => {
    if (body) request.emit("data", Buffer.from(body));
    request.emit("end");
  });
  return request;
}

function createResponse() {
  return {
    headers: {},
    status: 0,
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(status, headers = {}) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    end(body = "") {
      this.body = body;
    }
  };
}
