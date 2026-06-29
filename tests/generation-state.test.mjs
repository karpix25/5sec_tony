import test from "node:test";
import assert from "node:assert/strict";

import { updateGenerationState } from "../scripts/generation-state.mjs";

test("generation state updates take the same app-state advisory lock as the state API", async () => {
  const queries = [];
  const result = await updateGenerationState(
    (state) => ({ ...state, selectedProjectId: "project-2" }),
    {
      isPostgresConfigured: () => true,
      withPostgresTransaction: async (callback) => callback({ query: createGenerationStateQuery(queries) })
    }
  );

  assert.equal(result.state.selectedProjectId, "project-2");
  assert.equal(queries[0].text, "select pg_advisory_xact_lock(hashtext($1))");
  assert.deepEqual(queries[0].params, ["default"]);
});

test("generation state update retries a deadlocked transaction", async () => {
  let transactions = 0;
  const result = await updateGenerationState(
    (state) => ({ ...state, selectedProjectId: "retried" }),
    {
      isPostgresConfigured: () => true,
      withPostgresTransaction: async (callback) => {
        transactions += 1;
        if (transactions === 1) {
          const error = new Error("deadlock detected");
          error.code = "40P01";
          throw error;
        }
        return callback({ query: createGenerationStateQuery([]) });
      }
    }
  );

  assert.equal(result.state.selectedProjectId, "retried");
  assert.equal(transactions, 2);
});

function createGenerationStateQuery(queries) {
  return async function query(text, params = []) {
    queries.push({ text, params });
    if (/select pg_advisory_xact_lock/i.test(text)) return { rows: [] };
    if (/select \(/i.test(text)) return { rows: [{ present: true }] };
    if (/select \* from studio_app_ui_state/i.test(text)) return {
      rows: [{
        selected_project_id: "project-1",
        selected_product_id: "",
        selected_reference_id: "",
        selected_character_id: "",
        selected_audio_id: "",
        selected_project_tab: "project",
        generation_brief: {},
        free_prompt: "",
        extra: {}
      }]
    };
    if (/select \* from studio_hook_library_state/i.test(text)) return { rows: [] };
    if (/insert into app_state/i.test(text)) return { rows: [{ updated_at: "2026-06-29T00:00:00.000Z" }] };
    return { rows: [] };
  };
}
