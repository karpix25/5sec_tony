import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { buildImagePrompt, createAutoGenerationBrief } from "../src/domain/generation.js";
import { buildProductInsightMap } from "../src/domain/product-insights.js";
import { buildProductProfile } from "../src/domain/product-profile.js";
import { buildTopicCandidates } from "../src/domain/topic-candidates.js";

test("wellness generation brief uses product pains and facts for topic seed", () => {
  const project = {
    ...projects[0],
    projectTheme: "понятные wellness-ритуалы без магии",
    audiencePains: "к вечеру нет ощущения свежести\nутром ритуал быстро разваливается"
  };
  const product = {
    id: "chlorophyll",
    projectId: project.id,
    name: "Хлорофилл",
    description: "wellness-продукт для аккуратной ежедневной рутины",
    offer: "мягкий продукт для понятного утреннего ритуала",
    components: "жидкий формат, зеленый концентрат",
    pains: ["человек пьет кофе утром, но к середине дня уже сдувается", "хаос в wellness-рутине"],
    facts: ["без магических обещаний", "важна регулярность"],
    forbidden: ["лечит", "гарантирует результат"]
  };

  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    generationBrief: {}
  });

  assert.match(brief.topic, /кофе|утром|сдувается|хаос|wellness/i);
  assert.match(brief.hook, /кофе|утром|сдувается|хаос|wellness/i);
  assert.ok(brief.topicCandidate);
});

test("image prompt keeps product facts but does not expose deprecated product topic fields", () => {
  const project = projects[0];
  const product = {
    ...products.find((item) => item.id === "magnesium"),
    useCases: ["вечером трудно остановиться после перегруза"],
    proofPoints: ["вечерний формат приема"],
    visualAnchors: ["стакан воды на тумбочке", "спокойный свет"]
  };
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0]
  });

  assert.match(prompt, /Факты, которые можно использовать/);
  assert.doesNotMatch(prompt, /Жизненные сценарии продукта/);
  assert.doesNotMatch(prompt, /Опорные факты для текста/);
  assert.doesNotMatch(prompt, /Визуальные якоря кроме упаковки/);
});

test("topic candidates pass psychology strategy without canned hook text", () => {
  const project = {
    ...projects[0],
    projectTheme: "хлорофилл и wellness без магии",
    audiencePains: "усталость от блогерских обещаний\nстрах купить пустышку"
  };
  const product = {
    id: "chlorophyll",
    projectId: project.id,
    name: "Хлорофилл",
    description: "wellness-продукт для аккуратной ежедневной рутины",
    offer: "понятный утренний ритуал без громких обещаний",
    components: "жидкий формат, зеленый концентрат",
    pains: ["страх купить пустышку", "непонятно, где польза, а где маркетинг"],
    facts: ["важна регулярность", "без магических обещаний"],
    forbidden: ["лечит", "гарантирует результат"]
  };

  const [candidate] = buildTopicCandidates({ project, product, existingJobs: [] });

  assert.ok(candidate.strategyId);
  assert.ok(candidate.trigger);
  assert.ok(candidate.promptInstruction);
  assert.equal(candidate.hook, "");
  assert.match(`${candidate.topic} ${candidate.promptInstruction}`, /шум|пустышк|провер|ожидан|маркетинг|цены|пользы/i);
  assert.doesNotMatch(candidate.hook, /проверили одну ошибку/i);
  assert.equal(candidate.safetyPenalty, 0);
});

test("ai product insight map enriches content without hardcoded niche presets", () => {
  const project = {
    ...projects[0],
    projectTheme: "любая ниша с полезным контентом вокруг боли"
  };
  const product = {
    id: "green-product",
    projectId: project.id,
    name: "Зеленый ритуал",
    description: "wellness-продукт для аккуратной рутины",
    offer: "понятный утренний ритуал",
    components: "зеленый концентрат",
    pains: ["хочется ощущения свежести утром"],
    facts: ["без медицинских обещаний"],
    forbidden: ["лечит"]
  };
  const aiInsightMap = buildProductInsightMap({
    insightMap: {
      id: "ai-green-routine",
      category: "AI-анализ категории продукта",
      benefitZones: [
        {
          id: "morning-context",
          pain: "утром хочется свежести, но рутина быстро разваливается",
          habit: "начать день со стакана воды и простого зеленого ритуала",
          safeFact: "роль продукта безопаснее объяснять через регулярность и ожидания",
          visual: "стакан воды, зеленый акцент, утренний свет"
        }
      ],
      connectedHabits: ["вода утром", "регулярность вместо вау-эффекта"],
      contentQuestions: ["Какая привычка помогает в той же боли?"]
    }
  });

  const profile = buildProductProfile({ project, product, insightMap: aiInsightMap });
  const candidates = buildTopicCandidates({ project, product, existingJobs: [], insightMap: aiInsightMap });
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    generationBrief: { productInsightMap: aiInsightMap }
  });
  const candidateText = candidates.map((item) => `${item.topic} ${item.habit || ""} ${item.proof || ""}`).join(" ");

  assert.equal(aiInsightMap.id, "ai-green-routine");
  assert.match(profile.useCases.join(" "), /свежести|воды|регулярность/i);
  assert.match(candidateText, /стакана воды|регулярность|ожидания/i);
  assert.match(prompt, /КАРТА ПОЛЬЗЫ ПРОДУКТА/);
  assert.match(prompt, /Смежные привычки и лайфхаки/);
  assert.doesNotMatch(candidateText, /лечит/i);
});

test("supplement strategy names concrete check instead of vague mistake hook", () => {
  const project = {
    ...projects[0],
    projectTheme: "коллаген как БАД без обещаний омоложения",
    audiencePains: "кожа выглядит уставшей\nстрах купить красивую банку без смысла"
  };
  const product = {
    id: "collagen-test",
    projectId: project.id,
    name: "Коллаген",
    description: "БАД для beauty-рутины",
    offer: "часть регулярной beauty-привычки",
    components: "коллаген, витамин C",
    pains: ["кожа выглядит уставшей", "страх купить пустышку"],
    facts: ["важна регулярность", "без обещаний омоложения"],
    forbidden: ["минус 10 лет", "гарантирует результат"]
  };

  const candidates = buildTopicCandidates({ project, product, existingJobs: [] });
  const strategyText = candidates.map((item) => `${item.topic} ${item.promptInstruction}`).join("\n");

  assert.ok(candidates.every((item) => item.hook === ""));
  assert.match(strategyText, /ожидан|пустышк|провер|регулярн|маркетинг/i);
  assert.doesNotMatch(strategyText, /проверили одну ошибку/i);
});

test("wellness products ask ai to generate adjacent health angles", () => {
  const project = { ...projects[0], projectTheme: "здоровье, энергия и полезные привычки" };
  const product = {
    id: "chlorophyll-wide",
    projectId: project.id,
    name: "Хлорофилл",
    description: "wellness БАД для утренней рутины",
    offer: "поддержать привычку пить воду",
    components: "хлорофилл",
    pains: ["утром нет энергии"],
    facts: ["важна регулярность"],
    forbidden: ["лечит"]
  };
  const candidates = buildTopicCandidates({ project, product, existingJobs: [] });
  const text = candidates.map((item) => `${item.topic} ${item.promptInstruction}`).join(" ");

  assert.match(text, /AI-команда должна сгенерировать/i);
  assert.match(text, /Большая цель за продуктом: поддержать привычку пить воду/i);
  assert.doesNotMatch(text, /физкультур|прогулк|утренний стакан|дыхан|полезная привычка/i);
});

test("beauty products do not receive hardcoded skin-care ecosystem habits", () => {
  const project = { ...projects[1], projectTheme: "красота кожи и регулярный уход" };
  const product = {
    id: "cream-wide",
    projectId: project.id,
    name: "Крем для шеи",
    description: "косметика для ухода за кожей шеи",
    offer: "часть регулярной beauty-рутины",
    components: "крем, увлажняющие компоненты",
    pains: ["кожа выглядит уставшей"],
    facts: ["важна регулярность нанесения"],
    forbidden: ["минус 10 лет"]
  };
  const candidates = buildTopicCandidates({ project, product, existingJobs: [] });
  const text = candidates.map((item) => `${item.topic} ${item.promptInstruction}`).join(" ");

  assert.match(text, /AI-команда должна сгенерировать/i);
  assert.match(text, /Большая цель за продуктом: часть регулярной beauty-рутины/i);
  assert.doesNotMatch(text, /массаж|SPF|очищение|снижение стресса/i);
});

test("ecosystem topics are ai-generation signals, not final hardcoded headlines", () => {
  const project = {
    ...projects[0],
    projectTheme: "здоровье, энергия и полезные привычки",
    audiencePains: "утром нет энергии\nобычная вода быстро надоедает"
  };
  const product = {
    id: "chlorophyll-retention",
    projectId: project.id,
    name: "Хлорофилл",
    description: "wellness БАД для утренней рутины",
    offer: "поддержать привычку пить воду",
    components: "хлорофилл",
    pains: ["утром нет энергии"],
    facts: ["важна регулярность"],
    forbidden: ["лечит"]
  };

  const candidates = buildTopicCandidates({ project, product, existingJobs: [] });
  const ecosystemCandidates = candidates.filter((item) => item.strategyId === "benefit-ecosystem");
  const candidateText = ecosystemCandidates.map((item) => `${item.topic} ${item.promptInstruction}`).join(" | ");

  assert.ok(ecosystemCandidates.length);
  assert.equal(ecosystemCandidates.some((item) => item.headline || item.subhead || item.points), false);
  assert.match(candidateText, /смысловой сигнал для AI-команды/i);
  assert.match(candidateText, /Финальную тему, заголовок, подзаголовок и пункты должен сгенерировать/i);
  assert.doesNotMatch(candidateText, /после воды хочется кофе|нет сил на спорт|украл вчерашний вечер|Крем нанесли/i);
});

test("ai department brief overrides local topic rotation", () => {
  const project = { ...projects[0], projectTheme: "здоровье, энергия и полезные привычки" };
  const product = {
    id: "chlorophyll-rotation",
    projectId: project.id,
    name: "Хлорофилл",
    description: "wellness БАД для утренней рутины",
    offer: "поддержать привычку пить воду",
    components: "хлорофилл",
    pains: ["утром нет энергии"],
    facts: ["важна регулярность"],
    forbidden: ["лечит"]
  };
  const existingJobs = [{ title: "Почему после воды хочется кофе", topic: "Почему после воды хочется кофе" }];

  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    existingJobs,
    generationBrief: {
      creativeBrief: { topic: "AI_TOPIC_ROTATION_SENTINEL", formatIntent: "saveable_note" },
      hook: "AI_HOOK_ROTATION_SENTINEL",
      contentScript: {
        headline: "AI_HEADLINE_ROTATION_SENTINEL",
        subhead: "AI_SUBHEAD_ROTATION_SENTINEL",
        points: ["AI_POINT_ROTATION_SENTINEL"]
      }
    }
  });

  assert.equal(brief.topic, "AI_TOPIC_ROTATION_SENTINEL");
  assert.equal(brief.hook, "AI_HOOK_ROTATION_SENTINEL");
  assert.equal(brief.finalContent.headline, "AI_HEADLINE_ROTATION_SENTINEL");
  assert.equal(brief.aiPlan.points[0], "AI_POINT_ROTATION_SENTINEL");
});
