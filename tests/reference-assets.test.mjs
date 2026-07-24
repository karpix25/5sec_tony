import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { projects, products } from "../src/domain/entities.js";
import { createGenerationJob, getGenerationInputReferences } from "../src/domain/generation.js";
import { getSafeZoneInputReference, safeZoneReferenceRole } from "../src/domain/safe-zone-reference.js";
import { handleReferenceAssetsApi, resolveImageInputUrls, summarizeInputRefs } from "../scripts/reference-assets.mjs";

const tinyPng = "data:image/png;base64,iVBORw0KGgo=";

test("generation job keeps local product references for image-to-image handoff", () => {
  const project = projects[0];
  const product = {
    ...products[0],
    references: [{
      title: "Реальная упаковка",
      promptComment: "белая бутылка с зеленой этикеткой",
      imageData: tinyPng
    }]
  };
  const job = createGenerationJob({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    generationBrief: {
      topic: "Как выбрать хлорофилл",
      hook: "Что смотреть на упаковке",
      visualObject: "реальная бутылка крупно"
    }
  });

  assert.equal(job.inputRefs[0].role, safeZoneReferenceRole);
  assert.equal(job.inputUrls[0], getSafeZoneInputReference().url);
  assert.equal(job.promptContract.inputRefs[0].role, safeZoneReferenceRole);
  assert.deepEqual(job.inputRefs.find((item) => item.role === "product"), { role: "product", title: "Реальная упаковка", isLocalData: true });
  assert.equal(job.inputUrls.includes(tinyPng), true);
  assert.match(job.prompt, /SAFE ZONE REFERENCE/);
  assert.match(job.prompt, /Референсы продукта: Реальная упаковка: белая бутылка с зеленой этикеткой/);
  assert.match(job.prompt, /PRODUCT REFERENCE PLAN: product-present/);
  assert.doesNotMatch(job.prompt, /он не передан в image-to-image/);
});

test("reference asset resolver publishes data urls through public base url", async () => {
  const previousPublicBase = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = "https://studio.example.com";
  const resolved = await resolveImageInputUrls([tinyPng, "https://cdn.example.com/style.png"], {
    headers: { host: "127.0.0.1:4173" }
  });
  if (previousPublicBase === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = previousPublicBase;

  assert.equal(resolved.length, 2);
  assert.match(resolved[0], /^https:\/\/studio\.example\.com\/api\/reference-assets\//);
  assert.equal(resolved[1], "https://cdn.example.com/style.png");
});

test("reference asset API stores uploaded data url and returns a small preview URL", async () => {
  const response = createJsonCaptureResponse();
  const request = Readable.from([JSON.stringify({ imageData: tinyPng, imageName: "style.png" })]);
  request.method = "POST";
  request.headers = { host: "127.0.0.1:4173" };

  const handled = await handleReferenceAssetsApi(request, response, new URL("http://127.0.0.1:4173/api/reference-assets"));
  const { status, payload } = response.readJson();

  assert.equal(handled, true);
  assert.equal(status, 200);
  assert.match(payload.url, /^\/api\/reference-assets\//);
  assert.equal(payload.imageName, "style.png");
  assert.equal(payload.url.includes("base64"), false);
});

test("reference asset API accepts multipart image uploads", async () => {
  const response = createJsonCaptureResponse();
  const request = createMultipartImageRequest({
    url: "http://127.0.0.1:4173/api/reference-assets",
    fields: { imageName: "style.png" },
    fileName: "style.png",
    mimeType: "image/png",
    buffer: Buffer.from("tiny-image")
  });

  const handled = await handleReferenceAssetsApi(request, response, new URL("http://127.0.0.1:4173/api/reference-assets"));
  const { status, payload } = response.readJson();

  assert.equal(handled, true);
  assert.equal(status, 200);
  assert.match(payload.url, /^\/api\/reference-assets\//);
  assert.equal(payload.imageName, "style.png");
});

test("reference asset resolver expands saved same-origin asset paths for providers", async () => {
  const previousPublicBase = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = "https://studio.example.com";

  try {
    const resolved = await resolveImageInputUrls(["/api/reference-assets/ref-1"], {
      headers: { host: "127.0.0.1:4173" }
    });

    assert.deepEqual(resolved, ["https://studio.example.com/api/reference-assets/ref-1"]);
  } finally {
    if (previousPublicBase === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousPublicBase;
  }
});

test("generation job keeps saved design reference asset paths for image handoff", () => {
  const project = {
    ...projects[0],
    references: [{
      ...projects[0].references[0],
      imageData: "/api/reference-assets/design-1"
    }]
  };
  const product = products.find((item) => item.projectId === project.id);
  const job = createGenerationJob({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0]
  });

  assert.equal(job.inputRefs[0].role, safeZoneReferenceRole);
  assert.equal(job.inputUrls[0], getSafeZoneInputReference().url);
  assert.equal(job.inputUrls.includes("/api/reference-assets/design-1"), true);
  assert.deepEqual(job.inputRefs.find((item) => item.role === "design"), {
    role: "design",
    title: project.references[0].title,
    isLocalData: false
  });
});

test("generation input references keep safe-zone first when input refs hit provider limit", () => {
  const reference = { ...projects[0].references[0], imageData: "/api/reference-assets/design-1" };
  const product = {
    ...products[0],
    references: Array.from({ length: 20 }, (_, index) => ({
      title: `Product ${index + 1}`,
      imageData: `https://cdn.example.com/product-${index + 1}.png`
    }))
  };

  const refs = getGenerationInputReferences({ reference, product });

  assert.equal(refs.length, 16);
  assert.equal(refs[0].role, safeZoneReferenceRole);
  assert.equal(refs[1].role, "design");
  assert.equal(refs.filter((item) => item.role === "product").length, 14);
});

test("reference asset logs distinguish product references", () => {
  const summary = summarizeInputRefs({
    rawInputUrls: [tinyPng, "https://cdn.example.com/style.png"],
    resolvedInputUrls: ["https://studio.example.com/api/reference-assets/1", "https://cdn.example.com/style.png"],
    inputRefs: [
      { role: "product", title: "Реальная упаковка", isLocalData: true },
      { role: safeZoneReferenceRole, title: "Safe zone placement mask", isLocalData: true },
      { role: "design", title: "Стиль", isLocalData: false }
    ]
  });

  assert.deepEqual(summary, {
    rawInputUrls: 2,
    resolvedInputUrls: 2,
    localInputUrls: 1,
    remoteInputUrls: 1,
    safeZoneRefs: 1,
    productRefs: 1,
    localProductRefs: 1,
    designRefs: 1
  });
});

test("generation job skips product image inputs in no-package mode", () => {
  const project = { ...projects[0], productInFramePercent: 0 };
  const product = {
    ...products[0],
    references: [{
      title: "Реальная упаковка",
      promptComment: "белая бутылка с зеленой этикеткой",
      imageData: tinyPng
    }]
  };
  const job = createGenerationJob({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    generationBrief: {
      topic: "Почему тяжело уснуть",
      hook: "Что мешает расслабиться вечером",
      visualObject: "вечерний свет и стакан воды"
    }
  });

  assert.equal(job.productVisualMode, "no-package");
  assert.deepEqual(job.inputRefs.map((item) => item.role), [safeZoneReferenceRole]);
  assert.deepEqual(job.inputUrls, [getSafeZoneInputReference().url]);
  assert.equal(job.inputRefs.some((item) => item.role === "product"), false);
  assert.match(job.prompt, /PRODUCT REFERENCE PLAN: product-absent/);
  assert.match(job.prompt, /retention visual/);
});

function createJsonCaptureResponse() {
  return {
    status: 200,
    data: "",
    writeHead(status) {
      this.status = status;
    },
    end(data) {
      this.data = data || "";
    },
    readJson() {
      return { status: this.status, payload: this.data ? JSON.parse(this.data) : {} };
    }
  };
}

function createMultipartImageRequest({ fields = {}, fileName, mimeType, buffer }) {
  const boundary = "----anton-test-boundary";
  const parts = Object.entries(fields).map(([name, value]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
  );
  parts.push(Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]));
  const request = Readable.from(parts);
  request.method = "POST";
  request.headers = { host: "127.0.0.1:4173", "content-type": `multipart/form-data; boundary=${boundary}` };
  return request;
}
