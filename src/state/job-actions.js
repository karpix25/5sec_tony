import { advanceJob, createGenerationJob, getProductsForProject } from "../domain/generation.js";
import { createGenerationBatchId, normalizeGenerationCount, normalizeGenerationSelection } from "../domain/generation-batch-reservation.js";
import { createPendingGenerationJob } from "../domain/generation-placeholder.js";
import { patchJobWithQuotaAccounting } from "../domain/job-quota.js";
import { createBriefJobStartedAt } from "./brief-job-rescue.js";
import { withCreatedJobs } from "./store-projects.js";
import {
  createSelectionJobBatch,
  getSelectionJobBatchAvailability,
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
    createPendingServerGenerationBatch({ count, distributeProducts = false, selection = {}, batchId = "" } = {}) {
      const state = getState();
      const context = getSelectionContext(state, getProject);
      const safeCount = normalizeGenerationCount(count);
      const serverBatchId = batchId || createGenerationBatchId();
      const selectionSnapshot = normalizeGenerationSelection(selection);
      const availability = getSelectionJobBatchAvailability(state, context, safeCount);
      const reservedJobs = createSelectionJobBatch(state, context, safeCount, { distributeProducts })
        .map((job, index) => createPendingGenerationJobWithStartedAt(job, index, safeCount, {
          serverBatchId,
          selectionSnapshot,
          serverOwned: true,
          serverReservationStatus: "requested"
        }));
      if (!reservedJobs.length) {
        const failedJob = createRejectedGenerationReservationJob({
          context,
          batchId: serverBatchId,
          selectionSnapshot,
          reason: availability.reason || "Серверная очередь не создала задачу. Проверьте лимиты проекта."
        });
        setState({
          selectedProjectTab: "queue",
          jobs: [failedJob, ...state.jobs]
        });
        return { batchId: serverBatchId, jobs: [failedJob], accepted: false, reason: failedJob.failMsg };
      }
      setState({
        selectedProjectTab: "queue",
        jobs: [...reservedJobs, ...state.jobs]
      });
      return { batchId: serverBatchId, jobs: reservedJobs, accepted: true, reason: "" };
    },
    failPendingGenerationBatch(batchId, message) {
      const state = getState();
      setState({
        jobs: state.jobs.map((job) => (
          job.serverBatchId === batchId && job.isBriefPlaceholder
            ? {
                ...job,
                status: "failed",
                stage: "brief",
                progress: 100,
                serverReservationStatus: "failed",
                failMsg: message || "Серверная очередь не приняла задачу. Запустите генерацию заново."
              }
            : job
        ))
      });
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

function createPendingGenerationJobWithStartedAt(job, index, count, extra = {}) {
  return createPendingGenerationJob(job, index, count, {
    ...extra,
    briefStartedAt: extra.briefStartedAt || createBriefJobStartedAt()
  });
}

function createRejectedGenerationReservationJob({ context, batchId, selectionSnapshot, reason }) {
  return {
    id: `job-launch-${createBriefJobStartedAt().replace(/[^0-9]/g, "")}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    projectId: context.project?.id || "",
    productId: context.product?.id || "",
    productName: context.product?.name || "",
    characterId: context.character?.id || "__no_avatar__",
    referenceId: context.reference?.id || "",
    referenceTitle: context.reference?.title || "",
    music: context.audio?.title || "аудио проекта",
    status: "failed",
    stage: "brief",
    progress: 100,
    title: "Запуск не принят",
    topic: "Очередь не создала новую задачу",
    prompt: "",
    inputUrls: [],
    inputRefs: [],
    outputType: "final-video",
    finalVideoUrl: "",
    finalVideoHasAudio: false,
    serverBatchId: batchId,
    serverOwned: true,
    serverReservationStatus: "failed",
    selectionSnapshot,
    failMsg: reason
  };
}
