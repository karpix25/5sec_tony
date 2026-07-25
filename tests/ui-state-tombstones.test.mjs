import test from "node:test";
import assert from "node:assert/strict";
import { appendUiTombstones } from "../scripts/ui-state-tombstones.mjs";

test("ui tombstones append product and project ids without duplicates", async () => {
  const queries = [];
  const query = async (text, params = []) => {
    queries.push({ text, params });
    if (/select extra from studio_app_ui_state/i.test(text)) {
      return { rows: [{ extra: { deletedProductIds: ["product-1"] } }] };
    }
    return { rows: [] };
  };

  await appendUiTombstones(query, "default", {
    deletedProductIds: ["product-1", "product-2"],
    deletedProjectIds: ["project-1"]
  });

  const write = queries.find(({ text }) => /insert into studio_app_ui_state/i.test(text));
  assert.ok(write);
  assert.deepEqual(JSON.parse(write.params[1]), {
    deletedProductIds: ["product-1", "product-2"],
    deletedProjectIds: ["project-1"]
  });
});
