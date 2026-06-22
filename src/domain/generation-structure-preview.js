import { createContentCardPlan } from "./content-card-plan.js";
import { createGenerationStrategy } from "./generation-strategy.js";
import { buildImageRenderPrompt } from "./image-render-prompt.js";

export function createGenerationStructurePreview(input) {
  const strategy = createGenerationStrategy(input);
  const card = createContentCardPlan(strategy);
  const imagePrompt = buildImageRenderPrompt({ strategy, card, reference: input.reference });
  return {
    id: `preview-${Date.now()}`,
    createdAt: new Date().toISOString(),
    projectId: strategy.projectId,
    productId: strategy.productId,
    projectName: strategy.projectName,
    productName: strategy.productName,
    strategy,
    card,
    imagePrompt
  };
}
