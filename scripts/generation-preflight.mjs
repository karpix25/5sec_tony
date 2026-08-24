import {
  hasGenerationReadyProductPassport,
  hasUsefulDesignAnalysis,
  normalizeDesignAnalysis,
  normalizeProductAiPassport
} from "../src/domain/ai-artifacts.js";
import { loadGenerationState, updateGenerationState } from "./generation-state.mjs";
import { createServerSelectionContext } from "./generation-selection-context.mjs";
import { assertPlayableAudioLibrary } from "./generation-audio-guard.mjs";

export async function ensureGenerationPreflight({ selection = {}, origin, deps = {} }) {
  const state = await loadState(deps);
  const context = createServerSelectionContext(state, selection);
  if (!context.project) throw new Error("Проект не найден");
  if (!context.product) throw new Error("Карточка продукта не найдена");
  if (!context.reference) throw new Error("Дизайн-референс не выбран");
  assertPlayableAudioLibrary(context.audioLibrary);

  const missingProducts = context.products.filter((product) => !hasGenerationReadyProductPassport(product.aiPassport));
  const missingReference = !hasUsefulDesignAnalysis(context.reference.designAnalysis);
  if (!missingProducts.length && !missingReference) {
    return { state, createdProductPassports: 0, createdDesignAnalysis: false };
  }

  const productPassports = await createMissingProductPassports({ products: missingProducts, project: context.project, origin, deps });
  const designAnalysis = missingReference
    ? await createMissingDesignAnalysis({ project: context.project, reference: context.reference, origin, deps })
    : null;

  const result = await updateState(deps, (current) => {
    const products = applyProductPassports(current.products || [], productPassports);
    const projects = designAnalysis ? applyDesignAnalysis(current.projects || [], context.project.id, context.reference.id, designAnalysis) : current.projects;
    return { ...current, products, projects };
  });

  return {
    state: result.state,
    updatedAt: result.updatedAt,
    createdProductPassports: productPassports.size,
    createdDesignAnalysis: Boolean(designAnalysis)
  };
}

async function createMissingProductPassports({ products, project, origin, deps }) {
  const refreshProductPassport = deps.refreshProductPassport || refreshProductPassportViaApi;
  const productPassports = new Map();
  for (const product of products) {
    const passport = normalizeProductAiPassport(await refreshProductPassport({ project, product, origin }));
    if (!hasGenerationReadyProductPassport(passport)) {
      throw new Error(`AI-карточка продукта "${product.name || product.id}" не создалась`);
    }
    productPassports.set(product.id, { ...passport, updatedAt: passport.updatedAt || new Date().toISOString() });
  }
  return productPassports;
}

async function createMissingDesignAnalysis({ project, reference, origin, deps }) {
  const refreshDesignAnalysis = deps.refreshDesignAnalysis || refreshDesignAnalysisViaApi;
  const designAnalysis = normalizeDesignAnalysis(await refreshDesignAnalysis({ project, reference, origin }));
  if (!hasUsefulDesignAnalysis(designAnalysis)) {
    throw new Error(`Анализ дизайн-референса "${reference.title || reference.id}" не создался`);
  }
  return { ...designAnalysis, analyzedAt: designAnalysis.analyzedAt || new Date().toISOString() };
}

function applyProductPassports(products, productPassports) {
  if (!productPassports.size) return products;
  return products.map((product) => productPassports.has(product.id)
    ? { ...product, aiPassport: productPassports.get(product.id) }
    : product
  );
}

function applyDesignAnalysis(projects, projectId, referenceId, designAnalysis) {
  return projects.map((project) => project.id === projectId ? {
    ...project,
    references: (project.references || []).map((reference) => reference.id === referenceId
      ? { ...reference, designAnalysis }
      : reference
    )
  } : project);
}

async function refreshProductPassportViaApi({ project, product, origin }) {
  const payload = await postJson(origin, "/api/products/passport", { project, product });
  return payload.passport;
}

async function refreshDesignAnalysisViaApi({ reference, origin }) {
  const payload = await postJson(origin, "/api/design-references/analyze", { reference });
  return payload.designAnalysis;
}

async function postJson(origin, path, body) {
  if (!origin) throw new Error("Не указан origin для server preflight");
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Preflight API failed: ${response.status}`);
  return payload;
}

function loadState(deps) {
  return deps.loadGenerationState ? deps.loadGenerationState({ compactJobs: true }) : loadGenerationState(deps, { compactJobs: true });
}

function updateState(deps, updater) {
  const compactDeps = { ...deps, stateLoadOptions: { ...(deps.stateLoadOptions || {}), compactJobs: true } };
  return deps.updateGenerationState ? deps.updateGenerationState(updater, compactDeps) : updateGenerationState(updater, compactDeps);
}
