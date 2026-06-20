import test from "node:test";
import assert from "node:assert/strict";
import { projects } from "../src/domain/entities.js";
import { renderAvatarSettings } from "../src/ui/avatar.js";
import { bindAvatarOverlayComposerEvents } from "../src/ui/avatar-overlay-composer.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

test("avatar settings sort creation first and hide sections in toggles", () => {
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

  assert.ok(html.indexOf("Создать аватар") < html.indexOf("Проверка аватара"));
  assert.ok(html.indexOf("Проверка аватара") < html.indexOf("Аватары проекта"));
  assert.match(html, /<details class="avatar-toggle-section" open>/);
  assert.match(html, /<details class="avatar-toggle-section" >/);
  assert.match(html, /<details class="avatar-overlay-composer" open>/);
  assert.match(html, /name="prompt"/);
  assert.match(html, /яркая плашка в стиле проекта/);
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
  const status = new FakeElement({ tagName: "span", className: "avatar-cta-status idle", textContent: "Стандарт" });
  const note = new FakeElement({ tagName: "small", dataset: { ctaStatusNote: "" }, textContent: "" });
  actions.append(generate, approve, status);
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
    updateAvatarVideoCtaOverlay() {
      calls.push(["updateAvatarVideoCtaOverlay"]);
    },
    createAvatarVideoCtaCandidate() {
      calls.push(["createAvatarVideoCtaCandidate"]);
    },
    approveAvatarVideoCtaCandidate() {
      calls.push(["approveAvatarVideoCtaCandidate"]);
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
  } finally {
    globalThis.FormData = originalFormData;
  }

  assert.deepEqual(calls, [
    ["updateProjectCtaOverlay", { text: "ЧИТАЙ ОПИСАНИЕ", enabled: true, mode: "badge" }],
    ["createProjectCtaCandidate", { text: "ЧИТАЙ ОПИСАНИЕ", enabled: true, mode: "badge" }],
    ["approveProjectCtaCandidate"]
  ]);
});
