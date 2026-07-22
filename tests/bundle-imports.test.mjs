import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("flat bundled source files do not use import aliases", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const buildSource = readFileSync(new URL("../scripts/build-bundle.mjs", import.meta.url), "utf8");
  const files = [...buildSource.matchAll(/"([^"]+\.js)"/g)].map((match) => match[1]);
  const offenders = files.filter((file) => {
    const source = readFileSync(join(root, file), "utf8");
    return /^import\s*\{[\s\S]*?\bas\b[\s\S]*?\}\s*from\s*["'][^"']+["'];/m.test(source);
  });

  assert.deepEqual(offenders, []);
});

test("flat bundle includes job actions before store", () => {
  const buildSource = readFileSync(new URL("../scripts/build-bundle.mjs", import.meta.url), "utf8");
  const files = [...buildSource.matchAll(/"([^"]+\.js)"/g)].map((match) => match[1]);

  assert.ok(files.includes("src/state/job-actions.js"));
  assert.ok(files.indexOf("src/state/job-actions.js") < files.indexOf("src/state/store.js"));
});

test("flat bundle includes backend generation batch client before generation UI", () => {
  const buildSource = readFileSync(new URL("../scripts/build-bundle.mjs", import.meta.url), "utf8");
  const files = [...buildSource.matchAll(/"([^"]+\.js)"/g)].map((match) => match[1]);

  assert.ok(files.includes("src/services/generation-batches.js"));
  assert.ok(files.includes("src/ui/generation.js"));
  assert.ok(files.indexOf("src/services/generation-batches.js") < files.indexOf("src/ui/generation.js"));
});

test("flat bundle includes sync fetch helper before sync clients", () => {
  const buildSource = readFileSync(new URL("../scripts/build-bundle.mjs", import.meta.url), "utf8");
  const files = [...buildSource.matchAll(/"([^"]+\.js)"/g)].map((match) => match[1]);

  assert.ok(files.includes("src/services/sync-fetch.js"));
  assert.ok(files.indexOf("src/services/sync-fetch.js") < files.indexOf("src/services/products-sync.js"));
  assert.ok(files.indexOf("src/services/sync-fetch.js") < files.indexOf("src/services/state-sync.js"));
});

test("flat bundle includes design reference actions before store", () => {
  const buildSource = readFileSync(new URL("../scripts/build-bundle.mjs", import.meta.url), "utf8");
  const files = [...buildSource.matchAll(/"([^"]+\.js)"/g)].map((match) => match[1]);

  assert.ok(files.includes("src/services/design-references-sync.js"));
  assert.ok(files.includes("src/state/design-reference-actions.js"));
  assert.ok(files.indexOf("src/services/design-references-sync.js") < files.indexOf("src/state/design-reference-actions.js"));
  assert.ok(files.indexOf("src/state/design-reference-actions.js") < files.indexOf("src/state/store.js"));
});
