export function createPaymentPlan({ product, brief }) {
  const plan = brief.aiPlan?.points?.length
    ? {
      headline: brief.finalContent?.headline || brief.aiPlan.headline || brief.hook,
      subhead: brief.finalContent?.subhead || brief.aiPlan.subhead || brief.topic,
      points: brief.aiPlan.points,
      disclaimer: brief.finalContent?.disclaimer || brief.aiPlan.disclaimer || ""
    }
    : createProductFallbackPlan({ product, brief });
  return formatPaymentPlan({ product, brief, plan });
}

export function getScenarioVisualInstruction(brief) {
  if (!brief?.semanticKey && !brief?.topic && !brief?.visualObject) return "";
  return [
    "Сценарий и визуальную метафору выводи из AI-брифа, продукта и активного дизайн-референса.",
    "Не используй готовые платежные темы из кода; если данных мало, покажи понятную ситуацию, проверку и следующий шаг из анкеты продукта."
  ].join(" ");
}

function createProductFallbackPlan({ product, brief }) {
  const points = uniqueText([
    brief.productFact,
    brief.scrollStopperAngle,
    firstItem(product.pains),
    product.components,
    product.offer,
    product.description
  ]);
  return {
    headline: brief.hook || brief.topic || product.name,
    subhead: brief.topic || brief.scrollStopperAngle || product.description || product.offer || product.name,
    points: points.length ? points : [product.offer, product.description, product.name].filter(Boolean),
    disclaimer: ""
  };
}

function formatPaymentPlan({ product, brief, plan }) {
  return {
    headline: plan.headline || brief.hook || product.name,
    subhead: plan.subhead || brief.topic || product.description || "",
    points: (plan.points || []).slice(0, Number(brief.pointCount) || 5),
    cta: brief.cta || product.name,
    disclaimer: plan.disclaimer || ""
  };
}

function firstItem(value) {
  return Array.isArray(value) ? value[0] : String(value || "").split(/\n|;/)[0];
}

function uniqueText(items) {
  const seen = new Set();
  return items.map((item) => String(item || "").trim()).filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
