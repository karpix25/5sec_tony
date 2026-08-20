import test from "node:test";
import assert from "node:assert/strict";
import { createQueuePagination, queuePageSize } from "../src/ui/queue-pagination.js";

test("queue pagination loads 15 jobs and keeps project counters", async () => {
  const calls = [];
  let changes = 0;
  const pagination = createQueuePagination({
    onChange: () => { changes += 1; },
    loadPage: async (offset, limit, filters) => {
      calls.push({ offset, limit, filters });
      const total = filters.productId ? 18 : 37;
      return { jobs: Array.from({ length: Math.min(limit, total - offset) }, (_, index) => ({ id: `${offset + index}` })), total };
    }
  });
  const context = { project: { id: "project-1" }, product: { id: "product-1" } };

  pagination.ensure(context, "current");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(pagination.getState().jobs.length, queuePageSize);
  assert.equal(pagination.getState().total, 18);
  assert.equal(pagination.getState().allTotal, 37);
  assert.ok(calls.some(({ filters }) => filters.productId === "product-1"));
  assert.ok(calls.some(({ filters }) => !filters.productId));
  assert.ok(changes > 0);
});
