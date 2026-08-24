import { normalizeHumanizedLine, normalizeHumanizedPlan } from "../src/domain/text-humanizer.js";
import { getVisibleTextContractViolations } from "../src/domain/design-text-contract.js";
import { humanizeTextInstruction } from "./creative-team-prompts.mjs";

export async function humanizeCreativeTeamDraft({ token, body = {}, draft = {}, model, callOpenRouter, parseJsonDraft }) {
  let currentDraft = draft;
  let basePlan = getDraftPlan(currentDraft);
  if (!basePlan.headline && !basePlan.points.length) return currentDraft;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await callOpenRouter(token, model, [
        { role: "system", content: "Ты редактор массовых Reels-инфографик. Пиши по-русски, просто, живо и безопасно. Верни только JSON без markdown." },
        { role: "user", content: humanizeTextInstruction({ ...body, plan: basePlan, brief: currentDraft }) }
      ]);
      const parsed = parseJsonDraft(content);
      const plan = normalizeHumanizedPlan(parsed, basePlan);
      currentDraft = withHumanizedPlan(currentDraft, plan, parsed.attentionReview);
      const violations = getVisibleTextContractViolations({ contentScript: plan });
      if (!violations.length) return currentDraft;
      body = { ...body, headlineViolations: violations };
      basePlan = plan;
    } catch (error) {
      console.warn(`[creative-team:humanizer:fallback] ${error.message || error}`);
      return withHumanizedPlan(currentDraft, normalizeHumanizedPlan(basePlan, basePlan));
    }
  }
  return currentDraft;
}

function withHumanizedPlan(draft, plan, attentionReview = draft.attentionReview || null) {
  return {
    ...draft,
    contentScript: plan,
    plan,
    aiPlan: plan,
    hook: normalizeHumanizedLine(draft.hook || draft.recommendedHook) || plan.headline,
    topic: normalizeHumanizedLine(draft.topic || draft.creativeBrief?.topic) || plan.headline,
    attentionReview
  };
}

function getDraftPlan(draft = {}) {
  const source = draft.contentScript || draft.plan || draft.aiPlan || {};
  return {
    headline: source.headline || draft.hook || draft.recommendedHook || "",
    subhead: source.subhead || "",
    points: Array.isArray(source.points) ? source.points : [],
    cta: source.cta || "",
    disclaimer: source.disclaimer || ""
  };
}
