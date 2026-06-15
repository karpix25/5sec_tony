export function createAvatarCandidate(project, payload) {
  const name = payload.name || "Новый аватар";
  const prompt = payload.prompt || "стабильный персонаж проекта, хромакей зеленый фон";
  const id = createAvatarId("avatar-candidate");
  const finalPrompt = buildAvatarPrompt(project, { name, prompt });

  return {
    id,
    taskId: "",
    provider: "kie.ai",
    status: "submitting",
    name,
    prompt,
    finalPrompt,
    imageData: "",
    imageUrl: "",
    failMsg: "",
    createdAt: new Date().toISOString()
  };
}

export function attachAvatarTask(candidate, taskId) {
  return { ...candidate, taskId, status: "waiting" };
}

export function updateAvatarCandidate(candidate, status) {
  if (["success", "succeeded", "completed", "complete"].includes(status.state) && status.imageUrl) {
    return {
      ...candidate,
      status: "review",
      imageUrl: status.imageUrl,
      imageData: status.imageUrl,
      failMsg: ""
    };
  }

  if (status.state === "fail") {
    return { ...candidate, status: "failed", failMsg: status.failMsg || "Kie.ai generation failed" };
  }

  return { ...candidate, status: normalizeKieState(status.state) || candidate.status };
}

export function approveAvatarCandidate(projectId, candidate) {
  return {
    id: createAvatarId("char"),
    name: candidate.name,
    status: "approved",
    prompt: candidate.prompt,
    imageData: candidate.imageUrl || candidate.imageData,
    provider: candidate.provider,
    taskId: candidate.taskId,
    s3Key: buildAvatarS3Key(projectId, candidate.id),
    createdAt: candidate.createdAt,
    approvedAt: new Date().toISOString()
  };
}

function buildAvatarPrompt(project, { name, prompt }) {
  return [
    "Kie.ai avatar generation request.",
    "Create a vertical 9:16 photorealistic portrait that looks like a real camera photograph.",
    "The avatar must be on a pure solid chroma key green background (#00FF00), evenly lit, with no gradients, no shadows, no objects, no text and no scenery.",
    "Use natural skin texture, realistic eyes, real hair detail, believable facial anatomy, photographic lighting, DSLR portrait quality, shallow depth of field.",
    "Avoid illustration, cartoon, CGI, 3D render, anime, plastic skin, beauty filter, over-smoothed face, painterly style, graphic design, text, watermark, logo.",
    `Project: ${project.name}.`,
    `Project context: ${project.projectTheme || project.companyInfo || project.name}.`,
    `Avatar name: ${name}.`,
    `User prompt: ${prompt}.`,
    "Generate one consistent character image for later GPT Image 2 infographic references.",
    "Chroma key green background, stable facial features, centered upper-body portrait, production-ready reference photo."
  ].join(" ");
}

function buildAvatarS3Key(projectId, candidateId) {
  return `s3://anton-5-sec/projects/${projectId}/avatars/${candidateId}.svg`;
}

function normalizeKieState(state) {
  if (["waiting", "queue", "queued"].includes(state)) return "waiting";
  if (["generating", "running", "processing"].includes(state)) return "generating";
  return state;
}

function createAvatarId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
