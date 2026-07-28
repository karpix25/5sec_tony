import { getProductsForProject } from "../domain/generation.js";
import { createRemoteProduct, deleteRemoteProduct, updateRemoteProduct } from "../services/products-sync.js";
import { createId, createProductEntity, ensureGenerationBrief } from "./factories.js";

export function createProductActions({
  getState,
  setState,
  recordRemoteSave,
  getRemoteUpdatedAt,
  handleRemoteConflict,
  hasPendingRemoteSave,
  runScopedOperation
}) {
  function createProduct(payload) {
    const product = buildCreatedProduct(payload);
    applyCreatedProduct(product);
    return product;
  }

  async function createProductRemote(payload) {
    const product = buildCreatedProduct(payload);
    return runProductOperation({
      scope: `products:${product.projectId}`,
      kind: "create",
      targetId: product.id,
      label: "Создаем продукт"
    }, async () => {
      if (hasPendingRemoteSave?.()) {
        applyCreatedProduct(product);
        return product;
      }
      const result = await runRemoteProductSave(() => createRemoteProduct(product, getRemoteUpdatedAt?.() || ""));
      if (result.disabled) return createProduct(payload);
      applyCreatedProduct(result.product || product, { skipRemoteSave: true });
      recordSaved(result);
      return result.product || product;
    });
  }

  function updateProduct(payload) {
    const product = buildUpdatedProduct(payload);
    if (!product) return null;
    applyUpdatedProduct(product);
    return product;
  }

  async function updateProductRemote(payload) {
    const productId = getState().selectedProductId;
    return runProductOperation({
      scope: `product:${productId}`,
      kind: "update",
      targetId: productId,
      label: "Сохраняем продукт"
    }, async () => {
      const product = buildUpdatedProduct(payload);
      if (!product) return null;
      if (hasPendingRemoteSave?.()) {
        applyUpdatedProduct(product);
        return product;
      }
      const result = await runRemoteProductSave(
        () => updateRemoteProduct(product.id, product, getRemoteUpdatedAt?.() || ""),
        (error) => retryProductUpdateAfterConflict({ error, payload, productId: product.id })
      );
      if (result.disabled) return updateProduct(payload);
      applyUpdatedProduct(result.product || product, { skipRemoteSave: true });
      recordSaved(result);
      return result.product || product;
    });
  }

  function createProductReference(payload) {
    const product = buildProductWithReference(payload);
    if (!product) return null;
    applyUpdatedProduct(product);
    return product;
  }

  async function createProductReferenceRemote(payload = {}) {
    const productId = getState().selectedProductId;
    const referencePayload = { ...payload, id: payload.id || createId("product-ref") };
    return runProductOperation({
      scope: `product:${productId}`,
      kind: "reference-create",
      targetId: referencePayload.id,
      label: "Добавляем фото продукта"
    }, async () => {
      const product = buildProductWithReference(referencePayload);
      if (!product) return null;
      if (hasPendingRemoteSave?.()) {
        applyUpdatedProduct(product);
        return product;
      }
      const result = await runRemoteProductSave(() => updateRemoteProduct(product.id, product, getRemoteUpdatedAt?.() || ""));
      if (result.disabled) return createProductReference(referencePayload);
      applyUpdatedProduct(result.product || product, { skipRemoteSave: true });
      recordSaved(result);
      return result.product || product;
    });
  }

  function deleteProductReference(referenceId) {
    const product = buildProductWithoutReference(referenceId);
    if (!product) return null;
    applyUpdatedProduct(product);
    return product;
  }

  async function deleteProductReferenceRemote(referenceId) {
    const productId = getState().selectedProductId;
    return runProductOperation({
      scope: `product:${productId}`,
      kind: "reference-delete",
      targetId: referenceId,
      label: "Удаляем фото продукта",
      activeStatus: "deleting"
    }, async () => {
      const product = buildProductWithoutReference(referenceId);
      if (!product) return null;
      if (hasPendingRemoteSave?.()) {
        applyUpdatedProduct(product);
        return product;
      }
      const result = await runRemoteProductSave(() => updateRemoteProduct(product.id, product, getRemoteUpdatedAt?.() || ""));
      if (result.disabled) return deleteProductReference(referenceId);
      applyUpdatedProduct(result.product || product, { skipRemoteSave: true });
      recordSaved(result);
      return result.product || product;
    });
  }

  function deleteProduct(productId) {
    const deletion = buildProductDeletion(productId);
    if (deletion?.ok === false) return deletion;
    applyProductDeletion(deletion);
    return { ok: true, deletedProductId: productId };
  }

  async function deleteProductRemoteAction(productId) {
    return runProductOperation({
      scope: `product:${productId}`,
      kind: "delete",
      targetId: productId,
      label: "Удаляем продукт",
      activeStatus: "deleting"
    }, async () => {
      const deletion = buildProductDeletion(productId);
      if (deletion?.ok === false) return deletion;
      if (hasPendingRemoteSave?.()) return deleteProduct(productId);
      let result;
      try {
        result = await deleteRemoteProduct(productId, getRemoteUpdatedAt?.() || "");
      } catch (error) {
        if (error?.conflict) await handleRemoteConflict?.(error);
        throw error;
      }
      if (result.disabled) return deleteProduct(productId);
      applyProductDeletion(deletion, { skipRemoteSave: true });
      recordSaved(result);
      return { ok: true, deletedProductId: productId };
    });
  }

  function buildCreatedProduct(payload) {
    const state = getState();
    return createProductEntity(state.selectedProjectId, payload.name || "Новый продукт", payload);
  }

  function buildUpdatedProduct(payload) {
    const state = getState();
    const product = state.products.find((item) => item.id === state.selectedProductId);
    return product ? createProductEntity(product.projectId, payload.name || product.name, { ...product, ...payload }) : null;
  }

  function buildProductWithReference(payload) {
    const state = getState();
    const product = state.products.find((item) => item.id === state.selectedProductId);
    if (!product) return null;
    return { ...product, references: [createProductReferenceEntity(payload), ...(product.references || [])] };
  }

  function buildProductWithoutReference(referenceId) {
    const state = getState();
    const product = state.products.find((item) => item.id === state.selectedProductId);
    return product ? { ...product, references: (product.references || []).filter((reference) => reference.id !== referenceId) } : null;
  }

  function buildProductDeletion(productId) {
    const state = getState();
    const projectProducts = getProductsForProject(state.products, state.selectedProjectId);
    if (!projectProducts.some((product) => product.id === productId)) {
      console.warn("[store:delete-product]", { reason: "wrong-project", productId, selectedProjectId: state.selectedProjectId });
      return { ok: false, reason: "wrong-project" };
    }
    if (projectProducts.length <= 1) {
      console.warn("[store:delete-product]", { reason: "last-product", productId, selectedProjectId: state.selectedProjectId });
      return { ok: false, reason: "last-product" };
    }
    const products = state.products.filter((product) => product.id !== productId);
    return {
      ok: true,
      productId,
      products,
      jobs: state.jobs.filter((job) => job.productId !== productId),
      deletedProductIds: appendUniqueProductIds(state.deletedProductIds, [productId]),
      selectedProductId: getProductsForProject(products, state.selectedProjectId)[0]?.id
    };
  }

  function applyCreatedProduct(product, options = {}) {
    const state = getState();
    setState({ products: [product, ...state.products.filter((item) => item.id !== product.id)], selectedProductId: product.id }, options);
  }

  function applyUpdatedProduct(product, options = {}) {
    const state = getState();
    setState({ products: state.products.map((item) => item.id === product.id ? product : item) }, options);
  }

  function recordSaved(result) {
    recordRemoteSave?.(getState(), result.updatedAt);
  }

  function applyProductDeletion(deletion, options = {}) {
    setState({
      products: deletion.products,
      jobs: deletion.jobs,
      deletedProductIds: deletion.deletedProductIds,
      selectedProductId: deletion.selectedProductId,
      generationBrief: ensureGenerationBrief({})
    }, options);
  }

  async function runRemoteProductSave(request, retryAfterConflict) {
    try {
      return await request();
    } catch (error) {
      if (error?.conflict) {
        const retried = await retryAfterConflict?.(error);
        if (retried) return retried;
        await handleRemoteConflict?.(error);
      }
      throw error;
    }
  }

  async function retryProductUpdateAfterConflict({ error, payload, productId }) {
    const remoteState = error?.state;
    const remoteProduct = remoteState?.products?.find((item) => item.id === productId);
    if (!remoteProduct || !error?.updatedAt) return null;
    const product = createProductEntity(remoteProduct.projectId, payload.name || remoteProduct.name, {
      ...remoteProduct,
      ...payload,
      id: remoteProduct.id
    });
    let result;
    try {
      result = await updateRemoteProduct(product.id, product, error.updatedAt);
    } catch (retryError) {
      if (retryError?.conflict) await handleRemoteConflict?.(retryError);
      throw retryError;
    }
    if (result.disabled) {
      applyUpdatedProduct(product);
      return { disabled: true, product };
    }
    applyRemoteStateWithProduct(remoteState, result.product || product);
    recordSaved(result);
    return result;
  }

  function applyRemoteStateWithProduct(remoteState, product) {
    const currentState = getState();
    setState({
      projects: Array.isArray(remoteState?.projects) ? remoteState.projects : currentState.projects,
      products: (Array.isArray(remoteState?.products) ? remoteState.products : currentState.products)
        .map((item) => item.id === product.id ? product : item),
      jobs: Array.isArray(remoteState?.jobs) ? remoteState.jobs : currentState.jobs
    }, { skipRemoteSave: true });
  }

  function runProductOperation(config, task) {
    if (!runScopedOperation) return task();
    return runScopedOperation({
      activeStatus: "saving",
      key: `product:${config.scope}:${config.kind}:${config.targetId}`,
      ...config
    }, task);
  }

  return {
    createProduct,
    createProductRemote,
    updateProduct,
    updateProductRemote,
    createProductReference,
    createProductReferenceRemote,
    deleteProductReference,
    deleteProductReferenceRemote,
    deleteProduct,
    deleteProductRemote: deleteProductRemoteAction
  };
}

function createProductReferenceEntity(payload = {}) {
  return {
    id: payload.id || createId("product-ref"),
    title: payload.title || "Референс продукта",
    promptComment: payload.promptComment || "",
    imageName: payload.imageName || "",
    imageData: payload.imageData || "",
    createdAt: payload.createdAt || new Date().toISOString()
  };
}

function appendUniqueProductIds(current = [], next = []) {
  return [...new Set([...(Array.isArray(current) ? current : []), ...next.filter(Boolean)])];
}
