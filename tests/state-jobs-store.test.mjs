import test from "node:test";
import assert from "node:assert/strict";
import { loadJobsPage } from "../scripts/state-jobs-store.mjs";

test("jobs page applies project and product filters to count and rows", async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith("select count")) return { rows: [{ count: 1 }] };
    return { rows: [{ id: "job-1", project_id: "project-1", product_id: "product-1", extra: {} }] };
  };

  const page = await loadJobsPage(query, "default", {
    projectId: "project-1",
    productId: "product-1",
    offset: 15,
    limit: 15
  });

  assert.equal(page.total, 1);
  assert.equal(page.jobs[0].id, "job-1");
  assert.deepEqual(calls[0].params, ["default", "project-1", "product-1"]);
  assert.deepEqual(calls[1].params.slice(0, 3), ["default", "project-1", "product-1"]);
  assert.match(calls[1].sql, /order by updated_at desc nulls last, sort_order asc/);
});
