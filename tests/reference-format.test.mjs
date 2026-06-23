import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createAutoGenerationBrief } from "../src/domain/generation.js";
import { createLayoutContentPlan } from "../src/domain/layout-content-planner.js";

test("leaderboard design reference drives layout plan and generation format", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const reference = {
    id: "top-chart-ref",
    title: "TOP 21 leaderboard",
    layoutType: "infographic-template",
    takeaways: "темный постер, светящиеся вертикальные колонки, ранги, value labels"
  };
  const layout = createLayoutContentPlan(reference);
  const brief = createAutoGenerationBrief({ project, product, reference });

  assert.equal(layout.layoutType, "ranking_leaderboard");
  assert.equal(brief.format, "ranking_leaderboard");
  assert.equal(brief.compositionMode?.id, "leaderboard-bars");
  assert.equal(brief.pointCount, "12");
});

test("leaderboard reference outranks ai-provided checklist format", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const reference = {
    title: "TOP 21 leaderboard",
    layoutType: "ranking_leaderboard",
    takeaways: "rank cards, value labels, glowing vertical bars"
  };
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference,
    generationBrief: { format: "checklist", creativeBrief: { formatIntent: "saveable_note" } }
  });

  assert.equal(brief.format, "ranking_leaderboard");
  assert.equal(brief.compositionMode?.id, "leaderboard-bars");
});

test("uploaded chart reference title is treated as leaderboard", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const reference = {
    id: "uploaded-chart",
    title: "Чарт",
    layoutType: "symptoms",
    promptComment: "Чарт, дизайн, размеры"
  };
  const layout = createLayoutContentPlan(reference);
  const brief = createAutoGenerationBrief({ project, product, reference });

  assert.equal(layout.layoutType, "ranking_leaderboard");
  assert.equal(brief.format, "ranking_leaderboard");
});
