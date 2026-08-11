import { isHeadlineLocked, resolveHeadlineFormula } from "./headline-diversity.js";
import { writeHookFromFormula } from "./hook-formula-writer.js";

export function normalizeAiHeadlineContent({ content = {}, generationBrief = {}, existingJobs = [], project = {}, product = {} } = {}) {
  if (!content?.headline) return content;
  const diversity = resolveHeadlineFormula({
    headline: content.headline,
    existingJobs,
    recentFormulas: generationBrief.recentFormulas || generationBrief.recentHeadlineFormulas,
    locked: isHeadlineLocked({ ...generationBrief, ...content })
  });
  if (!diversity.changed) return content;

  return {
    ...content,
    headline: writeHookFromFormula(content.headline, {
      subject: product.offer || product.name || project.projectTheme,
      object: product.name || project.projectTheme,
      problem: project.audiencePains || product.pains?.[0] || product.name,
      result: product.offer || project.audienceDesires || product.name,
      count: "5",
      formula: diversity.formula,
      existingJobs,
      recentFormulas: diversity.history,
      variantSeed: `${project.id || ""} ${product.id || ""} ${diversity.formula}`
    })
  };
}
