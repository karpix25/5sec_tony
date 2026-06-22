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
  const jobs = dedupeJobsById(state.jobs);
  return jobs.length === state.jobs.length ? state : { ...state, jobs };
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
