import { createCreativeTeamPayload } from "../src/domain/creative-team-payload.js";
import { createCreativeTeamImagePromptPackage } from "./creative-team-prompts.mjs";

export async function completeCreativeTeamImagePrompt({ token, body, draft, model, callOpenRouter, parseJsonDraft }) {
  const normalizedBody = createCreativeTeamPayload(body);
  const imagePromptPackage = await createCreativeTeamImagePromptPackage({
    token,
    model,
    callOpenRouter,
    parseJsonDraft,
    body: normalizedBody,
    productPassport: { productPassport: draft.productPassport || {} },
    creativeBrief: { creativeBrief: draft.creativeBrief || {} },
    contentScript: draft.contentScript || draft.plan || {},
    visualBrief: { visualBrief: draft.visualBrief || {} },
    safetyReview: draft.safetyReview || draft.qaReview || {},
    designFormatBrief: { designFormatBrief: draft.designFormatBrief || {} }
  });
  const finalPackage = imagePromptPackage.imagePromptPackage || imagePromptPackage;
  return {
    ...draft,
    imagePromptPackage: finalPackage,
    imagePromptContract: finalPackage.promptContract || finalPackage.contract || null
  };
}
