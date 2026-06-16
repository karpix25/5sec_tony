const DESIGN_REFERENCE_CANDIDATE_SUCCESS_STATES = ["success", "succeeded", "completed", "complete"];
const DESIGN_REFERENCE_CANDIDATE_RUNNING_STATES = ["generating", "running", "processing"];
const DESIGN_REFERENCE_CANDIDATE_WAITING_STATES = ["waiting", "queue", "queued"];

export function createDesignReferenceCandidate(project, payload = {}) {
  const title = normalizeDesignReferenceCandidateText(payload.title, "Новый дизайн-шаблон");
  const prompt = normalizeDesignReferenceCandidateText(payload.prompt, payload.takeaways || "вертикальный Reels шаблон для инфографики");
  const candidate = {
    id: createDesignReferenceCandidateId("design-ref-candidate"),
    taskId: "",
    provider: "gpt-image-2",
    status: "submitting",
    title,
    prompt,
    finalPrompt: buildDesignReferenceCandidatePrompt(project, { ...payload, title, prompt }),
    imageUrl: "",
    imageData: "",
    failMsg: "",
    progress: 0,
    layoutType: payload.layoutType || "infographic-template",
    palette: payload.palette || "",
    fontStyle: payload.fontStyle || payload.headlineStyle || "",
    headlineStyle: payload.headlineStyle || "",
    textDensity: payload.textDensity || "medium",
    visualObject: payload.visualObject || "",
    takeaways: payload.takeaways || prompt,
    avoidCopy: payload.avoidCopy || "Не копировать текст, смысл, чужой продукт, логотипы, персонажа или обещания.",
    createdAt: new Date().toISOString()
  };

  return {
    ...candidate,
    requestPayload: buildDesignReferenceCandidateImagePayload(candidate)
  };
}

export function buildDesignReferenceCandidateImagePayload(candidate) {
  return {
    prompt: candidate.finalPrompt,
    inputUrls: [],
    inputRefs: [],
    provider: "gpt-image-2",
    aspectRatio: "9:16",
    resolution: "1K",
    outputFormat: "png"
  };
}

export function attachDesignReferenceCandidateTask(candidate, taskId) {
  return {
    ...candidate,
    taskId,
    status: "waiting"
  };
}

export function updateDesignReferenceCandidate(candidate, status = {}) {
  if (DESIGN_REFERENCE_CANDIDATE_SUCCESS_STATES.includes(status.state) && status.imageUrl) {
    return {
      ...candidate,
      status: "review",
      imageUrl: status.imageUrl,
      imageData: status.imageUrl,
      progress: 100,
      failMsg: ""
    };
  }

  if (["fail", "failed", "error"].includes(status.state)) {
    return {
      ...candidate,
      status: "failed",
      progress: normalizeDesignReferenceCandidateProgress(status.progress, candidate.progress),
      failMsg: status.failMsg || "GPT Image 2 design reference generation failed"
    };
  }

  return {
    ...candidate,
    status: normalizeDesignReferenceCandidateState(status.state) || candidate.status,
    progress: normalizeDesignReferenceCandidateProgress(status.progress, candidate.progress)
  };
}

export function approveDesignReferenceCandidate(candidate) {
  return {
    id: createDesignReferenceCandidateId("ref"),
    type: "design",
    title: candidate.title,
    promptComment: candidate.prompt,
    takeaways: candidate.takeaways || candidate.prompt,
    avoidCopy: candidate.avoidCopy || "Не копировать текст, смысл, чужой продукт, логотипы, персонажа или обещания.",
    layoutType: candidate.layoutType || "infographic-template",
    palette: candidate.palette || "",
    fontStyle: candidate.fontStyle || candidate.headlineStyle || "",
    headlineStyle: candidate.headlineStyle || "",
    avatarPlacement: "",
    textDensity: candidate.textDensity || "medium",
    visualObject: candidate.visualObject || "",
    imageName: candidate.imageName || `${candidate.title}.png`,
    imageData: candidate.imageUrl || candidate.imageData,
    provider: candidate.provider || "gpt-image-2",
    taskId: candidate.taskId || "",
    generatedFromCandidateId: candidate.id,
    createdAt: candidate.createdAt,
    approvedAt: new Date().toISOString()
  };
}

export function buildDesignReferenceCandidatePrompt(project = {}, payload = {}) {
  const title = normalizeDesignReferenceCandidateText(payload.title, "Новый дизайн-шаблон");
  const prompt = normalizeDesignReferenceCandidateText(payload.prompt, payload.takeaways || "вертикальный Reels шаблон");
  const fontStyle = payload.fontStyle || payload.headlineStyle || "крупная контрастная типографика, хорошо читаемая с телефона";

  return [
    "GPT Image 2: create a vertical 9:16 design reference template for future short-video infographic images.",
    "This is a style template only, not a finished ad and not final content.",
    "Use 1024x1792 composition logic: important content inside x=72..820 and y=190..1360.",
    "Leave the bottom 24% clean or low-detail because an avatar/video overlay may be added later.",
    "Use short Russian placeholder text only; do not use finished ad copy.",
    "Do not show product packaging, avatar, person, face, hands, brand logo, product label, watermark, QR code, CTA button or social media UI.",
    "Do not copy any real competitor text, claim, product, logo or promise.",
    "Visible text may only be short neutral Russian placeholders that show hierarchy, such as Заголовок, Пункт 1, Пункт 2.",
    "Keep placeholder text large, clean and legible; no lorem ipsum, no English UI text, no tiny paragraphs.",
    "Create a reusable infographic layout: clear hook area, supporting blocks, visual-object zone, rhythm, spacing, palette and typography.",
    `Template title: ${title}.`,
    `Project: ${project.name || "project"}.`,
    project.projectTheme ? `Project theme: ${project.projectTheme}.` : "",
    project.niche ? `Niche: ${project.niche}.` : "",
    project.companyInfo ? `Company context: ${project.companyInfo}.` : "",
    project.companyAudience ? `Audience: ${project.companyAudience}.` : "",
    `Style instruction: ${prompt}.`,
    payload.layoutType ? `Layout type: ${payload.layoutType}.` : "",
    payload.palette ? `Palette: ${payload.palette}.` : "",
    `Typography: ${fontStyle}.`,
    payload.textDensity ? `Text density: ${payload.textDensity}.` : "Text density: medium, readable, not cluttered.",
    payload.visualObject ? `Visual object zone should support: ${payload.visualObject}.` : "Visual object zone: abstract 3D object or icon cluster, not a real product.",
    "Output one polished PNG-style reference image. It must be suitable to approve/reject as a reusable design reference."
  ].filter(Boolean).join(" ");
}

function normalizeDesignReferenceCandidateState(state) {
  if (DESIGN_REFERENCE_CANDIDATE_WAITING_STATES.includes(state)) return "waiting";
  if (DESIGN_REFERENCE_CANDIDATE_RUNNING_STATES.includes(state)) return "generating";
  return state;
}

function normalizeDesignReferenceCandidateProgress(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback || 0;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function normalizeDesignReferenceCandidateText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function createDesignReferenceCandidateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
