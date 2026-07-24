import test from "node:test";
import assert from "node:assert/strict";
import { ensureStateSchema } from "../scripts/state-schema.mjs";
import { loadNormalizedState, saveNormalizedState } from "../scripts/state-relational-store.mjs";
import { createFakeRelationalStateDb } from "./helpers/fake-relational-state-db.mjs";

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
  assert.match(ddl, /"references" jsonb not null default '\[\]'::jsonb/i);
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
    queueProductFilter: "all",
    generationBrief: { topic: "Тест" },
    freePrompt: "prompt",
    projects: [{ id: "project-1", name: "Project", references: [], audioLibrary: [], avatarCandidates: [], designReferenceCandidates: [], characters: [] }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product", pains: [], facts: [], forbidden: [], references: [] }],
    jobs: [{ id: "job-1", createdAt: "2026-07-22T14:32:00.000Z", projectId: "project-1", productId: "product-1", characterId: "char-1", status: "queued", stage: "brief", progress: 10, inputUrls: [], inputRefs: [], queueName: "generation", queueStatus: "running", queueLockOwner: "worker-1", queueIdempotencyKey: "generation:job-1", queueMetadata: { source: "test" } }],
    audioLibrary: [{ id: "audio-1", title: "Audio" }],
    hookLibrary: { activeVersionId: "version-1", versions: [{ id: "version-1", title: "Hooks", status: "active", createdAt: "2026-06-22", sourceType: "text", hooks: [{ id: "hook-1", text: "Hook", enabled: true, tags: ["универсальный"], aggression: "низкая" }] }] },
    reelsResearch: { updatedAt: "2026-06-22", accounts: ["demo"], modelAnalysis: "", modelWriting: "", errors: [], videos: [], summary: {} }
  };

  await saveNormalizedState(async (text, params = []) => {
    queries.push({ text, params });
    return { rows: [] };
  }, "workspace-1", state);

  const uiInsert = queries.find((entry) => entry.text.includes("insert into studio_app_ui_state"));
  assert.ok(uiInsert);
  assert.equal(JSON.parse(uiInsert.params[9]).queueProductFilter, "all");
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_projects")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_products")));
  assert.ok(queries.some((entry) => /insert into studio_projects[\s\S]*"references"/i.test(entry.text)));
  assert.ok(queries.some((entry) => /insert into studio_products[\s\S]*"references"/i.test(entry.text)));
  const jobInsert = queries.find((entry) => entry.text.includes("insert into studio_jobs"));
  assert.ok(jobInsert);
  assert.equal(JSON.parse(jobInsert.params.at(-1)).createdAt, "2026-07-22T14:32:00.000Z");
  assert.ok(queries.some((entry) => /insert into studio_jobs[\s\S]*queue_status/i.test(entry.text)));
  assert.ok(queries.some((entry) => entry.params.includes("running") && entry.params.includes("generation:job-1")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_global_audio_assets")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_hook_versions")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_hook_items")));
  assert.ok(queries.some((entry) => entry.text.includes("insert into studio_reels_research")));
});

test("load normalized state rebuilds snapshot from separate tables", async () => {
  const state = await loadNormalizedState(async (text) => {
    if (/create table if not exists app_state/i.test(text)) return { rows: [] };
    if (/alter table studio_jobs add column if not exists queue_name/i.test(text)) return { rows: [] };
    if (/exists\(select 1 from studio_app_ui_state/i.test(text)) return { rows: [{ present: true }] };
    if (/select \* from studio_app_ui_state/i.test(text)) {
      return { rows: [{ selected_project_id: "project-1", selected_product_id: "product-1", selected_reference_id: "ref-1", selected_character_id: "char-1", selected_audio_id: "audio-1", selected_project_tab: "hooks", generation_brief: { topic: "Тест" }, free_prompt: "prompt", extra: { queueProductFilter: "all" } }] };
    }
    if (/select \* from studio_projects/i.test(text)) {
      return { rows: [{ id: "project-1", name: "Project", client: "", export_folder: "", yandex_disk_folder: "", daily_limit: 20, used_today: 0, project_limit: 500, used_total: 0, company_info: "", company_audience: "", project_theme: "", niche: "", key_scenarios: "", audience_pains: "", audience_desires: "", audience_objections: "", allowed_triggers: "", forbidden_triggers: "", hook_aggression: "", content_restrictions: "", tone_of_voice: "", restrictions: "", style: "", last_reference_update: "", avatar_round_robin_index: 0, automation: {}, cta_overlay: {}, references: [], audio_library: [], avatar_candidates: [], design_reference_candidates: [], characters: [], extra: {} }] };
    }
    if (/select \* from studio_products/i.test(text)) {
      return { rows: [{ id: "product-1", project_id: "project-1", name: "Product", description: "", offer: "", components: "", pains: [], facts: [], forbidden: [], references: [], extra: {} }] };
    }
    if (/select \* from studio_jobs/i.test(text)) {
      return { rows: [{ id: "job-1", project_id: "project-1", product_id: "product-1", character_id: "char-1", status: "queued", stage: "brief", progress: 10, title: "", topic: "", music: "", prompt: "", reference_title: "", output_type: "", final_video_url: "", final_video_has_audio: false, semantic_key: "", meaning_pattern_id: "", product_visual_mode: "", composition_mode: "", content_layer_id: "", format: "", input_urls: [], input_refs: [], diversity_slot: null, queue_name: "generation", queue_status: "running", queue_priority: 2, queue_attempts: 1, queue_max_attempts: 3, queue_scheduled_at: "2026-06-29T07:30:00.000Z", queue_locked_at: null, queue_lock_owner: "worker-1", queue_last_error: "", queue_idempotency_key: "generation:job-1", queue_provider_task_id: "", queue_metadata: { source: "test" }, extra: { createdAt: "2026-07-22T14:32:00.000Z" } }] };
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
  assert.equal(state.queueProductFilter, "all");
  assert.equal(state.projects[0].id, "project-1");
  assert.equal(state.products[0].projectId, "project-1");
  assert.equal(state.jobs[0].id, "job-1");
  assert.equal(state.jobs[0].queueStatus, "running");
  assert.equal(state.jobs[0].createdAt, "2026-07-22T14:32:00.000Z");
  assert.equal(state.jobs[0].queueIdempotencyKey, "generation:job-1");
  assert.deepEqual(state.jobs[0].queueMetadata, { source: "test" });
  assert.equal(state.audioLibrary[0].id, "audio-1");
  assert.equal(state.hookLibrary.activeVersionId, "version-1");
  assert.equal(state.reelsResearch.accounts[0], "demo");
});

test("save and load normalized state preserves queue product filter", async () => {
  const db = createFakeRelationalStateDb();
  const state = {
    queueProductFilter: "all",
    selectedProjectId: "project-1",
    selectedProductId: "product-1",
    projects: [{ id: "project-1", name: "Project" }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product" }],
    jobs: []
  };

  await saveNormalizedState(db.query, "workspace-queue-filter", state);
  const loadedState = await loadNormalizedState(db.query, "workspace-queue-filter");

  assert.equal(loadedState.queueProductFilter, "all");
  assert.deepEqual(loadedState.products.map((product) => product.id), ["product-1"]);
});

test("save normalized state preserves server job lifecycle fields from stale client snapshots", async () => {
  const db = createFakeRelationalStateDb();
  const baseState = {
    selectedProjectId: "project-1",
    selectedProductId: "product-1",
    projects: [{ id: "project-1", name: "Project" }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product" }],
    jobs: [{
      id: "job-protected",
      projectId: "project-1",
      productId: "product-1",
      status: "queued",
      stage: "image",
      progress: 18,
      queueName: "generation",
      queueStatus: "queued",
      queueIdempotencyKey: "generation:job-protected",
      serverJobAcceptedAt: "2026-07-21T06:11:45.000Z",
      imageTaskId: "image-task-protected",
      imageProvider: "gpt-image-2",
      serverJobContext: { project: { id: "project-1" } }
    }]
  };
  await saveNormalizedState(db.query, "workspace-protected-jobs", baseState);

  await saveNormalizedState(db.query, "workspace-protected-jobs", {
    ...baseState,
    jobs: [{
      id: "job-protected",
      projectId: "project-1",
      productId: "product-1",
      status: "running",
      stage: "brief",
      progress: 6,
      title: "Client title"
    }]
  });

  const loadedState = await loadNormalizedState(db.query, "workspace-protected-jobs");
  assert.equal(loadedState.jobs[0].title, "Client title");
  assert.equal(loadedState.jobs[0].status, "queued");
  assert.equal(loadedState.jobs[0].stage, "image");
  assert.equal(loadedState.jobs[0].progress, 18);
  assert.equal(loadedState.jobs[0].queueStatus, "queued");
  assert.equal(loadedState.jobs[0].queueIdempotencyKey, "generation:job-protected");
  assert.equal(loadedState.jobs[0].serverJobAcceptedAt, "2026-07-21T06:11:45.000Z");
  assert.equal(loadedState.jobs[0].imageTaskId, "image-task-protected");
  assert.equal(loadedState.jobs[0].imageProvider, "gpt-image-2");
  assert.deepEqual(loadedState.jobs[0].serverJobContext, { project: { id: "project-1" } });
});

test("save normalized state preserves project limit from stale client snapshots", async () => {
  const db = createFakeRelationalStateDb();
  const baseState = {
    selectedProjectId: "project-1",
    selectedProductId: "product-1",
    projects: [{ id: "project-1", name: "Project", dailyLimit: 100, usedToday: 14, projectLimit: 538, usedTotal: 442 }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product" }],
    jobs: []
  };
  await saveNormalizedState(db.query, "workspace-protected-project-limit", baseState);

  await saveNormalizedState(db.query, "workspace-protected-project-limit", {
    ...baseState,
    projects: [{ ...baseState.projects[0], projectLimit: 1 }]
  });

  const loadedState = await loadNormalizedState(db.query, "workspace-protected-project-limit");
  assert.equal(loadedState.projects[0].usedTotal, 442);
  assert.equal(loadedState.projects[0].projectLimit, 538);
});

test("save normalized state keeps ordinary queued draft edits editable", async () => {
  const db = createFakeRelationalStateDb();
  const baseState = {
    selectedProjectId: "project-1",
    selectedProductId: "product-1",
    projects: [{ id: "project-1", name: "Project" }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product" }],
    jobs: [{ id: "job-draft", projectId: "project-1", productId: "product-1", status: "queued", stage: "idea", progress: 0 }]
  };
  await saveNormalizedState(db.query, "workspace-draft-jobs", baseState);

  await saveNormalizedState(db.query, "workspace-draft-jobs", {
    ...baseState,
    jobs: [{ id: "job-draft", projectId: "project-1", productId: "product-1", status: "queued", stage: "brief", progress: 8, title: "Updated" }]
  });

  const loadedState = await loadNormalizedState(db.query, "workspace-draft-jobs");
  assert.equal(loadedState.jobs[0].title, "Updated");
  assert.equal(loadedState.jobs[0].stage, "brief");
  assert.equal(loadedState.jobs[0].progress, 8);
});

test("load normalized state queries one postgres client sequentially", async () => {
  let active = false;
  const state = await loadNormalizedState(async (text) => {
    assert.equal(active, false, `concurrent query: ${text.trim().slice(0, 80)}`);
    active = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    active = false;
    if (/exists\(select 1 from studio_app_ui_state/i.test(text)) return { rows: [{ present: true }] };
    if (/select \* from studio_app_ui_state/i.test(text)) {
      return { rows: [{ selected_project_id: "project-1", selected_product_id: "", selected_reference_id: "", selected_character_id: "", selected_audio_id: "", selected_project_tab: "project", generation_brief: {}, free_prompt: "", extra: {} }] };
    }
    if (/select \* from studio_projects/i.test(text)) return { rows: [] };
    if (/select \* from studio_products/i.test(text)) return { rows: [] };
    if (/select \* from studio_jobs/i.test(text)) return { rows: [] };
    if (/select \* from studio_global_audio_assets/i.test(text)) return { rows: [] };
    if (/select \* from studio_hook_library_state/i.test(text)) return { rows: [] };
    if (/select \* from studio_hook_versions/i.test(text)) return { rows: [] };
    if (/select \* from studio_hook_items/i.test(text)) return { rows: [] };
    if (/select \* from studio_reels_research/i.test(text)) return { rows: [] };
    return { rows: [] };
  }, "workspace-1");

  assert.equal(state.selectedProjectId, "project-1");
});
