import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { products, projects } from "../src/domain/entities.js";
import { renderMediaPreviewModal } from "../src/ui/modals.js";
import { renderPreviewTrigger } from "../src/ui/preview-modal.js";
import { renderQueuePanel } from "../src/ui/queue.js";

test("media preview modal has one reusable image and video container", () => {
  const html = renderMediaPreviewModal();

  assert.match(html, /id="media-preview-modal"/);
  assert.match(html, /id="media-preview-body"/);
  assert.match(html, /data-close-preview-media/);
});

test("preview trigger keeps media url title and type", () => {
  const html = renderPreviewTrigger({
    src: "https://cdn.example.com/final.mp4",
    title: "Финальный ролик",
    type: "video",
    className: "queue-preview"
  });

  assert.match(html, /class="queue-preview"/);
  assert.match(html, /data-preview-media="https:\/\/cdn\.example\.com\/final\.mp4"/);
  assert.match(html, /data-preview-type="video"/);
  assert.match(html, /data-preview-title="Финальный ролик"/);
  assert.match(html, /<video/);
});

test("queue previews open both generated images and final videos", () => {
  const project = projects[0];
  const html = renderQueuePanel({
    products,
    jobs: [{
      id: "job-image",
      projectId: project.id,
      productId: "magnesium",
      status: "review",
      stage: "approval",
      progress: 80,
      outputType: "image",
      imageUrl: "https://cdn.example.com/image.png",
      title: "Картинка",
      topic: "тема",
      music: "аудио",
      inputUrls: []
    }, {
      id: "job-video",
      projectId: project.id,
      productId: "magnesium",
      status: "done",
      stage: "export",
      progress: 100,
      outputType: "final-video",
      finalVideoUrl: "/generated/avatar-videos/final.mp4",
      imageUrl: "https://cdn.example.com/final-frame.png",
      title: "Видео",
      topic: "тема",
      music: "аудио",
      inputUrls: []
    }]
  }, { project });

  assert.match(html, /data-preview-media="https:\/\/cdn\.example\.com\/image\.png"/);
  assert.match(html, /data-preview-type="image"/);
  assert.match(html, /data-preview-media="\/generated\/avatar-videos\/final\.mp4"/);
  assert.match(html, /data-preview-type="video"/);
  assert.match(html, /Продукт: Магний вечерний/);
});

test("queue uses final video preview when the video url is local generated media", () => {
  const project = projects[0];
  const html = renderQueuePanel({
    products,
    jobs: [{
      id: "job-video",
      projectId: project.id,
      productId: "magnesium",
      status: "done",
      stage: "export",
      progress: 100,
      outputType: "final-video",
      finalVideoUrl: "/generated/avatar-videos/final.mp4",
      imageUrl: "https://cdn.example.com/final-frame.png",
      title: "Видео",
      topic: "тема",
      music: "аудио",
      inputUrls: []
    }]
  }, { project });

  assert.match(html, /data-preview-media="\/generated\/avatar-videos\/final\.mp4"/);
  assert.match(html, /data-preview-type="video"/);
});

test("preview modal survives app rerenders during generation", () => {
  const previewSource = readFileSync(new URL("../src/ui/preview-modal.js", import.meta.url), "utf8");
  const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const queueSource = readFileSync(new URL("../src/ui/queue.js", import.meta.url), "utf8");
  const renderSource = readFileSync(new URL("../src/ui/render.js", import.meta.url), "utf8");

  assert.match(previewSource, /dataset\.previewModalBound/);
  assert.match(previewSource, /getOpenMediaPreviewState/);
  assert.match(previewSource, /restoreMediaPreviewState/);
  assert.match(previewSource, /previewDismissedKey/);
  assert.match(previewSource, /getPreviewStateKey/);
  assert.match(mainSource, /scheduleRender/);
  assert.match(mainSource, /renderAppSafely/);
  assert.match(mainSource, /renderApp\(root, store, \{ auth, rerender: renderAppSafely \}\)/);
  assert.match(mainSource, /root:\s*null/);
  assert.match(mainSource, /startStudio\(\);\s*auth\.start\(\);/s);
  assert.match(mainSource, /isJobsOnlyPatch/);
  assert.match(mainSource, /requestRenderFrame/);
  assert.match(mainSource, /updateQueuePanel\(root, pendingState/);
  assert.match(renderSource, /bindHooksEvents\(root,/);
  assert.match(renderSource, /refresh: options\.rerender/);
  assert.match(queueSource, /bindQueuePanelEvents/);
  assert.match(queueSource, /renderQueueList/);
});

test("preview modal closes on click outside content", () => {
  const previewSource = readFileSync(new URL("../src/ui/preview-modal.js", import.meta.url), "utf8");

  assert.match(previewSource, /isPreviewBackdropClick/);
  assert.match(previewSource, /#media-preview-modal, #media-preview-modal > \.modal-backdrop/);
  assert.match(previewSource, /previewDismissedKey/);
});
