import test from "node:test";
import assert from "node:assert/strict";
import { humanizeCreativeTeamDraft } from "../scripts/creative-team-humanizer.mjs";

test("creative team humanizer rewrites final script before image prompt ownership", async () => {
  const calls = [];
  const draft = await humanizeCreativeTeamDraft({
    token: "token",
    model: "writer",
    body: { project: {}, product: {} },
    draft: {
      topic: "Почему маска «съедает» объем: ошибка в распределении",
      hook: "Твоя маска крадет объем? Ошибка в нанесении",
      contentScript: { headline: "Твоя маска крадет объем? Ошибка в нанесении", subhead: "", points: ["Корни волос", "Средняя часть"] }
    },
    callOpenRouter: async (_token, model, messages) => {
      calls.push({ model, text: messages[1].content });
      return JSON.stringify({
        headline: "Маска крадет объем волос",
        subhead: "Проверьте, куда попадает средство",
        points: ["Корни лучше не перегружать", "Длине достаточно небольшого количества"]
      });
    },
    parseJsonDraft: JSON.parse
  });

  assert.equal(calls.length, 1);
  assert.equal(draft.contentScript.headline, "Маска крадет объем волос");
  assert.equal(draft.plan.points.length, 2);
  assert.match(calls[0].text, /Перепиши финальный текст/);
});

test("creative team humanizer retries a headline that will not fit", async () => {
  const calls = [];
  const draft = await humanizeCreativeTeamDraft({
    token: "token",
    model: "writer",
    body: {},
    draft: { contentScript: { headline: "Исходный заголовок для карточки", points: ["Пункт"] } },
    callOpenRouter: async (_token, _model, messages) => {
      calls.push(messages[1].content);
      return JSON.stringify(calls.length === 1
        ? { headline: "Почему волосы теряют естественный объем после маски", points: ["Пункт"] }
        : { headline: "Маска крадет объем волос", points: ["Пункт"] });
    },
    parseJsonDraft: JSON.parse
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1], /headline_too_long/);
  assert.equal(draft.contentScript.headline, "Маска крадет объем волос");
});

test("creative team humanizer falls back to deterministic cleanup", async () => {
  const draft = await humanizeCreativeTeamDraft({
    token: "token",
    model: "writer",
    body: {},
    draft: {
      contentScript: { headline: "Твоя маска крадет объем? Ошибка в нанесении", subhead: "", points: ["Корни волос"] }
    },
    callOpenRouter: async () => { throw new Error("upstream unavailable"); },
    parseJsonDraft: JSON.parse
  });

  assert.equal(draft.contentScript.headline, "Твоя маска крадет объем? Ошибка в нанесении");
});
