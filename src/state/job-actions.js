import { advanceJob, createGenerationJob, getProductsForProject } from "../domain/generation.js";
import { createPendingGenerationJob } from "../domain/generation-placeholder.js";
import { patchJobWithQuotaAccounting } from "../domain/job-quota.js";
import { createBriefJobStartedAt } from "./brief-job-rescue.js";
import { withCreatedJobs } from "./store-projects.js";
import {
  createSelectionJobBatch,
  getProjectSelectionContext,
  getSelectionContext
} from "./store-context.js";

export function createJobActions({ getState, setState, getProject }) {
  return {
    createJob() {
      const state = getState();
      const context = getSelectionContext(state, getProject);
      const jobs = createSelectionJobBatch(state, context, 1);
      setState(withCreatedJobs(state, jobs, context.project.id));
      return jobs[0] || null;
    },
    createJobs(count) {
      const state = getState();
      const context = getSelectionContext(state, getProject);
      const jobs = createSelectionJobBatch(state, context, count);
      setState(withCreatedJobs(state, jobs, context.project.id));
      return jobs;
    },
    createProjectJobs(projectId, count) {
      const state = getState();
      const context = getProjectSelectionContext(state, projectId, getProject);
      const jobs = createSelectionJobBatch(state, context, count, { distributeProducts: true });
      setState(withCreatedJobs(state, jobs, context.project.id));
      return jobs;
    },
    createPendingGenerationJobs(count) {
      const state = getState();
      const context = getSelectionContext(state, getProject);
      const reservedJobs = createSelectionJobBatch(state, context, count)
        .map((job, index) => createPendingGenerationJobWithStartedAt(job, index, count));
      setState(withCreatedJobs(state, reservedJobs, context.project.id));
      return reservedJobs;
    },
    mergeServerJobs(jobs = []) {
      const state = getState();
      const incoming = Array.isArray(jobs) ? jobs.filter((job) => job?.id) : [];
      if (!incoming.length) return [];
      const ids = new Set(incoming.map((job) => job.id));
      setState({ jobs: [...incoming, ...state.jobs.filter((job) => !ids.has(job.id))] });
      return incoming;
    },
    replacePendingGenerationJob(jobId) {
      const state = getState();
      const pendingJob = state.jobs.find((job) => job.id === jobId);
      if (!pendingJob) return null;
      const context = getSelectionContext(state, getProject);
      const product = getProductsForProject(state.products, context.project.id)
        .find((item) => item.id === pendingJob.productId) || context.product;
      const existingJobs = state.jobs.filter((job) => job.id !== jobId && job.projectId === context.project.id);
      const job = {
        ...createGenerationJob({ ...context, product, existingJobs }),
        id: jobId,
        createdAt: pendingJob.createdAt || new Date().toISOString()
      };
      setState({ jobs: state.jobs.map((item) => (item.id === jobId ? job : item)) });
      return job;
    },
    patchJob(jobId, payload) {
      setState(patchJobWithQuotaAccounting(getState(), jobId, payload));
    },
    replaceJob(jobId, jobNext) {
      const state = getState();
      setState({ jobs: state.jobs.map((job) => (job.id === jobId ? jobNext : job)) });
    },
    advanceJob(jobId) {
      const state = getState();
      setState({
        jobs: state.jobs.map((job) => (job.id === jobId ? advanceJob(job) : job))
      });
    },
    deleteJob(jobId) {
      const state = getState();
      setState({ jobs: state.jobs.filter((job) => job.id !== jobId) });
    }
  };
}

function createPendingGenerationJobWithStartedAt(job, index, count) {
  return createPendingGenerationJob(job, index, count, { briefStartedAt: createBriefJobStartedAt() });
}
