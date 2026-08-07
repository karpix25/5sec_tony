import test from "node:test";
import assert from "node:assert/strict";
import { createProjectForState } from "../scripts/project-state-store.mjs";

test("project create avoids shared ui and app-state rows", async () => {
  const queries = [];
  const query = async (text) => {
    queries.push(text);
    if (/coalesce\(min\(sort_order\)/i.test(text)) return { rows: [{ next_order: 0 }] };
    if (/select greatest/i.test(text)) return { rows: [{ updated_at: "t1" }] };
    return { rows: [] };
  };

  const result = await createProjectForState(query, "default", {
    project: { id: "project-fast", name: "Быстрый", references: [], characters: [] },
    product: { id: "product-fast", projectId: "project-fast", name: "Первый продукт" }
  });

  assert.equal(result.updatedAt, "t1");
  assert.equal(queries.some((text) => /insert into studio_projects/i.test(text)), true);
  assert.equal(queries.some((text) => /insert into studio_products/i.test(text)), true);
  assert.equal(queries.some((text) => /insert into studio_app_ui_state|update app_state/i.test(text)), false);
});
