import test from "node:test";
import assert from "node:assert/strict";
import { projects } from "../src/domain/entities.js";
import { renderAvatarSettings } from "../src/ui/avatar.js";
import { bindAvatarOverlayComposerEvents } from "../src/ui/avatar-overlay-composer.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

test("avatar settings uploads avatars and hides generation review flow", () => {
  const project = {
    ...projects[0],
    characters: [{
      ...projects[0].characters[0],
      avatarVideos: [{
        id: "avatar-video-ui",
        status: "ready",
        videoUrl: "https://cdn.example.com/avatar.mp4",
        ctaOverlay: { text: "ЖМИ", prompt: "яркая плашка в стиле проекта" }
      }]
    }]
  };
  const html = renderAvatarSettings({ project, character: project.characters[0] });
  const avatarForm = html.match(/<form id="avatar-form"[\s\S]*?<\/form>/)?.[0] || "";

  assert.ok(html.indexOf("Загрузить аватар") < html.indexOf("Аватары проекта"));
  assert.match(html, /<details class="avatar-toggle-section" open data-avatar-section="upload">/);
  assert.match(html, /<details class="avatar-toggle-section" data-avatar-section="approved">/);
  assert.match(html, /<details class="avatar-overlay-composer" open>/);
  assert.match(html, /name="imageFile"/);
  assert.match(html, /Хромакей-видео будет создано из загруженного изображения активного аватара/);
  assert.doesNotMatch(html, /Проверка аватара/);
  assert.doesNotMatch(html, /data-approve-avatar/);
  assert.doesNotMatch(avatarForm, /name="prompt"/);
  assert.doesNotMatch(html, /Создать аватар/);
  assert.match(html, /яркая плашка в стиле проекта/);
});

test("avatar video section stays open while video is generating", () => {
  const project = {
    ...projects[0],
    characters: [{
      ...projects[0].characters[0],
      avatarVideos: [{
        id: "avatar-video-generating",
        status: "generating",
        motionPrompt: "Легкое движение корпуса"
      }]
    }]
  };
  const html = renderAvatarSettings({ project, character: project.characters[0] });

  assert.match(html, /<details class="avatar-toggle-section" open data-avatar-section="video" data-force-open="true">/);
  assert.match(html, /Создаем хромакей/);
});

test("avatar cta badge generation shows busy feedback", () => {
  const project = {
    ...projects[0],
    characters: [{
      ...projects[0].characters[0],
      avatarVideos: [{
        id: "avatar-video-busy",
        status: "ready",
        videoUrl: "https://cdn.example.com/avatar.mp4",
        ctaOverlay: {
          mode: "badge",
          text: "ЖМИ",
          candidate: { id: "candidate-busy", status: "generating" }
        }
      }]
    }]
  };
  const html = renderAvatarSettings({ project, character: project.characters[0] });

  assert.match(html, /data-cta-scope="avatar-video"/);
  assert.match(html, /data-cta-generate="avatar-video-busy" type="button" disabled/);
  assert.match(html, /Генерируем\.\.\./);
  assert.match(html, /avatar-cta-status loading/);
  assert.doesNotMatch(html, /Апрув плашки/);
});

test("avatar overlay preview prefers fresh review badge over approved old badge", () => {
  const project = {
    ...projects[0],
    characters: [{
      ...projects[0].characters[0],
      avatarVideos: [{
        id: "avatar-video-review",
        status: "ready",
        videoUrl: "https://cdn.example.com/avatar.mp4",
        ctaOverlay: {
          mode: "badge",
          text: "ЖМИ",
          badge: { status: "approved", imageUrl: "https://cdn.example.com/approved-badge.png" },
          candidate: { id: "candidate-review", status: "review", imageUrl: "https://cdn.example.com/review-badge.png" }
        }
      }]
    }]
  };
  const html = renderAvatarSettings({ project, character: project.characters[0] });

  assert.match(html, /review-badge\.png/);
  assert.doesNotMatch(html, /approved-badge\.png/);
});

test("avatar overlay composer stays visible without avatar video so CTA can be configured", () => {
  const project = {
    ...projects[0],
    ctaOverlay: { enabled: true, mode: "badge", text: "ЧИТАЙ ОПИСАНИЕ" },
    characters: [{
      ...projects[0].characters[0],
      avatarVideos: []
    }]
  };
  const html = renderAvatarSettings({ project, character: project.characters[0] });

  assert.match(html, /<details class="avatar-overlay-composer" open>/);
  assert.match(html, /Аватар еще не создан\. Плашку уже можно настраивать\./);
  assert.match(html, /Плашка \/ текст/);
  assert.match(html, /data-cta-scope="project"/);
  assert.match(html, /Сначала создайте аватар-видео, потом здесь появится настройка его позиции\./);
});

test("avatar video section renders editable emotional name", () => {
  const project = {
    ...projects[0],
    characters: [{
      ...projects[0].characters[0],
      avatarVideos: [{
        id: "avatar-video-emotion",
        name: "тревожное предупреждение",
        status: "ready",
        alphaVideoUrl: "https://cdn.example.com/avatar.webm",
        motionPrompt: "Строгий жест"
      }]
    }]
  };
  const html = renderAvatarSettings({ project, character: project.characters[0] });

  assert.match(html, /Название \/ эмоция ролика/);
  assert.match(html, /data-avatar-video-name-form="avatar-video-emotion"/);
  assert.match(html, /value="тревожное предупреждение"/);
});

test("avatar overlay composer routes no-avatar cta actions to project workflow", () => {
  const originalFormData = globalThis.FormData;
  const root = new FakeElement();
  const workbench = new FakeElement({ className: "avatar-overlay-workbench" });
  const form = new FakeElement({
    tagName: "form",
    dataset: { ctaOverlayForm: "project-1", ctaScope: "project" }
  });
  form.formValues = { text: "ЧИТАЙ ОПИСАНИЕ", enabled: "on", mode: "badge" };
  const actions = new FakeElement({ className: "avatar-cta-actions" });
  const generate = new FakeElement({ tagName: "button", dataset: { ctaGenerate: "project-1" } });
  const approve = new FakeElement({ tagName: "button", dataset: { ctaApprove: "project-1" } });
  const reset = new FakeElement({ tagName: "button", dataset: { ctaReset: "project-1" } });
  const status = new FakeElement({ tagName: "span", className: "avatar-cta-status idle", textContent: "Стандарт" });
  const note = new FakeElement({ tagName: "small", dataset: { ctaStatusNote: "" }, textContent: "" });
  actions.append(generate, approve, reset, status);
  form.append(actions, note);
  workbench.append(form);
  root.append(workbench);

  const calls = [];
  const store = {
    updateProjectCtaOverlay(payload) {
      calls.push(["updateProjectCtaOverlay", payload]);
    },
    createProjectCtaCandidate(payload) {
      calls.push(["createProjectCtaCandidate", payload]);
    },
    approveProjectCtaCandidate() {
      calls.push(["approveProjectCtaCandidate"]);
    },
    resetProjectCtaOverlay() {
      calls.push(["resetProjectCtaOverlay"]);
    },
    updateAvatarVideoCtaOverlay() {
      calls.push(["updateAvatarVideoCtaOverlay"]);
    },
    createAvatarVideoCtaCandidate() {
      calls.push(["createAvatarVideoCtaCandidate"]);
    },
    approveAvatarVideoCtaCandidate() {
      calls.push(["approveAvatarVideoCtaCandidate"]);
    },
    resetAvatarVideoCtaOverlay() {
      calls.push(["resetAvatarVideoCtaOverlay"]);
    }
  };

  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.target = target;
    }
    entries() {
      return Object.entries(this.target.formValues)[Symbol.iterator]();
    }
  };

  try {
    bindAvatarOverlayComposerEvents(root, store);
    form.dispatchEvent({ type: "change", currentTarget: form, target: form });
    generate.dispatchEvent({ type: "click", target: generate });
    approve.dispatchEvent({ type: "click", target: approve });
    reset.dispatchEvent({ type: "click", target: reset });
  } finally {
    globalThis.FormData = originalFormData;
  }

  assert.deepEqual(calls, [
    ["updateProjectCtaOverlay", { text: "ЧИТАЙ ОПИСАНИЕ", enabled: true, mode: "badge" }],
    ["createProjectCtaCandidate", { text: "ЧИТАЙ ОПИСАНИЕ", enabled: true, mode: "badge" }],
    ["approveProjectCtaCandidate"],
    ["resetProjectCtaOverlay"]
  ]);
});
