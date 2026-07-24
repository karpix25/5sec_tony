export function createPromptContract({ brief = {}, reference = {}, inputReferences = [], avatarSafeZone = null } = {}) {
  const content = brief.contentScript || brief.finalContent || brief.aiPlan || {};
  const design = brief.designFormatBrief || reference.designAnalysis || {};
  const productDecision = brief.productVisibilityDecision || {};
  return {
    version: "image-prompt-contract-v1",
    locale: "ru-RU",
    canvas: { aspectRatio: "9:16", format: "vertical social infographic" },
    designReference: compact({
      title: reference.title || "",
      formatType: design.formatType || reference.layoutType || "",
      structureName: design.structureName || "",
      visualGrammar: design.visualGrammar || {},
      adaptationRules: design.adaptationRules || [],
      doNotCopy: design.doNotCopy || reference.avoidCopy || []
    }),
    referencePriority: {
      design: "primary_style_and_layout_source",
      product: "exact_product_appearance_source",
      safe_zone: "placement_mask_only_last_reference"
    },
    productVisibilityDecision: compact(productDecision),
    avatarSafeZone: avatarSafeZone || null,
    textContract: compact({
      headline: content.headline || brief.hook || "",
      subhead: content.subhead || "",
      points: Array.isArray(content.points) ? content.points : [],
      cta: "",
      disclaimer: ""
    }),
    visualContract: compact({
      mainVisualObject: brief.visualBrief?.mainVisualObject || brief.visualObject || "",
      composition: brief.visualBrief?.composition || design.visualGrammar?.composition || "",
      productUsage: productDecision.productVisualMode || brief.productVisualMode || ""
    }),
    forbidden: [
      "no CTA in generated image",
      "no copied reference CTA, footer, disclaimer, logo, person, or foreign product",
      "no invented claims, guarantees, diagnosis, treatment, financial or legal promises",
      "do not draw avatar; avatar is overlaid later"
    ],
    inputRefs: inputReferences.map(({ role, title, isLocalData }) => ({ role, title, isLocalData: Boolean(isLocalData) }))
  };
}

export function stringifyPromptContract(contract = {}) {
  return JSON.stringify(contract, null, 2);
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (Array.isArray(item)) return item.length;
    if (item && typeof item === "object") return Object.keys(item).length;
    return item !== undefined && item !== null && item !== "";
  }));
}
