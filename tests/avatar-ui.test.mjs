import test from "node:test";
import assert from "node:assert/strict";
import { projects } from "../src/domain/entities.js";
import { renderAvatarSettings } from "../src/ui/avatar.js";

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

  assert.match(html, /data-cta-generate="supplements" type="button" disabled/);
  assert.match(html, /Генерируем\.\.\./);
  assert.match(html, /avatar-cta-status loading/);
  assert.doesNotMatch(html, /Апрув плашки/);
});

test("avatar overlay composer stays visible without avatar video so CTA can be configured", () => {
  const project = {
    ...projects[0],
    ctaOverlay: { enabled: true, mode: "text", text: "ПОДПИШИСЬ" },
    characters: [{
      ...projects[0].characters[0],
      avatarVideos: []
    }]
  };
  const html = renderAvatarSettings({ project, character: project.characters[0] });

  assert.match(html, /<details class="avatar-overlay-composer" open>/);
  assert.match(html, /Аватар еще не создан\. Плашку уже можно настраивать\./);
  assert.match(html, /Плашка \/ текст/);
  assert.match(html, /Сначала создайте аватар-видео, потом здесь появится настройка его позиции\./);
});
