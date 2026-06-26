import { escapeHtml } from "./infographic.js";

export function renderJobAiTrace(job = {}) {
  const trace = job.aiTrace || {};
  if (!trace.version && !job.promptContract && !job.productVisibilityDecision) return "";
  const contract = trace.imagePromptContract || job.promptContract || job.imagePromptContract || {};
  return `
    <details class="job-ai-trace">
      <summary>AI trace</summary>
      <dl>
        <div><dt>Hook seed</dt><dd>${escapeHtml(trace.hookSeed || job.hookSeed || "не указан")}</dd></div>
        <div><dt>Angle</dt><dd>${escapeHtml(trace.selectedAngle || job.creativeBrief?.topic || job.topic || "")}</dd></div>
        <div><dt>Product</dt><dd>${escapeHtml(formatProductDecision(job.productVisibilityDecision || contract.productVisibilityDecision))}</dd></div>
        <div><dt>Refs</dt><dd>${escapeHtml((job.inputRefs || []).map((item) => item.role).join(", ") || "нет")}</dd></div>
      </dl>
      <pre>${escapeHtml(JSON.stringify(contract, null, 2).slice(0, 2500))}</pre>
    </details>
  `;
}

function formatProductDecision(decision = {}) {
  if (decision.shouldPassProductRefs) return "product refs sent";
  if (decision.productVisualMode || decision.mode) return decision.reason || decision.productVisualMode || decision.mode;
  return "not recorded";
}
