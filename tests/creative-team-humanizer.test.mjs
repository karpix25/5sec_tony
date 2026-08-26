import test from "node:test";
import assert from "node:assert/strict";
import { humanizeCreativeTeamDraft } from "../scripts/creative-team-humanizer.mjs";
import { humanizeTextInstruction } from "../scripts/creative-team-prompts.mjs";
import { getUnsupportedClaimViolations } from "../src/domain/content-claim-contract.js";
import { getVisibleTextContractViolations } from "../src/domain/design-text-contract.js";

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
        headline: "Маска попала прямо на корни",
        subhead: "Проверьте, куда попадает средство",
        points: ["Корни лучше не перегружать", "Длине достаточно небольшого количества"]
      });
    },
    parseJsonDraft: JSON.parse
  });

  assert.equal(calls.length, 2);
  assert.equal(draft.contentScript.headline, "Маска попала прямо на корни");
  assert.equal(draft.plan.points.length, 2);
  assert.match(calls[0].text, /Перепиши финальный текст/);
});

test("creative team humanizer receives the operator restrictions directly", () => {
  const instruction = JSON.parse(humanizeTextInstruction({
    product: { name: "Маска для волос", forbidden: ["Не обещать лечение"] }
  }));

  assert.deepEqual(instruction.operatorProductContext.hardRestrictions, ["Не обещать лечение"]);
});

test("creative team humanizer proofreads a repaired headline", async () => {
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
        : { headline: "Маска попала прямо на корни", points: ["Пункт"] });
    },
    parseJsonDraft: JSON.parse
  });

  assert.equal(calls.length, 3);
  assert.match(calls[1], /headline_too_long/);
  assert.equal(draft.contentScript.headline, "Маска попала прямо на корни");
});

test("creative team humanizer rewrites metaphorical headlines into literal ones", async () => {
  const calls = [];
  const draft = await humanizeCreativeTeamDraft({
    token: "token",
    model: "writer",
    body: {},
    draft: {
      contentScript: {
        headline: "Список дел перед сном крадет ваш отдых",
        subhead: "Что мешает хорошо спать",
        points: ["Рабочие задачи в голове", "Телефон перед сном", "Позднее планирование"]
      }
    },
    callOpenRouter: async (_token, _model, messages) => {
      calls.push(messages[1].content);
      return JSON.stringify(calls.length === 1
        ? { headline: "Список дел перед сном крадет ваш отдых", subhead: "Что мешает хорошо спать", points: ["Рабочие задачи в голове", "Телефон перед сном", "Позднее планирование"] }
        : { headline: "Что перед сном мешает хорошо спать", subhead: "Три привычки не дают вовремя расслабиться", points: ["Рабочие задачи в голове", "Телефон перед сном", "Позднее планирование"] });
    },
    parseJsonDraft: JSON.parse
  });

  assert.equal(calls.length, 3);
  assert.match(calls[1], /headline_ambiguous/);
  assert.equal(draft.contentScript.headline, "Что перед сном мешает хорошо спать");
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: draft.contentScript }), []);
});

test("creative team humanizer keeps a clear adjacent topic without forcing the product name", async () => {
  const draft = await humanizeCreativeTeamDraft({
    token: "token",
    model: "writer",
    body: {
      topicSelection: {
        theme: "Ошибки в выборе косметики",
        situation: "Много банок в ванной"
      }
    },
    draft: {
      product: { name: "Пептидная сыворотка" },
      contentScript: { headline: "Не спеши с выбором вслепую", points: [] }
    },
    callOpenRouter: async () => JSON.stringify({ headline: "Не спеши с выбором вслепую", points: [] }),
    parseJsonDraft: JSON.parse
  });

  assert.equal(draft.contentScript.headline, "Много банок в ванной");
  assert.doesNotMatch(draft.contentScript.headline, /сыворотка/i);
});

test("creative team humanizer replaces a headline that drifted outside the selected direction", async () => {
  const calls = [];
  const draft = await humanizeCreativeTeamDraft({
    token: "token",
    model: "writer",
    body: {
      contentDirection: { id: "care-habits", title: "Привычки ухода", relation: "Связь с ежедневным уходом." },
      topicSelection: {
        directionId: "care-habits",
        theme: "Привычки ухода",
        situation: "Средство заканчивается в самый неудобный момент",
        productRelation: "Тема помогает выстроить ежедневный уход"
      }
    },
    draft: { contentScript: { headline: "Скрип: что проверить", points: ["Проверка перед выбором"] } },
    callOpenRouter: async (_token, _model, messages) => {
      calls.push(messages[1].content);
      return JSON.stringify(calls.length === 1
        ? { headline: "Скрип: что проверить", points: ["Проверка перед выбором"] }
        : { headline: "Ежедневный уход без пропусков", points: ["Меняйте средство вовремя", "Держите запас дома"] });
    },
    parseJsonDraft: JSON.parse
  });

  assert.equal(calls.length, 3);
  assert.match(calls[0], /Привычки ухода/);
  assert.match(calls[0], /Средство заканчивается/);
  assert.equal(draft.contentScript.headline, "Ежедневный уход без пропусков");
});

test("creative team humanizer proofreads repaired medical causes without stopping generation", async () => {
  const calls = [];
  const draft = await humanizeCreativeTeamDraft({
    token: "token",
    model: "writer",
    body: { product: { name: "Крем для век", description: "Легкий крем с пептидами", facts: ["Быстро впитывается"] } },
    draft: {
      productPassport: { category: "уход за кожей" },
      contentScript: { headline: "Лицо устает к обеду", points: ["Быстро впитывается"] }
    },
    callOpenRouter: async (_token, _model, messages) => {
      calls.push(messages[1].content);
      return JSON.stringify(calls.length === 1
        ? { headline: "Лицо устает к обеду", points: ["Гаджеты обезвоживают кожу вокруг глаз"] }
        : { headline: "Лицо устает к обеду", points: ["Легкий крем быстро впитывается"] });
    },
    parseJsonDraft: JSON.parse
  });

  assert.equal(calls.length, 3);
  assert.match(calls[1], /unsupported_effect/);
  assert.deepEqual(draft.contentScript.points, ["Легкий крем быстро впитывается"]);
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

  assert.deepEqual(getVisibleTextContractViolations({ contentScript: draft.contentScript }), []);
  assert.equal(draft.textContractRecovery.used, true);
});

test("creative team humanizer returns a safe result after three invalid rewrites", async () => {
  const calls = [];
  const productDump = `5 сигналов, что про ${"описание продукта ".repeat(20)}лучше узнать заранее`;
  const draft = await humanizeCreativeTeamDraft({
    token: "token",
    model: "writer",
    body: {},
    draft: {
      hook: "Скрабы не лечат гусиную кожу",
      contentScript: { headline: productDump, subhead: "", points: ["Кислоты мягко обновляют кожу"] }
    },
    callOpenRouter: async () => {
      calls.push(true);
      return JSON.stringify({ headline: productDump, points: ["Кислоты мягко обновляют кожу"] });
    },
    parseJsonDraft: JSON.parse
  });

  assert.equal(calls.length, 3);
  assert.equal(draft.contentScript.headline, "Скрабы не лечат гусиную кожу");
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: draft.contentScript }), []);
});

test("claim repair never restores an unsafe headline from the original hook", async () => {
  const product = { name: "Гель для душа", description: "Гель с кислотами для ухода за кожей" };
  const draft = await humanizeCreativeTeamDraft({
    token: "token",
    model: "writer",
    body: { product },
    draft: {
      hook: "Почему скрабы вредят вашей коже",
      contentScript: { headline: "Почему скрабы вредят вашей коже", points: ["Следуйте инструкции на упаковке"] }
    },
    callOpenRouter: async () => JSON.stringify({
      headline: "Почему скрабы вредят вашей коже",
      points: ["Следуйте инструкции на упаковке"]
    }),
    parseJsonDraft: JSON.parse
  });

  assert.deepEqual(getUnsupportedClaimViolations(draft.contentScript, { product }), []);
  assert.notEqual(draft.contentScript.headline, "Почему скрабы вредят вашей коже");
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: draft.contentScript }), []);
});
