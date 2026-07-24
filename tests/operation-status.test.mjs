import test from "node:test";
import assert from "node:assert/strict";
import { createOperationController } from "../src/state/operation-controller.js";

test("operation controller runs same-scope operations sequentially", async () => {
  const seen = [];
  const controller = createOperationController((operations) => {
    seen.push(Object.fromEntries(Object.entries(operations).map(([key, value]) => [key, value.status])));
  });
  let releaseFirst;
  const first = controller.runScopedOperation({ scope: "project:1", key: "first" }, async () => {
    seen.push("first-start");
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
    seen.push("first-end");
  });
  const second = controller.runScopedOperation({ scope: "project:1", key: "second" }, async () => {
    seen.push("second-start");
  });

  await wait(0);
  assert.equal(seen.includes("first-start"), true);
  assert.equal(seen.includes("second-start"), false);
  releaseFirst();
  await Promise.all([first, second]);

  assert.deepEqual(seen.filter((item) => typeof item === "string"), ["first-start", "first-end", "second-start"]);
  assert.deepEqual(controller.getOperations(), {});
});

test("operation controller keeps failed operation status visible", async () => {
  const controller = createOperationController();
  await assert.rejects(
    () => controller.runScopedOperation({ scope: "product:1", key: "save-product" }, async () => {
      throw new Error("db down");
    }),
    /db down/
  );

  assert.equal(controller.getOperations()["save-product"].status, "failed");
  assert.equal(controller.getOperations()["save-product"].error, "db down");
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
