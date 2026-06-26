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

test("flat bundle includes generation batch before generation UI", () => {
  const buildSource = readFileSync(new URL("../scripts/build-bundle.mjs", import.meta.url), "utf8");
  const files = [...buildSource.matchAll(/"([^"]+\.js)"/g)].map((match) => match[1]);

  assert.ok(files.includes("src/ui/generation-batch.js"));
  assert.ok(files.includes("src/ui/generation.js"));
  assert.ok(files.indexOf("src/ui/generation-batch.js") < files.indexOf("src/ui/generation.js"));
});
