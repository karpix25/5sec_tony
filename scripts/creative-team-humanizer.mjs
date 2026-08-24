import { normalizeHumanizedLine, normalizeHumanizedPlan } from "../src/domain/text-humanizer.js";
import { humanizeTextInstruction } from "./creative-team-prompts.mjs";

export async function humanizeCreativeTeamDraft({ token, body = {}, draft = {}, model, callOpenRouter, parseJsonDraft }) {
  const basePlan = getDraftPlan(draft);
  if (!basePlan.headline && !basePlan.points.length) return draft;
  try {
    const content = await callOpenRouter(token, model, [
      { role: "system", content: "Ты редактор массовых Reels-инфографик. Пиши по-русски, просто, живо и безопасно. Верни только JSON без markdown." },
      { role: "user", content: humanizeTextInstruction({ ...body, plan: basePlan, brief: draft }) }
    ]);
    const parsed = parseJsonDraft(content);
    return withHumanizedPlan(draft, normalizeHumanizedPlan(parsed, basePlan), parsed.attentionReview);
  } catch (error) {
    console.warn(`[creative-team:humanizer:fallback] ${error.message || error}`);
    return withHumanizedPlan(draft, normalizeHumanizedPlan(basePlan, basePlan));
  }
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
