import assert from "node:assert/strict";
import test from "node:test";

import {
  getTelegramLoginRedirectUri,
  openTelegramLogin
} from "../src/services/auth-client.js";

test("Telegram Login uses current page as redirect_uri", async () => {
  const originalTelegram = globalThis.Telegram;
  const originalLocation = globalThis.location;
  const originalDocument = globalThis.document;
  let authOptions = null;

  globalThis.Telegram = {
    Login: {
      auth(options, callback) {
        authOptions = options;
        callback({ id_token: "token" });
      }
    }
  };
  globalThis.location = {
    origin: "https://n8n-5sec.ap2dy7.easypanel.host",
    pathname: "/"
  };
  globalThis.document = {
    querySelector(selector) {
      return selector === "script[data-anton-telegram-oidc-library-loaded]" ? {} : null;
    }
  };

  try {
    const result = await openTelegramLogin("8844193222", { scope: "openid profile" });
    assert.equal(result.id_token, "token");
    assert.deepEqual(authOptions, {
      client_id: 8844193222,
      redirect_uri: "https://n8n-5sec.ap2dy7.easypanel.host/",
      scope: "openid profile",
      lang: "ru"
    });
  } finally {
    globalThis.Telegram = originalTelegram;
    globalThis.location = originalLocation;
    globalThis.document = originalDocument;
  }
});

test("Telegram redirect_uri excludes query and hash", () => {
  assert.equal(
    getTelegramLoginRedirectUri({
      origin: "https://n8n-5sec.ap2dy7.easypanel.host",
      pathname: "/app"
    }),
    "https://n8n-5sec.ap2dy7.easypanel.host/app"
  );
});
