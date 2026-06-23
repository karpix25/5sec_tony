const jobPersistenceDefaults = {
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
  diversitySlot: null
};

export function createUniqueJobId(existingJobs = []) {
  const usedIds = new Set(existingJobs.map((job) => job?.id).filter(Boolean));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = `job-${createJobToken()}`;
    if (!usedIds.has(id)) return id;
  }
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeStateJobIds(state) {
  if (!Array.isArray(state?.jobs)) return state;
  const jobs = dedupeJobsById(state.jobs).map(normalizeJobForPersistence);
  return { ...state, jobs };
}

export function dedupeJobsById(jobs = []) {
  const seen = new Set();
  return jobs.filter((job) => {
    if (!job?.id) return true;
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function createJobToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeJobForPersistence(job) {
  return {
    ...jobPersistenceDefaults,
    ...job,
    inputUrls: Array.isArray(job.inputUrls) ? job.inputUrls : [],
    inputRefs: Array.isArray(job.inputRefs) ? job.inputRefs : [],
    diversitySlot: job.diversitySlot ?? null
  };
}
