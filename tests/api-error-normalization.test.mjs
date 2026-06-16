import test from "node:test";
import assert from "node:assert/strict";
import { generateAiBrief } from "../src/services/brief-ai.js";
import { extractHooksFromImage } from "../src/services/hook-ai.js";
import { humanizeGenerationPlan } from "../src/services/text-humanizer.js";

test("brief service surfaces plain-text API errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, text: async () => "brief backend unavailable" });
  try {
    await assert.rejects(
      generateAiBrief({ project: {}, product: {}, reference: {}, existingJobs: [] }),
      /brief backend unavailable/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("hook service surfaces plain-text API errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, text: async () => "hooks backend unavailable" });
  try {
    await assert.rejects(
      extractHooksFromImage({ imageData: "data:image/png;base64,abc", title: "Hooks" }),
      /hooks backend unavailable/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("humanizer service surfaces invalid-json API errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, text: async () => "<html>502 upstream broken</html>" });
  try {
    await assert.rejects(
      humanizeGenerationPlan({ project: {}, product: {}, brief: {}, plan: {} }),
      /502 upstream broken/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
