import { createGenerationJob } from "../domain/generation.js";

export function createGenerationJobBatch({ context, existingJobs, count }) {
  const jobs = [];
  for (let index = 0; index < count; index += 1) {
    const job = createGenerationJob({
      ...context,
      existingJobs: [...existingJobs, ...jobs]
    });
    jobs.push(job);
  }
  return jobs;
}
