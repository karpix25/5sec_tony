export function renderInfographicPreview({ project, product, reference, generationBrief }) {
  const accent = project.id === "beauty" ? "rose" : project.id === "ppm" ? "mint" : "blue";
  const pain = product.pains[0] || "ключевая боль";
  const fact = product.facts[0] || "проверенный факт";
  const title = generationBrief?.hook || generationBrief?.topic || pain;
  const object = generationBrief?.visualObject || reference?.visualObject || product.name;

  return `
    <div class="phone-preview ${accent}" aria-label="Предпросмотр инфографики">
      <div class="preview-top">
        <span>${project.name}</span>
        <strong>5 sec</strong>
      </div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(object)}</p>
      <div class="proof-row">
        <span>стиль: ${escapeHtml(reference?.title || "референс проекта")}</span>
      </div>
      <div class="preview-ref">${escapeHtml(fact)}</div>
    </div>
  `;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
