import { buildProductProfile } from "./product-profile.js";

const genericAngles = [
  {
    id: "daily-mistake",
    label: "ошибка в рутине",
    topic: ({ pain }) => `Какая мелочь в рутине делает "${pain}" сильнее`,
    hook: ({ pain }) => `Если "${pain}", проблема может быть в одной привычке, которую вы не замечаете`,
    format: "mistake-solution",
    scoreBonus: 3
  },
  {
    id: "wasted-money",
    label: "деньги впустую",
    topic: ({ productName, pain }) => `Почему ${productName} покупают ради результата, а разочарование все равно приходит через "${pain}"`,
    hook: ({ productName }) => `Можно купить еще один ${productName.toLowerCase()} и все равно не понять, что ломает результат`,
    format: "comparison",
    scoreBonus: 3
  },
  {
    id: "trend-reality",
    label: "тренд и реальность",
    topic: ({ productName }) => `Почему ${productName} стал таким шумным трендом и где в нем реальная польза без лишнего хайпа`,
    hook: ({ productName }) => `Почему ${productName} обсуждают все, а нормально объясняют единицы`,
    format: "comparison",
    scoreBonus: 4
  },
  {
    id: "before-you-buy",
    label: "проверь до покупки",
    topic: ({ productName, useCase }) => `Что проверить до покупки ${productName}, если вам важен сценарий "${useCase}"`,
    hook: ({ productName }) => `Не покупайте ${productName.toLowerCase()} на эмоциях, пока не проверили одну вещь`,
    format: "checklist",
    scoreBonus: 3
  },
  {
    id: "hidden-cause",
    label: "скрытая причина",
    topic: ({ pain }) => `Почему "${pain}" может быть связано не с самим продуктом, а с рутиной вокруг него`,
    hook: ({ pain }) => `Если "${pain}", причина может быть не там, где вы ее обычно ищете`,
    format: "scheme",
    scoreBonus: 2
  },
  {
    id: "myth-breaker",
    label: "миф и правда",
    topic: ({ productName }) => `Какой миф о ${productName} мешает понять, что в нем реально важно`,
    hook: ({ productName }) => `О ${productName} часто говорят так, будто он решает все. Из-за этого люди ждут не того`,
    format: "comparison",
    scoreBonus: 3
  },
  {
    id: "ritual-fix",
    label: "полезный ритуал",
    topic: ({ useCase }) => `Как сделать сценарий "${useCase}" проще и не бросить через три дня`,
    hook: () => "Почему healthy-ритуал часто разваливается уже на третий день",
    format: "checklist",
    scoreBonus: 4
  },
  {
    id: "honest-explainer",
    label: "честный разбор",
    topic: ({ productName }) => `Честно о ${productName}: что в нем выглядит сильнее маркетинга, а что реально можно использовать`,
    hook: ({ productName }) => `${productName}: реально удобная привычка или просто красивый wellness-хайп?`,
    format: "scheme",
    scoreBonus: 4
  }
];

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}

function buildCandidateFromAngle(angle, profile) {
  const pain = profile.primaryPain;
  const useCase = profile.primaryUseCase;
  const proof = profile.primaryProof;
  return {
    angleId: angle.id,
    angleLabel: angle.label,
    topic: angle.topic({ productName: profile.productName, pain, useCase, proof }),
    hook: angle.hook({ productName: profile.productName, pain, useCase, proof }),
    format: angle.format,
    scoreBonus: angle.scoreBonus,
    proof,
    useCase
  };
}

function scoreCandidate(candidate, profile, existingJobs = []) {
  const used = new Set(existingJobs.map((job) => normalize(`${job.topic || ""} ${job.title || ""}`)));
  const source = normalize(`${candidate.topic} ${candidate.hook}`);
  const relatability = /(почему|как|что|ошиб|не покуп|трат|не замеч)/.test(source) ? 3 : 1;
  const specificity = candidate.useCase && candidate.useCase.length > 10 ? 3 : 1;
  const shareability = /(провер|правд|ошиб|не замеч|не покуп|шум|миф)/.test(source) ? 3 : 1;
  const productLink = profile.productName && source.includes(normalize(profile.productName).split(" ")[0]) ? 2 : 1;
  const safetyPenalty = profile.forbiddenClaims.some((item) => {
    const token = normalize(item).split(" ").find((word) => word.length > 4);
    return token ? source.includes(token) : false;
  }) ? 4 : 0;
  const duplicatePenalty = used.has(source) ? 3 : 0;
  const score = relatability + specificity + shareability + productLink + candidate.scoreBonus - safetyPenalty - duplicatePenalty;
  return {
    ...candidate,
    score,
    relatability,
    specificity,
    shareability,
    productLink,
    safetyPenalty,
    duplicatePenalty
  };
}

export function buildTopicCandidates({ project, product, existingJobs = [] }) {
  const profile = buildProductProfile({ project, product });
  return genericAngles
    .map((angle) => buildCandidateFromAngle(angle, profile))
    .map((candidate) => scoreCandidate(candidate, profile, existingJobs))
    .sort((left, right) => right.score - left.score);
}

export function pickTopicCandidate({ project, product, existingJobs = [] }) {
  return buildTopicCandidates({ project, product, existingJobs })[0] || null;
}

export function createTopicCandidatePlan({ project, product, candidate }) {
  if (!candidate) return null;
  const profile = buildProductProfile({ project, product });
  const safeStep = profile.safeClaims[0] || product.offer || product.name;
  const proof = candidate.proof || profile.primaryProof;
  const useCase = candidate.useCase || profile.primaryUseCase;
  const pain = profile.primaryPain;

  const subheads = {
    "trend-reality": "Тренд сам по себе не помогает. Полезно понять, где здесь реальный смысл, а где просто шум.",
    "before-you-buy": "Сначала разберитесь со сценарием и привычкой, а потом решайте, нужен ли вам сам продукт.",
    "myth-breaker": "Самая частая ошибка не в выборе банки, а в ожиданиях от нее.",
    "daily-mistake": "Проблема часто усиливается не из-за отсутствия продукта, а из-за повторяющейся мелочи в рутине.",
    "honest-explainer": "Полезнее разложить продукт на бытовой сценарий, чем ждать от него магического эффекта.",
    "wasted-money": "Люди часто покупают продукт раньше, чем понимают, какая привычка вообще ломает результат.",
    "hidden-cause": "Снаружи кажется, что дело в продукте, но триггер может прятаться в обычном дне.",
    "ritual-fix": "Сильнее всего работают не громкие обещания, а ритуалы, которые реально удерживаются в жизни."
  };

  return {
    headline: candidate.hook,
    subhead: subheads[candidate.angleId] || "Сначала поймите ситуацию, потом добавляйте продукт.",
    points: [
      `Ситуация: ${useCase}`,
      `Что часто ломает эффект: ${pain}`,
      `Что можно взять в рутину: ${proof || safeStep}`
    ],
    disclaimer: ""
  };
}
