const hookFormulas = [
  {
    id: "authority-break",
    label: "разрушение авторитета",
    trigger: "усталость от идеальных советов и желание честного разбора",
    format: "comparison",
    scoreBonus: 5,
    topic: ({ productName, proof }) => `Почему вокруг "${productName}" много шума и что в нем реально проверить`,
    hook: ({ productName }) => `Честно о ${productName}: где польза, а где дорогой маркетинг`
  },
  {
    id: "personal-result",
    label: "личная выгода",
    trigger: "желание быстро понять, что это даст лично мне",
    format: "checklist",
    scoreBonus: 4,
    topic: ({ useCase, proof }) => `Что может измениться в рутине, если сначала проверить "${useCase}"`,
    hook: ({ useCase }) => `Если "${useCase}", начните не с покупки, а с этой проверки`
  },
  {
    id: "mistake-fear",
    label: "страх ошибки",
    trigger: "боязнь купить пустышку или сделать хуже",
    format: "mistake-solution",
    scoreBonus: 5,
    topic: ({ productName, pain }) => `Главная ошибка перед покупкой: ${productName}, если у вас "${pain}"`,
    hook: ({ productName }) => `Не покупайте ${productName.toLowerCase()}, пока не проверили одну ошибку`
  },
  {
    id: "curiosity-gap",
    label: "интрига",
    trigger: "незакрытый вопрос, который хочется досмотреть",
    format: "scheme",
    scoreBonus: 4,
    topic: ({ pain }) => `Что на самом деле может стоять за ситуацией "${pain}"`,
    hook: ({ pain }) => `Что происходит с рутиной, если "${pain}" повторяется снова`
  },
  {
    id: "money-trap",
    label: "деньги и пустышка",
    trigger: "страх переплатить и попасться на красивую упаковку",
    format: "comparison",
    scoreBonus: 4,
    topic: ({ productName, proof }) => `Как не переплатить за ${productName}, если важен факт "${proof}"`,
    hook: ({ productName }) => `${productName}: полезная привычка или просто красивая пустышка?`
  }
];

const copyDevices = [
  { id: "contrast", label: "контраст", score: 2, pattern: /дорог|дешев|польз|маркетинг|пустыш/ },
  { id: "simple-check", label: "простая проверка", score: 2, pattern: /проверк|пока|сначала|одну/ },
  { id: "open-loop", label: "незакрытая петля", score: 2, pattern: /что происходит|почему|на самом деле/ },
  { id: "specific-pain", label: "узнаваемая боль", score: 2, pattern: /если|когда|повторяется|беспокоит/ }
];

export function buildPsychologyHookCandidates(profile, existingJobs = []) {
  return hookFormulas
    .map((formula) => buildFormulaCandidate(formula, profile))
    .map((candidate) => scorePsychologyCandidate(candidate, profile, existingJobs))
    .sort((left, right) => right.score - left.score);
}

export function getHookPsychologyInstruction(candidate) {
  if (!candidate) return "";
  return [
    `Психология хука: ${candidate.formulaLabel}.`,
    `Триггер ЦА: ${candidate.trigger}.`,
    `Копирайтерская огранка: ${candidate.copyDevice}.`,
    "Хук должен цеплять страх ошибки, желание выгоды или curiosity gap, но не добавлять claims сверх анкеты продукта."
  ].join(" ");
}

function buildFormulaCandidate(formula, profile) {
  const context = {
    productName: profile.productName,
    pain: profile.primaryPain,
    useCase: profile.primaryUseCase,
    proof: profile.primaryProof
  };
  const hook = formula.hook(context);
  return {
    angleId: formula.id,
    formulaId: formula.id,
    angleLabel: formula.label,
    formulaLabel: formula.label,
    trigger: formula.trigger,
    topic: formula.topic(context),
    hook,
    format: formula.format,
    scoreBonus: formula.scoreBonus,
    proof: context.proof,
    useCase: context.useCase,
    copyDevice: pickCopyDevice(hook).label
  };
}

function scorePsychologyCandidate(candidate, profile, existingJobs) {
  const source = normalizeHookPsychologyText(`${candidate.topic} ${candidate.hook}`);
  const used = new Set(existingJobs.map((job) => normalizeHookPsychologyText(`${job.topic || ""} ${job.title || ""}`)));
  const copyScore = copyDevices
    .filter((device) => device.pattern.test(source))
    .reduce((sum, device) => sum + device.score, 0);
  const hasAudiencePain = profile.painMap.some((item) => source.includes(normalizeToken(item)));
  const hasSafeProof = profile.proofPoints.some((item) => source.includes(normalizeToken(item)));
  const hasForbidden = profile.forbiddenClaims.some((item) => source.includes(normalizeToken(item)));
  const duplicatePenalty = used.has(source) ? 5 : 0;
  const safetyPenalty = hasForbidden ? 7 : 0;
  const score = candidate.scoreBonus
    + copyScore
    + (hasAudiencePain ? 3 : 1)
    + (hasSafeProof ? 2 : 0)
    - duplicatePenalty
    - safetyPenalty;

  return {
    ...candidate,
    score,
    copyScore,
    hasAudiencePain,
    hasSafeProof,
    safetyPenalty,
    duplicatePenalty
  };
}

function pickCopyDevice(hook) {
  const source = normalizeHookPsychologyText(hook);
  return copyDevices.find((device) => device.pattern.test(source)) || copyDevices[0];
}

function normalizeToken(value) {
  return normalizeHookPsychologyText(value).split(" ").find((word) => word.length > 4) || "";
}

function normalizeHookPsychologyText(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}
