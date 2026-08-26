import { createGenerationJob } from "../domain/generation.js";
import { pickNextDesignReference } from "../domain/references.js";

export function createGenerationJobBatch({ context, existingJobs, count, products = [], rotateReferences = true, contentDirectionIds = [] }) {
  const jobs = [];
  const batchProducts = getBatchProducts(products, context.product);
  for (let index = 0; index < count; index += 1) {
    const product = pickNextBatchProduct(batchProducts, existingJobs, jobs);
    const reference = rotateReferences
      ? pickNextDesignReference({
          project: context.project,
          fallbackReference: context.reference,
          existingJobs,
          batchJobs: jobs
        })
      : context.reference;
    const job = createGenerationJob({
      ...context,
      product,
      reference,
      generationBrief: {
        ...context.generationBrief,
        contentDirectionIds: product.id === context.product?.id ? contentDirectionIds : []
      },
      existingJobs: [...existingJobs, ...jobs]
    });
    jobs.push(job);
  }
  return jobs;
}

function getBatchProducts(products, fallbackProduct) {
  const seen = new Set();
  return [...products, fallbackProduct]
    .filter((product) => product?.id && !seen.has(product.id) && seen.add(product.id));
}

function pickNextBatchProduct(products, existingJobs, batchJobs) {
  if (!products.length) return null;
  const usage = new Map(products.map((product) => [product.id, 0]));
  [...existingJobs, ...batchJobs].forEach((job) => {
    if (usage.has(job.productId)) usage.set(job.productId, usage.get(job.productId) + 1);
  });
  return products.reduce((best, product) =>
    usage.get(product.id) < usage.get(best.id) ? product : best
  , products[0]);
}
