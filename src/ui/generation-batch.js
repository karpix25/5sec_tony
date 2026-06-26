export class PartialGenerationBatchError extends Error {
  constructor(message, jobs) {
    super(message);
    this.name = "PartialGenerationBatchError";
    this.jobs = Array.isArray(jobs) ? jobs : [];
  }
}

export async function createGenerationBatch({ count, preflight, createJob }) {
  const jobs = [];
  for (let index = 0; index < count; index += 1) {
    try {
      await preflight({ index, count, batchJobs: jobs });
      const job = createJob();
      if (job) jobs.push(job);
    } catch (error) {
      if (jobs.length) {
        throw new PartialGenerationBatchError(error.message || "AI-команда недоступна", jobs);
      }
      throw error;
    }
  }
  return jobs;
}

export function getPartialBatchJobs(error) {
  return error instanceof PartialGenerationBatchError ? error.jobs : [];
}
