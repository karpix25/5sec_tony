import { buildProductProfile } from "./product-profile.js";
import { buildPsychologyHookCandidates, getHookPsychologyInstruction } from "./hook-psychology.js";

export function buildTopicCandidates({ project, product, existingJobs = [] }) {
  const profile = buildProductProfile({ project, product });
  return buildPsychologyHookCandidates(profile, existingJobs);
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
    "authority-break": "Сначала снимите шум и покажите, что реально можно проверить без веры блогерам.",
    "personal-result": "Человек должен сразу понять, что это даст именно ему в обычной жизни.",
    "mistake-fear": "Страх ошибки работает сильнее, когда проверка простая и конкретная.",
    "curiosity-gap": "Оставьте открытый вопрос, но закройте его полезной причиной, а не рекламой.",
    "money-trap": "Контраст цены и пользы помогает не купить красивую пустышку."
  };

  return {
    headline: candidate.hook,
    subhead: subheads[candidate.angleId] || "Сначала поймите ситуацию, потом добавляйте продукт.",
    points: [
      `Ситуация: ${useCase}`,
      `Что часто ломает эффект: ${pain}`,
      `Что можно взять в рутину: ${proof || safeStep}`
    ],
    disclaimer: "",
    hookPsychology: getHookPsychologyInstruction(candidate)
  };
}
