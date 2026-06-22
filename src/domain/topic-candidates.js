import { buildProductProfile } from "./product-profile.js";
import { getProductContentFocus } from "./product-content-focus.js";

const hookStrategies = [
  {
    id: "authority-break",
    label: "разоблачение шума",
    trigger: "усталость от идеальных советов и недоверие к громким обещаниям",
    format: "comparison",
    scoreBonus: 5,
    topic: ({ subject }) => `Где реальная польза, а где шум: ${subject}`,
    instruction: "Начни с конфликта между обещаниями рынка и тем, что человек реально может проверить в жизни."
  },
  {
    id: "personal-result",
    label: "личная выгода",
    trigger: "желание быстро понять, что это даст лично мне",
    format: "checklist",
    scoreBonus: 4,
    topic: ({ useCase }) => `Что проверить в рутине, если ${useCase}`,
    instruction: "Сформулируй хук через конкретную бытовую ситуацию и простую проверку, а не через покупку продукта."
  },
  {
    id: "mistake-fear",
    label: "страх неверных ожиданий",
    trigger: "боязнь купить пустышку или ждать от продукта не того эффекта",
    format: "mistake-solution",
    scoreBonus: 5,
    topic: ({ pain }) => `Какие ожидания стоит проверить, если ${pain}`,
    instruction: "Если используешь страх ошибки, называй саму проверку: ожидания, состав, формат, регулярность или красный флаг. Не пиши абстрактно про одну ошибку."
  },
  {
    id: "curiosity-gap",
    label: "незакрытый вопрос",
    trigger: "любопытство к причине знакомой ситуации",
    format: "scheme",
    scoreBonus: 4,
    topic: ({ pain }) => `Что может стоять за ситуацией: ${pain}`,
    instruction: "Оставь открытый вопрос, но внутри хука назови понятную ситуацию, чтобы заголовок был ясен без подписи."
  },
  {
    id: "money-trap",
    label: "страх переплатить",
    trigger: "страх купить красивую упаковку вместо понятной привычки",
    format: "comparison",
    scoreBonus: 4,
    topic: ({ proof }) => `Как отличить полезный факт от красивого обещания: ${proof}`,
    instruction: "Собери хук через контраст обещаний и проверяемой пользы, но не делай его рекламным сравнением брендов или покупкой продукта."
  }
];

export function buildTopicCandidates({ project, product, existingJobs = [], insightMap } = {}) {
  const profile = buildProductProfile({ project, product, insightMap });
  return [
    ...buildInsightCandidates(profile),
    ...hookStrategies.map((strategy) => buildStrategyCandidate(strategy, profile, { project, product }))
  ]
    .map((candidate) => scoreStrategyCandidate(candidate, profile, existingJobs))
    .sort((left, right) => right.score - left.score);
}

export function pickTopicCandidate({ project, product, existingJobs = [], insightMap } = {}) {
  return buildTopicCandidates({ project, product, existingJobs, insightMap })[0] || null;
}

export function createTopicCandidatePlan({ project, product, candidate }) {
  if (!candidate) return null;
  const profile = buildProductProfile({ project, product });
  const focus = getProductContentFocus({ project, product });
  const safeStep = focus.action || profile.safeClaims[0] || product.offer || focus.subject || product.name;
  const proof = candidate.proof || focus.fact || profile.primaryProof;
  const useCase = candidate.useCase || focus.subject || profile.primaryUseCase;
  const pain = candidate.pain || focus.pain || profile.primaryPain;
  const habit = candidate.habit || safeStep;

  const subheads = {
    "authority-break": "Сначала снимите шум и покажите, что реально можно проверить без веры блогерам.",
    "personal-result": "Человек должен сразу понять, что это даст именно ему в обычной жизни.",
    "mistake-fear": "Страх ошибки работает сильнее, когда проверка простая и конкретная.",
    "curiosity-gap": "Оставьте открытый вопрос, но закройте его полезной причиной, а не рекламой.",
    "money-trap": "Контраст красивого обещания и проверяемого факта помогает принять спокойное решение."
  };

  return {
    headline: "",
    subhead: candidate.subhead || subheads[candidate.angleId] || "Сначала поймите ситуацию, потом добавляйте продукт.",
    points: [
      `Почему цепляет: ${pain || useCase}`,
      `Миф: одного общего совета достаточно`,
      `Факт: ${proof || safeStep}`,
      `Рабочий шаг: ${habit}`,
      `Проверьте: контекст, источник и детали`
    ],
    disclaimer: "",
    hookPsychology: getHookStrategyInstruction(candidate)
  };
}

function buildInsightCandidates(profile) {
  const zones = profile.insightMap?.benefitZones || [];
  const scoreBonus = profile.insightMap?.id ? 7 : 2;
  return zones.flatMap((zone) => [
    {
      angleId: `insight-${zone.id}`,
      strategyId: "product-insight",
      strategyLabel: "карта пользы продукта",
      angleLabel: "боль и привычка",
      trigger: zone.pain,
      topic: `${zone.pain}: какой ритуал помогает рядом с ${profile.productName}`,
      hook: "",
      format: "checklist",
      scoreBonus,
      pain: zone.pain,
      habit: zone.habit,
      proof: zone.safeFact,
      useCase: zone.pain,
      subhead: "Покажите не чудо-продукт, а понятную связку боли, привычки и спокойного шага.",
      promptInstruction: "Построй контент как полезную карточку: узнаваемая боль -> смежная привычка -> безопасный факт о роли продукта."
    },
    {
      angleId: `habit-${zone.id}`,
      strategyId: "adjacent-habit",
      strategyLabel: "смежная полезная привычка",
      angleLabel: "лайфхак рядом с продуктом",
      trigger: zone.habit,
      topic: `Какая привычка усиливает ту же цель: ${zone.habit}`,
      hook: "",
      format: "scheme",
      scoreBonus: Math.max(1, scoreBonus - 1),
      pain: zone.pain,
      habit: zone.habit,
      proof: zone.safeFact,
      useCase: zone.habit,
      subhead: "Дайте зрителю полезный шаг, который решает ту же боль, что и продукт.",
      promptInstruction: "Не продавай продукт напрямую: объясни смежный лайфхак, а продукт оставь мягким элементом рутины."
    }
  ]);
}

function buildStrategyCandidate(strategy, profile, { project, product }) {
  const focus = getProductContentFocus({ project, product });
  const context = {
    subject: pickTopicSubject(profile, { project, product }),
    pain: focus.pain || profile.primaryPain,
    useCase: focus.subject || profile.primaryUseCase,
    proof: focus.fact || profile.primaryProof
  };
  return {
    angleId: strategy.id,
    strategyId: strategy.id,
    angleLabel: strategy.label,
    strategyLabel: strategy.label,
    trigger: strategy.trigger,
    topic: strategy.topic(context),
    hook: "",
    format: strategy.format,
    scoreBonus: strategy.scoreBonus,
    proof: context.proof,
    useCase: context.useCase,
    promptInstruction: strategy.instruction
  };
}

function pickTopicSubject(profile, { project, product } = {}) {
  const focus = getProductContentFocus({ project, product });
  return focus.subject
    || profile.primaryProof
    || profile.primaryUseCase
    || profile.description
    || profile.productName;
}

function getHookStrategyInstruction(candidate) {
  if (!candidate) return "";
  return [
    `Психологический угол: ${candidate.strategyLabel}.`,
    `Триггер ЦА: ${candidate.trigger}.`,
    `Правило формулировки: ${candidate.promptInstruction}`,
    candidate.habit ? `Смежная привычка: ${candidate.habit}.` : "",
    candidate.proof ? `Безопасный факт: ${candidate.proof}.` : "",
    "Финальный хук нужно сгенерировать под конкретный продукт, боль аудитории и факты анкеты; не брать готовую фразу из шаблона."
  ].filter(Boolean).join(" ");
}

function scoreStrategyCandidate(candidate, profile, existingJobs) {
  const source = normalizeTopicCandidateText(`${candidate.topic} ${candidate.trigger} ${candidate.promptInstruction}`);
  const used = new Set(existingJobs.map((job) => normalizeTopicCandidateText(`${job.topic || ""} ${job.title || ""}`)));
  const audienceMatchCount = profile.painMap.filter((item) => source.includes(normalizeToken(item))).length;
  const hasAudiencePain = audienceMatchCount > 0;
  const hasSafeProof = profile.proofPoints.some((item) => source.includes(normalizeToken(item)));
  const hasForbidden = profile.forbiddenClaims.some((item) => source.includes(normalizeToken(item)));
  const duplicatePenalty = used.has(normalizeTopicCandidateText(candidate.topic)) ? 5 : 0;
  const safetyPenalty = hasForbidden ? 7 : 0;
  const score = candidate.scoreBonus
    + (hasAudiencePain ? 3 + audienceMatchCount : 1)
    + (hasSafeProof ? 2 : 0)
    - duplicatePenalty
    - safetyPenalty;

  return {
    ...candidate,
    score,
    hasAudiencePain,
    hasSafeProof,
    safetyPenalty,
    duplicatePenalty
  };
}

function normalizeToken(value) {
  return normalizeTopicCandidateText(value).split(" ").find((word) => word.length > 4) || "";
}

function normalizeTopicCandidateText(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}
