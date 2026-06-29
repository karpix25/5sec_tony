export function statesEqual(left, right) {
  return stableStringify(canonicalizeState(left)) === stableStringify(canonicalizeState(right));
}

export function getStateDifference(left, right) {
  return findDifference(canonicalizeState(left), canonicalizeState(right));
}

function stableStringify(value) {
  return JSON.stringify(sortForCompare(value));
}

function canonicalizeState(value) {
  if (!isPlainObject(value)) return value;
  return {
    ...value,
    projects: asArray(value.projects).map(canonicalProject),
    products: asArray(value.products).map(canonicalProduct),
    jobs: asArray(value.jobs).map(canonicalJob),
    audioLibrary: asArray(value.audioLibrary).map(canonicalAudio),
    hookLibrary: canonicalHookLibrary(value.hookLibrary),
    reelsResearch: value.reelsResearch ? canonicalReelsResearch(value.reelsResearch) : null,
    selectedProjectId: value.selectedProjectId || "",
    selectedProductId: value.selectedProductId || "",
    selectedReferenceId: value.selectedReferenceId || "",
    selectedCharacterId: value.selectedCharacterId || "",
    selectedAudioId: value.selectedAudioId || "",
    selectedProjectTab: value.selectedProjectTab || "project",
    generationBrief: asObject(value.generationBrief),
    freePrompt: value.freePrompt || ""
  };
}

function canonicalProject(project) {
  return withDefaults(project, {
    id: "",
    name: "",
    client: "",
    exportFolder: "",
    yandexDiskFolder: "",
    dailyLimit: 20,
    usedToday: 0,
    projectLimit: 500,
    usedTotal: 0,
    companyInfo: "",
    companyAudience: "",
    projectTheme: "",
    niche: "",
    keyScenarios: "",
    audiencePains: "",
    audienceDesires: "",
    audienceObjections: "",
    allowedTriggers: "",
    forbiddenTriggers: "",
    hookAggression: "",
    contentRestrictions: "",
    toneOfVoice: "",
    restrictions: "",
    style: "",
    lastReferenceUpdate: "",
    avatarRoundRobinIndex: 0,
    automation: {},
    ctaOverlay: {},
    references: [],
    audioLibrary: [],
    avatarCandidates: [],
    designReferenceCandidates: [],
    characters: []
  });
}

function canonicalProduct(product) {
  return withDefaults(product, {
    id: "",
    projectId: "",
    name: "",
    description: "",
    offer: "",
    components: "",
    pains: [],
    facts: [],
    forbidden: [],
    aiPassport: {},
    references: []
  });
}

function canonicalJob(job) {
  return withDefaults(job, {
    id: "",
    projectId: "",
    productId: "",
    characterId: "",
    status: "",
    stage: "",
    progress: 0,
    title: "",
    topic: "",
    music: "",
    prompt: "",
    referenceTitle: "",
    outputType: "",
    finalVideoUrl: "",
    finalVideoHasAudio: false,
    semanticKey: "",
    meaningPatternId: "",
    productVisualMode: "",
    compositionMode: "",
    contentLayerId: "",
    format: "",
    inputUrls: [],
    inputRefs: [],
    diversitySlot: null,
    queueName: "generation",
    queueStatus: "",
    queuePriority: 0,
    queueAttempts: 0,
    queueMaxAttempts: 1,
    queueScheduledAt: null,
    queueLockedAt: null,
    queueLockOwner: "",
    queueLastError: "",
    queueIdempotencyKey: "",
    queueProviderTaskId: "",
    queueMetadata: {}
  });
}

function canonicalAudio(audio) {
  return withDefaults(audio, {
    id: "",
    title: "",
    mood: "",
    duration: "",
    fileName: "",
    fileType: "",
    fileSize: 0,
    fileData: "",
    createdAt: ""
  });
}

function canonicalHookLibrary(hookLibrary) {
  const source = asObject(hookLibrary);
  return {
    ...source,
    activeVersionId: source.activeVersionId || "",
    versions: asArray(source.versions).map((version) => ({
      ...withDefaults(version, {
        id: "",
        title: "",
        status: "test",
        createdAt: "",
        sourceType: "text",
        hooks: []
      }),
      hooks: asArray(version.hooks).map((hook) => withDefaults(hook, {
        id: "",
        text: "",
        enabled: true,
        tags: [],
        aggression: ""
      }))
    }))
  };
}

function canonicalReelsResearch(reelsResearch) {
  return withDefaults(reelsResearch, {
    updatedAt: "",
    accounts: [],
    modelAnalysis: "",
    modelWriting: "",
    errors: [],
    videos: [],
    summary: {}
  });
}

function withDefaults(value, defaults) {
  const source = asObject(value);
  const result = { ...source };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (result[key] === undefined || result[key] === null) {
      result[key] = fallback;
    }
  }
  return result;
}

function findDifference(left, right, path = "$") {
  if (Object.is(left, right)) return null;
  if (typeof left !== typeof right) return { path, left, right };
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return { path, left, right };
    if (left.length !== right.length) return { path: `${path}.length`, left: left.length, right: right.length };
    for (let index = 0; index < left.length; index += 1) {
      const diff = findDifference(left[index], right[index], `${path}[${index}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return { path, left, right };
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const diff = findDifference(left[key], right[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }
  return { path, left, right };
}

function sortForCompare(value) {
  if (Array.isArray(value)) return value.map(sortForCompare);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      if (value[key] !== undefined) result[key] = sortForCompare(value[key]);
      return result;
    }, {});
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return isPlainObject(value) ? value : {};
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
