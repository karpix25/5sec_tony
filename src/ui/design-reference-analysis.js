import { escapeHtml } from "./infographic.js";

export function renderDesignReferenceAnalysis(reference = {}) {
  const analysis = reference.designAnalysis || {};
  const grammar = analysis.visualGrammar || {};
  return `
    <div class="reference-analysis">
      <strong>${escapeHtml(analysis.structureName || analysis.formatType || "Анализ дизайна не рассчитан")}</strong>
      <small>${escapeHtml(grammar.composition || reference.takeaways || "Нажмите анализ, чтобы сохранить visual grammar референса.")}</small>
      <small>${escapeHtml(grammar.typography || "")}</small>
    </div>
  `;
}
