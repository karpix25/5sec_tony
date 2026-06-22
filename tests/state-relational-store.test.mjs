import test from "node:test";
import assert from "node:assert/strict";
import { ensureStateSchema } from "../scripts/state-schema.mjs";
import { loadNormalizedState, saveNormalizedState } from "../scripts/state-relational-store.mjs";

test("state schema creates normalized tables and justified indexes", async () => {
  const queries = [];
  await ensureStateSchema(async (text) => {
    queries.push(text);
    return { rows: [] };
  });

  const ddl = queries.join("\n");
  assert.match(ddl, /create table if not exists studio_projects/i);
  assert.match(ddl, /create table if not exists studio_products/i);
  assert.match(ddl, /create table if not exists studio_jobs/i);
  assert.match(ddl, /create table if not exists studio_hook_versions/i);
  assert.match(ddl, /foreign key \(app_state_key, product_id\) references studio_products/i);
  assert.match(ddl, /create index if not exists idx_studio_jobs_app_state_project_sort/i);
  assert.match(ddl, /create index if not exists idx_studio_products_app_state_sort/i);
  assert.match(ddl, /create index if not exists idx_studio_jobs_app_state_sort/i);
  assert.match(ddl, /create index if not exists idx_studio_hook_items_app_state_sort/i);
  assert.match(ddl, /create unique index if not exists idx_studio_hook_versions_one_active/i);
});

test("save normalized state writes separate project product job and hook tables", async () => {
  const queries = [];
  const state = {
    selectedProjectId: "project-1",
    selectedProductId: "product-1",
    selectedReferenceId: "ref-1",
    selectedCharacterId: "char-1",
    selectedAudioId: "audio-1",
    selectedProjectTab: "project",
    generationBrief: { topic: "Тест" },
    freePrompt: "prompt",
    projects: [{ id: "project-1", name: "Project", references: [], audioLibrary: [], avatarCandidates: [], designReferenceCandidates: [], characters: [] }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product", pains: [], facts: [], forbidden: [], references: [] }],
    jobs: [{ id: "job-1", projectId: "project-1", productId: "product-1", characterId: "char-1", status: "queued", stage: "brief", progress: 10, inputUrls: [], inputRefs: [] }],
    audioLibrary: [{ id: "audio-1", title: "Audio" }],
    hookLibrary: { activeVersionId: "version-1", versions: [{ id: "version-1", title: "Hooks", status: "active", createdAt: "2026-06-22", sourceType: "text", hooks: [{ id: "hook-1", text: "Hook", enabled: true, tags: ["универсальный"], aggression: "низкая" }] }] },
    reelsResearch: { updatedAt: "2026-06-22", accounts: ["demo"], modelAnalysis: "", modelWriting: "", errors: [], videos: [], summary: {} }
  };

  await saveNormalizedState(async (text, params = []) => {
    queries.push({ text, params });
    return { rows: [] };
  }, "workspace-1", state);

  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_app_ui_state")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_projects")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_products")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_jobs")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_global_audio_assets")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_hook_versions")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_hook_items")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_reels_research")));
});

test("load normalized state rebuilds snapshot from separate tables", async () => {
  const state = await loadNormalizedState(async (text) => {
    if (/create table if not exists app_state/i.test(text)) return { rows: [] };
    if (/exists\(select 1 from studio_app_ui_state/i.test(text)) return { rows: [{ present: true }] };
    if (/select \* from studio_app_ui_state/i.test(text)) {
      return { rows: [{ selected_project_id: "project-1", selected_product_id: "product-1", selected_reference_id: "ref-1", selected_character_id: "char-1", selected_audio_id: "audio-1", selected_project_tab: "hooks", generation_brief: { topic: "Тест" }, free_prompt: "prompt", extra: {} }] };
    }
    if (/select \* from studio_projects/i.test(text)) {
      return { rows: [{ id: "project-1", name: "Project", client: "", export_folder: "", yandex_disk_folder: "", daily_limit: 20, used_today: 0, project_limit: 500, used_total: 0, company_info: "", company_audience: "", project_theme: "", niche: "", key_scenarios: "", audience_pains: "", audience_desires: "", audience_objections: "", allowed_triggers: "", forbidden_triggers: "", hook_aggression: "", content_restrictions: "", tone_of_voice: "", restrictions: "", style: "", last_reference_update: "", avatar_round_robin_index: 0, automation: {}, cta_overlay: {}, references: [], audio_library: [], avatar_candidates: [], design_reference_candidates: [], characters: [], extra: {} }] };
    }
    if (/select \* from studio_products/i.test(text)) {
      return { rows: [{ id: "product-1", project_id: "project-1", name: "Product", description: "", offer: "", components: "", pains: [], facts: [], forbidden: [], references: [], extra: {} }] };
    }
    if (/select \* from studio_jobs/i.test(text)) {
      return { rows: [{ id: "job-1", project_id: "project-1", product_id: "product-1", character_id: "char-1", status: "queued", stage: "brief", progress: 10, title: "", topic: "", music: "", prompt: "", reference_title: "", output_type: "", final_video_url: "", final_video_has_audio: false, semantic_key: "", meaning_pattern_id: "", product_visual_mode: "", composition_mode: "", content_layer_id: "", format: "", input_urls: [], input_refs: [], diversity_slot: null, extra: {} }] };
    }
    if (/select \* from studio_global_audio_assets/i.test(text)) {
      return { rows: [{ id: "audio-1", title: "Audio", mood: "", duration: "", file_name: "", file_type: "", file_size: 0, file_data: "", created_at: "", extra: {} }] };
    }
    if (/select \* from studio_hook_library_state/i.test(text)) return { rows: [{ active_version_id: "version-1" }] };
    if (/select \* from studio_hook_versions/i.test(text)) {
      return { rows: [{ id: "version-1", title: "Hooks", status: "active", created_at: "2026-06-22", source_type: "text", extra: {} }] };
    }
    if (/select \* from studio_hook_items/i.test(text)) {
      return { rows: [{ id: "hook-1", version_id: "version-1", text: "Hook", enabled: true, tags: ["универсальный"], aggression: "низкая", extra: {} }] };
    }
    if (/select \* from studio_reels_research/i.test(text)) {
      return { rows: [{ updated_at: "2026-06-22", accounts: ["demo"], model_analysis: "", model_writing: "", errors: [], videos: [], summary: {}, extra: {} }] };
    }
    throw new Error(`Unexpected query: ${text.trim()}`);
  }, "workspace-1");

  assert.equal(state.selectedProjectId, "project-1");
  assert.equal(state.projects[0].id, "project-1");
  assert.equal(state.products[0].projectId, "project-1");
  assert.equal(state.jobs[0].id, "job-1");
  assert.equal(state.audioLibrary[0].id, "audio-1");
  assert.equal(state.hookLibrary.activeVersionId, "version-1");
  assert.equal(state.reelsResearch.accounts[0], "demo");
});
