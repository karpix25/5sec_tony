import test from "node:test";
import assert from "node:assert/strict";
import { createStateApiHandler } from "../scripts/state-api.mjs";

test("state api compact transport strips embedded blobs by default", async () => {
  const state = createHeavyState();
  const response = createJsonResponse();
  const handle = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => state,
    loadLegacyState: async () => null,
    queryPostgres: async () => ({ rows: [{ updated_at: "2026-06-30T20:00:00.000Z" }] }),
    withPostgresTransaction: async () => {
      throw new Error("GET should not open a transaction");
    }
  });

  await handle({ method: "GET" }, response, new URL("http://localhost/api/state"));

  assert.equal(response.status, 200);
  assert.equal(response.payload.transport.mode, "compact");
  assert.equal(response.payload.state.projects[0].references[0].imageData, "");
  assert.equal(response.payload.state.projects[0].references[1].imageData, "https://cdn.example.com/ref.png");
  assert.equal(response.payload.state.projects[0].audioLibrary[0].fileData, "");
  assert.equal(response.payload.state.products[0].references[0].imageData, "");
  assert.equal(response.payload.state.audioLibrary[0].fileData, "");
  assert.equal(response.payload.state.jobs[0].imageData, "");
  assert.deepEqual(response.payload.state.jobs[0].inputUrls, ["https://cdn.example.com/input.png"]);
  assert.equal("prompt" in response.payload.state.jobs[0], false);
  assert.equal("serverJobContext" in response.payload.state.jobs[0], false);
  assert.equal(response.payload.state.jobs[0].aiTrace.imagePromptContract.productVisibilityDecision.reason, "keep product");
  const terminalJobs = response.payload.state.jobs.filter((job) => ["done", "failed", "review"].includes(job.status));
  assert.equal(terminalJobs.length, 3);
  terminalJobs.forEach((job) => {
    assertTerminalQueueFields(job);
    assertHeavyTerminalFieldsRemoved(job);
  });
  assert.equal(response.payload.transport.savedBytes, null);
});

test("state api can return full transport explicitly for diagnostics", async () => {
  const state = createHeavyState();
  const response = createJsonResponse();
  const handle = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => state,
    loadLegacyState: async () => null,
    queryPostgres: async () => ({ rows: [{ updated_at: "2026-06-30T20:00:00.000Z" }] }),
    withPostgresTransaction: async () => {
      throw new Error("GET should not open a transaction");
    }
  });

  await handle({ method: "GET" }, response, new URL("http://localhost/api/state?transport=full"));

  assert.equal(response.status, 200);
  assert.equal(response.payload.transport.mode, "full");
  assert.match(response.payload.state.projects[0].references[0].imageData, /^data:image\//);
  assert.match(response.payload.state.audioLibrary[0].fileData, /^data:audio\//);
  const terminalJob = response.payload.state.jobs.find((job) => job.id === "job-terminal-done");
  assert.equal(terminalJob.aiPlan.steps[0], "heavy plan");
  assert.equal(terminalJob.finalContent.headline, "Heavy headline");
  assert.equal(terminalJob.productFact.claim, "heavy fact");
  assert.equal(terminalJob.curiosityAngle.angle, "heavy angle");
  assert.equal(terminalJob.productVisibilityDecision.reason, "heavy decision");
  assert.equal(terminalJob.hookSeed, "heavy hook seed");
  assert.equal(terminalJob.selectionSnapshot.large, "xxxxxxxx");
  assert.equal(terminalJob.prompt.length, 8000);
  assert.equal(terminalJob.serverJobContext.project.characters[0].imageData, "data:image/png;base64,III");
});

test("state api compact transport protects conflict payloads from heavy state echoes", async () => {
  const state = createHeavyState();
  const response = createJsonResponse();
  const handle = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async () => {
      throw new Error("stale save should not write");
    },
    saveLegacyState: async () => {
      throw new Error("stale save should not write");
    },
    loadNormalizedState: async () => state,
    loadLegacyState: async () => null,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/select updated_at from app_state/i.test(text)) return { rows: [{ updated_at: "db-v2" }] };
        return { rows: [] };
      }
    })
  });

  await handle(
    createJsonRequest("POST", { state: { projects: [], products: [], jobs: [] }, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload.transport.mode, "compact");
  assert.equal(response.payload.state.projects[0].references[0].imageData, "");
  assert.equal(response.payload.state.products[0].references[0].imageData, "");
});

function createHeavyState() {
  return {
    projects: [{
      id: "project-1",
      references: [
        { id: "ref-local", imageData: "data:image/png;base64,AAA" },
        { id: "ref-remote", imageData: "https://cdn.example.com/ref.png" }
      ],
      audioLibrary: [{ id: "audio-project", fileData: "data:audio/mp3;base64,BBB" }],
      avatarCandidates: [],
      designReferenceCandidates: [],
      characters: []
    }],
    products: [{
      id: "product-1",
      projectId: "project-1",
      references: [{ id: "product-ref", imageData: "data:image/png;base64,CCC" }]
    }],
    audioLibrary: [{ id: "audio-global", fileData: "data:audio/mp3;base64,DDD" }],
    jobs: [{
      id: "job-1",
      projectId: "project-1",
      status: "running",
      stage: "image",
      progress: 50,
      title: "Active heavy job",
      imageUrl: "https://cdn.example.com/job.png",
      imageData: "https://cdn.example.com/job.png",
      inputUrls: ["data:image/png;base64,EEE", "https://cdn.example.com/input.png"],
      prompt: "x".repeat(8000),
      aiTrace: {
        version: "trace-v1",
        hookSeed: "active hook",
        imagePromptContract: {
          productVisibilityDecision: { reason: "keep product", huge: "x".repeat(8000) },
          huge: "x".repeat(8000)
        }
      },
      serverJobContext: {
        project: {
          id: "project-1",
          references: [],
          audioLibrary: [],
          avatarCandidates: [],
          designReferenceCandidates: [],
          characters: [{ id: "char-1", imageData: "data:image/png;base64,FFF" }]
        },
        product: {
          id: "product-1",
          references: [{ id: "context-product-ref", imageData: "data:image/png;base64,GGG" }]
        },
        products: [{
          id: "product-1",
          references: [{ id: "context-product-list-ref", imageData: "data:image/png;base64,HHH" }]
        }]
      }
    },
    createTerminalJob("done"),
    createTerminalJob("failed"),
    createTerminalJob("review")]
  };
}

function createTerminalJob(status) {
  return {
    id: `job-terminal-${status}`,
    projectId: "project-1",
    productId: "product-1",
    productName: "Product name",
    characterId: "character-1",
    status,
    stage: status === "done" ? "export" : "approval",
    progress: status === "failed" ? 42 : 100,
    title: `Terminal ${status}`,
    topic: "Queue topic",
    music: "Queue music",
    imageUrl: "https://cdn.example.com/terminal.png",
    imageData: "https://cdn.example.com/terminal.png",
    finalVideoUrl: status === "done" ? "https://cdn.example.com/final.mp4" : "",
    finalVideoHasAudio: status === "done",
    diskStatus: status === "done" ? "done" : "",
    diskPath: "disk:/internal/path/that/should/not/be/sent/to/compact/ui.mp4",
    diskUrl: status === "done" ? "https://disk.example.com/final" : "",
    diskMessage: status === "done" ? "Сохранено".repeat(300) : "",
    failMsg: status === "failed" ? "provider failed ".repeat(600) : "",
    outputType: "final-video",
    requiresFinalVideo: true,
    renderedWithoutAvatar: false,
    productVisualMode: "exact-product",
    inputUrls: ["https://cdn.example.com/input.png"],
    inputRefs: [{ role: "product", title: "Product", isLocalData: false }],
    quotaCountedAt: "2026-06-30T20:01:00.000Z",
    quotaCountedStatus: status,
    queueName: "generation",
    queueStatus: "completed",
    queuePriority: 7,
    queueAttempts: 1,
    queueMaxAttempts: 2,
    queueScheduledAt: "2026-06-30T20:00:00.000Z",
    queueLockedAt: "2026-06-30T20:00:30.000Z",
    queueLockOwner: "worker-1",
    queueLastError: status === "failed" ? "provider failed" : "",
    queueIdempotencyKey: `queue-key-${status}`,
    queueProviderTaskId: `provider-task-${status}`,
    queueMetadata: { source: "smoke" },
    prompt: "x".repeat(8000),
    serverJobContext: {
      project: { characters: [{ imageData: "data:image/png;base64,III" }] }
    },
    aiTrace: { version: "trace-v1", imagePromptContract: { huge: "x".repeat(8000) } },
    promptContract: { huge: "x".repeat(8000) },
    imagePromptContract: { huge: "x".repeat(8000) },
    imagePromptPackage: { huge: "x".repeat(8000) },
    attentionMap: { huge: "x".repeat(8000) },
    qaReview: { huge: "x".repeat(8000) },
    creativeQuality: { huge: "x".repeat(8000) },
    visualBrief: { huge: "x".repeat(8000) },
    contentScript: { huge: "x".repeat(8000) },
    creativeBrief: { topic: "heavy creative", huge: "x".repeat(8000) },
    diversitySlot: {
      contentLayer: { id: "layer-1", subject: "subject", huge: "x".repeat(8000) },
      topicCluster: { id: "cluster-1", label: "cluster", huge: "x".repeat(8000) }
    },
    hookIntelligence: { hookType: "heavy hook", huge: "x".repeat(8000) },
    layoutContentPlan: { layoutType: "heavy layout", huge: "x".repeat(8000) },
    aiPlan: { steps: ["heavy plan"] },
    finalContent: { headline: "Heavy headline" },
    productFact: { claim: "heavy fact" },
    curiosityAngle: { angle: "heavy angle" },
    productVisibilityDecision: { reason: "heavy decision" },
    hookSeed: "heavy hook seed",
    selectionSnapshot: { large: "x".repeat(8) }
  };
}

function assertTerminalQueueFields(job) {
  assert.equal(job.projectId, "project-1");
  assert.equal(job.productId, "product-1");
  assert.equal(job.productName, "Product name");
  assert.match(job.title, /^Terminal /);
  assert.equal(job.topic, "Queue topic");
  assert.equal(typeof job.progress, "number");
  assert.equal(job.imageUrl, "https://cdn.example.com/terminal.png");
  assert.equal(job.imageData, "");
  assert.equal(job.outputType, "final-video");
  assert.equal(job.requiresFinalVideo, true);
  assert.equal(job.productVisualMode, "exact-product");
  assert.deepEqual(job.inputUrls, ["https://cdn.example.com/input.png"]);
  assert.deepEqual(job.inputRefs, [{ role: "product", title: "Product", isLocalData: false }]);
  assert.equal("diskPath" in job, false);
  if (job.status === "failed") assert.equal(job.failMsg.length <= 501, true);
  if (job.diskMessage) assert.equal(job.diskMessage.length <= 501, true);
  assert.equal(job.queueName, "generation");
  assert.equal(job.queuePriority, 7);
  assert.equal("queueMetadata" in job, false);
  assert.equal(job.quotaCountedAt, "2026-06-30T20:01:00.000Z");
}

function assertHeavyTerminalFieldsRemoved(job) {
  assert.equal(JSON.stringify(job).includes('"huge"'), false);
  [
    "prompt",
    "serverJobContext",
    "imagePromptContract",
    "imagePromptPackage",
    "attentionMap",
    "qaReview",
    "creativeQuality",
    "visualBrief",
    "contentScript",
    "diversitySlot",
    "hookIntelligence",
    "layoutContentPlan",
    "aiPlan",
    "finalContent",
    "productFact",
    "curiosityAngle",
    "hookSeed"
  ].forEach((field) => assert.equal(field in job, false, `${field} should be removed from compact terminal job`));
}

function createJsonResponse() {
  return {
    status: 0,
    payload: null,
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.payload = JSON.parse(body);
    }
  };
}

function createJsonRequest(method, body) {
  const chunks = [JSON.stringify(body)];
  return {
    method,
    on(event, callback) {
      if (event === "data") chunks.forEach((chunk) => callback(Buffer.from(chunk)));
      if (event === "end") callback();
    },
    destroy() {}
  };
}
