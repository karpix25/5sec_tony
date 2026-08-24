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
      createdAt: "2026-07-22T14:32:00",
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
  assert.match(html, /Создано: 22\.07\.2026, 14:32/);
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
  assert.match(html, /class="queue-video-poster"/);
  assert.match(html, /src="https:\/\/cdn\.example\.com\/final-frame\.png"/);
});

test("queue shows clickable yandex disk url under final video preview", () => {
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
      finalVideoUrl: "https://cdn.example.com/final.mp4",
      diskStatus: "done",
      diskPath: "disk:/ВИДЕО/5сек/Маша/final.mp4",
      diskUrl: "https://disk.yandex.ru/i/public-video",
      imageUrl: "https://cdn.example.com/final-frame.png",
      title: "Видео",
      topic: "тема",
      music: "аудио",
      inputUrls: []
    }]
  }, { project });

  assert.match(html, /Ссылка на ролик на Яндекс\.Диске/);
  assert.match(html, /class="queue-disk-link" href="https:\/\/disk\.yandex\.ru\/i\/public-video"/);
  assert.match(html, />https:\/\/disk\.yandex\.ru\/i\/public-video</);
  assert.doesNotMatch(html, />disk:\/ВИДЕО\/5сек\/Маша\/final\.mp4</);
});

test("queue labels manual automation and legacy generation sources", () => {
  const project = projects[0];
  const baseJob = {
    projectId: project.id,
    productId: "magnesium",
    status: "running",
    stage: "image",
    progress: 20,
    outputType: "final-video",
    title: "Источник",
    topic: "тема",
    music: "аудио",
    inputUrls: []
  };
  const html = renderQueuePanel({
    products,
    jobs: [
      { ...baseJob, id: "job-auto", generationSource: "automation", createdAt: "2026-07-24T12:03:00Z" },
      { ...baseJob, id: "job-manual", generationSource: "manual", createdAt: "2026-07-24T12:02:00Z" },
      { ...baseJob, id: "job-legacy", createdAt: "2026-07-24T12:01:00Z" }
    ]
  }, { project });

  assert.match(html, />Авто</);
  assert.match(html, />Ручная</);
  assert.match(html, />Источник: старый запуск</);
});

test("preview video modal offers full video in a new tab", () => {
  const previewSource = readFileSync(new URL("../src/ui/preview-modal.js", import.meta.url), "utf8");

  assert.match(previewSource, /media-preview-actions/);
  assert.match(previewSource, /Открыть видео в новой вкладке/);
  assert.match(previewSource, /target="_blank"/);
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
  assert.match(mainSource, /renderApp\(root, store, \{ auth, rerender: renderAppSafely, pagination: getQueuePagination\(\) \}\)/);
  assert.match(mainSource, /root:\s*null/);
  assert.match(mainSource, /startStudio\(\);\s*auth\.start\(\);/s);
  assert.match(mainSource, /isJobsOnlyPatch/);
  assert.match(mainSource, /requestRenderFrame/);
  assert.match(mainSource, /updateQueuePanel\(root, pendingState/);
  assert.match(renderSource, /bindPreviewModalEvents\(root\)/);
  assert.doesNotMatch(renderSource, /bindHooksEvents/);
  assert.match(queueSource, /bindQueuePanelEvents/);
  assert.match(queueSource, /renderQueueList/);
});

test("preview modal closes on click outside content", () => {
  const previewSource = readFileSync(new URL("../src/ui/preview-modal.js", import.meta.url), "utf8");

  assert.match(previewSource, /isPreviewBackdropClick/);
  assert.match(previewSource, /#media-preview-modal, #media-preview-modal > \.modal-backdrop/);
  assert.match(previewSource, /previewDismissedKey/);
});
