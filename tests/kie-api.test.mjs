import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleKieApi } from "../scripts/kie-api.mjs";

test("images api adds Russian image guard before sending prompt upstream", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.KIE_API_KEY;
  let upstreamBody = null;
  process.env.KIE_API_KEY = "test-token";
  globalThis.fetch = async (_url, options = {}) => {
    upstreamBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 200, data: { taskId: "image-task-russian-guard" } })
    };
  };

  try {
    const response = await callKieApi("/api/images/generate", {
      prompt: "Create vertical infographic with English labels",
      provider: "gpt-image-2"
    });

    assert.equal(response.status, 200);
    assert.equal(upstreamBody.model, "gpt-image-2-text-to-image");
    assert.match(upstreamBody.input.prompt, /ЖЕСТКИЙ ЯЗЫКОВОЙ КОНТРАКТ/);
    assert.match(upstreamBody.input.prompt, /должны быть только на русском языке/);
    assert.match(upstreamBody.input.prompt, /Create vertical infographic with English labels/);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("KIE_API_KEY", previousKey);
  }
});

test("avatars api keeps avatar prompt without final image text guard", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.KIE_API_KEY;
  let upstreamBody = null;
  process.env.KIE_API_KEY = "test-token";
  globalThis.fetch = async (_url, options = {}) => {
    upstreamBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 200, data: { taskId: "avatar-task" } })
    };
  };

  try {
    const response = await callKieApi("/api/avatars/generate", {
      prompt: "стабильный персонаж проекта",
      provider: "gpt-image-2"
    });

    assert.equal(response.status, 200);
    assert.equal(upstreamBody.input.prompt, "стабильный персонаж проекта");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("KIE_API_KEY", previousKey);
  }
});

async function callKieApi(pathname, payload) {
  const request = Readable.from([JSON.stringify(payload)]);
  request.method = "POST";
  request.headers = {};
  const response = createJsonResponse();
  const handled = await handleKieApi(request, response, new URL("http://127.0.0.1:4173" + pathname));
  assert.equal(handled, true);
  return response.result();
}

function createJsonResponse() {
  const chunks = [];
  let status = 0;
  return {
    writeHead(nextStatus) {
      status = nextStatus;
    },
    end(chunk) {
      if (chunk) chunks.push(String(chunk));
    },
    result() {
      return { status, payload: JSON.parse(chunks.join("") || "{}") };
    }
  };
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
