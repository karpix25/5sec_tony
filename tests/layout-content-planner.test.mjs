import test from "node:test";
import assert from "node:assert/strict";
import { createLayoutContentPlan } from "../src/domain/layout-content-planner.js";

test("layout planner maps active design references to distinct content shapes", () => {
  const cases = [
    [{ layoutType: "ranking_leaderboard", title: "Top chart" }, "ranking_leaderboard"],
    [{ title: "TOP 21 leaderboard", takeaways: "светящиеся колонки, ранги, value labels" }, "ranking_leaderboard"],
    [{ id: "viral-pink-symptoms", title: "Viral symptoms poster" }, "symptoms-poster"],
    [{ title: "Beauty grid + состав" }, "beauty-grid"],
    [{ title: "IOS блокнотт" }, "checklist-note"],
    [{ title: "Тетрадь" }, "notebook-facts"],
    [{ title: "Ностальгия", takeaways: "Стиль молодежных телепередач 90х" }, "nostalgia-story"],
    [{ title: "Белый фон + плашки" }, "fact-badges"],
    [{ title: "Минимализм" }, "minimal-thesis"]
  ];

  cases.forEach(([reference, layoutType]) => {
    const plan = createLayoutContentPlan(reference);
    assert.equal(plan.layoutType, layoutType);
    assert.ok(plan.contentShape);
    assert.ok(plan.imageTextInstruction);
  });
});

test("layout planner keeps reference identity for image prompt handoff", () => {
  const plan = createLayoutContentPlan({
    id: "ref-1",
    title: "Минимализм",
    textDensity: "medium",
    headlineStyle: "serif"
  });

  assert.equal(plan.referenceId, "ref-1");
  assert.equal(plan.referenceTitle, "Минимализм");
  assert.equal(plan.textDensity, "medium");
  assert.equal(plan.headlineStyle, "serif");
});
