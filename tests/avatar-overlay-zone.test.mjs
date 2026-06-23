import test from "node:test";
import assert from "node:assert/strict";
import { createAvatarReservedZone, formatAvatarReservedZonePrompt } from "../src/domain/avatar-overlay-zone.js";
import { buildImagePrompt } from "../src/domain/generation.js";
import { projects, products } from "../src/domain/entities.js";

test("avatar reserved zone follows the selected overlay geometry", () => {
  const zone = createAvatarReservedZone({
    character: {
      id: "avatar-1",
      name: "Presenter",
      avatarVideos: [{
        isActive: true,
        overlay: { x: 75, y: 100, scale: 37, opacity: 100 },
        ctaOverlay: { enabled: true, x: 50, y: 78, scale: 100 }
      }]
    }
  });

  assert.equal(zone.anchor, "bottom-right");
  assert.deepEqual(zone.avatarBox, { x1: 547, y1: 1086, x2: 989, y2: 1792 });
  assert.deepEqual(zone.ctaBox, { x1: 332, y1: 1343, x2: 692, y2: 1453 });
  assert.deepEqual(zone.reservedBox, { x1: 310, y1: 1086, x2: 989, y2: 1792 });
});

test("avatar reserved zone prompt asks for natural negative space", () => {
  const prompt = formatAvatarReservedZonePrompt(createAvatarReservedZone({
    character: { id: "avatar-1", avatarVideos: [{ overlay: { x: 64, y: 92, scale: 40 } }] }
  }));

  assert.match(prompt, /AVATAR RESERVED ZONE/);
  assert.match(prompt, /naturally open/);
  assert.match(prompt, /intentional negative space/);
  assert.match(prompt, /Do not draw the avatar/);
});

test("image prompt reserves avatar area in creative team mode", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: {
      id: "avatar-1",
      name: "Presenter",
      avatarVideos: [{ overlay: { x: 75, y: 100, scale: 37 }, ctaOverlay: { enabled: true } }]
    },
    generationBrief: {
      imagePromptPackage: { prompt: "Short GPT Image 2 prompt from creative team." },
      contentScript: { headline: "Топ признаков", subhead: "Короткая легенда", points: ["Первый", "Второй"] }
    }
  });

  assert.match(prompt, /Short GPT Image 2 prompt from creative team/);
  assert.match(prompt, /AVATAR RESERVED ZONE/);
  assert.match(prompt, /reserved rectangle x=310\.\.989, y=1086\.\.1792/);
});
