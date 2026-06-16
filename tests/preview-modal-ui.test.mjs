import test from "node:test";
import assert from "node:assert/strict";
import {
  bindPreviewModalEvents,
  getOpenMediaPreviewState,
  restoreMediaPreviewState
} from "../src/ui/preview-modal.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

test("preview modal opens guessed video, closes on escape, and remembers dismissal", () => {
  const root = new FakeElement();
  const modal = new FakeElement({ id: "media-preview-modal", hidden: true });
  const backdrop = new FakeElement({ className: "modal-backdrop", dataset: { closePreviewMedia: "" } });
  const content = new FakeElement({ className: "media-preview-modal" });
  const closeButton = new FakeElement({ dataset: { closePreviewMedia: "" } });
  const title = new FakeElement({ id: "media-preview-title", textContent: "Превью" });
  const body = new FakeElement({ id: "media-preview-body" });
  const trigger = new FakeElement({
    dataset: {
      previewMedia: "https://cdn.example.com/final.webm?cache=1",
      previewTitle: "Финальный ролик"
    }
  });

  root.append(modal, trigger);
  modal.append(backdrop, content);
  content.append(title, closeButton, body);

  bindPreviewModalEvents(root);
  bindPreviewModalEvents(root);

  root.dispatchEvent({ type: "click", target: trigger });
  assert.equal(root.dataset.previewModalBound, "true");
  assert.equal(modal.hidden, false);
  assert.equal(modal.dataset.previewType, "video");
  assert.match(body.innerHTML, /<video/);
  assert.deepEqual(getOpenMediaPreviewState(root), {
    src: "https://cdn.example.com/final.webm?cache=1",
    type: "video",
    title: "Финальный ролик",
    key: "https://cdn.example.com/final.webm?cache=1|video|Финальный ролик"
  });

  root.dispatchEvent({ type: "keydown", key: "Escape", target: root });
  assert.equal(modal.hidden, true);
  assert.equal(body.innerHTML, "");
  assert.equal(root.dataset.previewDismissedKey, "https://cdn.example.com/final.webm?cache=1|video|Финальный ролик");

  restoreMediaPreviewState(root, {
    src: "https://cdn.example.com/final.webm?cache=1",
    type: "video",
    title: "Финальный ролик"
  });
  assert.equal(modal.hidden, true);

  restoreMediaPreviewState(root, {
    src: "https://cdn.example.com/other.png",
    type: "image",
    title: "Другая картинка"
  });
  assert.equal(modal.hidden, false);
  assert.match(body.innerHTML, /<img/);
});

test("preview modal ignores unrelated clicks until a real preview trigger is pressed", () => {
  const root = new FakeElement();
  const modal = new FakeElement({ id: "media-preview-modal", hidden: true });
  const backdrop = new FakeElement({ className: "modal-backdrop", dataset: { closePreviewMedia: "" } });
  const body = new FakeElement({ id: "media-preview-body" });
  const title = new FakeElement({ id: "media-preview-title" });
  const trigger = new FakeElement({
    dataset: {
      previewMedia: "data:image/png;base64,aaa",
      previewType: "image",
      previewTitle: "Картинка"
    }
  });
  const unrelated = new FakeElement({ className: "anything" });

  root.append(modal, trigger, unrelated);
  modal.append(backdrop, title, body);
  bindPreviewModalEvents(root);

  root.dispatchEvent({ type: "click", target: unrelated });
  assert.equal(modal.hidden, true);

  root.dispatchEvent({ type: "click", target: trigger });
  assert.equal(modal.hidden, false);
});

test("preview modal closes from a text-node-like click target inside the close button", () => {
  const root = new FakeElement();
  const modal = new FakeElement({ id: "media-preview-modal", hidden: true });
  const content = new FakeElement({ className: "media-preview-modal" });
  const closeButton = new FakeElement({ dataset: { closePreviewMedia: "" } });
  const title = new FakeElement({ id: "media-preview-title", textContent: "Превью" });
  const body = new FakeElement({ id: "media-preview-body" });
  const trigger = new FakeElement({
    dataset: {
      previewMedia: "https://cdn.example.com/final.mp4",
      previewType: "video",
      previewTitle: "Видео"
    }
  });

  root.append(modal, trigger);
  modal.append(content);
  content.append(title, closeButton, body);
  bindPreviewModalEvents(root);
  root.dispatchEvent({ type: "click", target: trigger });

  const textNodeLikeTarget = { parentNode: closeButton };
  root.dispatchEvent({ type: "click", target: textNodeLikeTarget });

  assert.equal(modal.hidden, true);
  assert.equal(body.innerHTML, "");
});
