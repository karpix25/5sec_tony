import { getContext } from "../state/store.js";
import { warnButtonBlocked } from "./button-debug.js";
import { getFormSnapshot } from "./form-data.js";
import { getLiveProductDraft, mergeAnalyzedProductDraft } from "./product-analysis-merge.js";
import { analyzeProductPhotos, getProductPhotoPayloads, productPayloadFromDraft, productReferencesFromImages } from "./product-ai.js";
import { closeDeleteProductModal, getProductReferencePayload, openDeleteProductModal } from "./product.js";
import { uploadProductReferenceAssets } from "../services/product-reference-assets.js";

export function bindProductEvents(root, store) {
  root.querySelector("#open-product-modal")?.addEventListener("click", () => openProductModalWhenReady(root, store));
  root.querySelector("#open-product-reference-modal")?.addEventListener("click", () => openProductReferenceModal(root));
  root.querySelector("#open-delete-product-modal")?.addEventListener("click", () => openDeleteProductModal(root));
  root.querySelectorAll("[data-close-product-modal]").forEach((button) => {
    button.addEventListener("click", () => closeProductModal(root));
  });
  root.querySelectorAll("[data-close-product-reference-modal]").forEach((button) => {
    button.addEventListener("click", () => closeProductReferenceModal(root));
  });
  root.querySelectorAll("[data-close-delete-product-modal]").forEach((button) => {
    button.addEventListener("click", () => closeDeleteProductModal(root));
  });
  root.querySelector("#product-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runCreateProductFromPhotos(root, store, event.currentTarget);
  });
  root.querySelector("#product-photo-analysis-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runProductPhotoAnalysis(root, store, event.currentTarget);
  });
  root.querySelector("#product-reference-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runProductReferenceCreate(root, store, event.currentTarget);
  });
  root.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(root, store, button));
  });
  root.querySelectorAll("[data-delete-product-reference]").forEach((button) => {
    button.addEventListener("click", () => deleteProductReference(store, button.dataset.deleteProductReference));
  });
}

async function runProductPhotoAnalysis(root, store, form) {
  const status = root.querySelector("#product-ai-status");
  const productForm = root.querySelector("#product-settings-form");
  const context = getContext(store.getState());
  const productId = context.product.id;
  let product = context.product;
  let references = [];
  try {
    if (status) status.textContent = "Анализируем фото и читаем этикетку...";
    const images = await getProductPhotoPayloads(form);
    product = { ...context.product, ...getFormSnapshot(productForm) };
    references = productReferencesFromImages(images);
    const result = await analyzeProductPhotos({ project: context.project, product, images });
    references = await uploadProductReferenceAssets(productReferencesFromImages(images, result.draft?.promptComment), productId);
    const liveProduct = getLiveProductDraft(root, store, productId, getFormSnapshot, product);
    const payload = mergeAnalyzedProductDraft(productPayloadFromDraft, product, liveProduct, result.draft || {}, references);
    if (store.getState().selectedProductId === productId) await saveProduct(store, payload);
    if (status) status.textContent = "Карточка продукта сохранена.";
  } catch (error) {
    if (references.length && store.getState().selectedProductId === productId) {
      const liveProduct = getLiveProductDraft(root, store, productId, getFormSnapshot, product);
      try {
        await saveProduct(store, productPayloadFromDraft(liveProduct, {}, references));
      } catch (saveError) {
        if (status) status.textContent = saveError.message || "Не удалось сохранить фото продукта.";
        return;
      }
    }
    if (status) status.textContent = error.message || "Не удалось проанализировать фото.";
  }
}

async function runCreateProductFromPhotos(root, store, form) {
  const status = root.querySelector("#new-product-ai-status");
  const context = getContext(store.getState());
  try {
    const images = await getProductPhotoPayloads(form);
    const base = getFormSnapshot(form);
    if (!images.length) {
      if (status) status.textContent = "Создаем продукт...";
      await createProduct(store, productPayloadFromDraft(base));
      form.reset();
      closeProductModal(root);
      return;
    }
    if (status) status.textContent = "Создаем продукт и анализируем фото...";
    const result = await analyzeProductPhotos({ project: context.project, product: base, images });
    const references = await uploadProductReferenceAssets(productReferencesFromImages(images, result.draft?.promptComment));
    await createProduct(store, productPayloadFromDraft(base, result.draft || {}, references));
    form.reset();
    closeProductModal(root);
  } catch (error) {
    if (status) status.textContent = error.message || "Не удалось создать продукт по фото.";
  }
}

async function runProductReferenceCreate(root, store, form) {
  try {
    const payload = await getProductReferencePayload(form, store.getState().selectedProductId);
    await createProductReference(store, payload);
    closeProductReferenceModal(root);
  } catch (error) {
    window.alert?.(error.message || "Не удалось добавить фото продукта");
  }
}

async function saveProduct(store, payload) {
  if (store.updateProductRemote) return store.updateProductRemote(payload);
  return store.updateProduct(payload);
}

async function createProduct(store, payload) {
  if (store.createProductRemote) return store.createProductRemote(payload);
  return store.createProduct(payload);
}

async function createProductReference(store, payload) {
  if (store.createProductReferenceRemote) return store.createProductReferenceRemote(payload);
  return store.createProductReference(payload);
}

function deleteProduct(root, store, button) {
  const request = store.deleteProductRemote
    ? store.deleteProductRemote(button.dataset.deleteProduct)
    : store.deleteProduct(button.dataset.deleteProduct);
  Promise.resolve(request).then((result) => {
    if (result?.ok === false) {
      warnButtonBlocked(result.reason || "delete-product-blocked", {
        buttonId: button.id || null,
        targetProductId: button.dataset.deleteProduct || null
      });
      return;
    }
    closeDeleteProductModal(root);
  }).catch((error) => {
    window.alert?.(error.message || "Не удалось удалить продукт");
  });
}

function deleteProductReference(store, referenceId) {
  const result = store.deleteProductReferenceRemote
    ? store.deleteProductReferenceRemote(referenceId)
    : store.deleteProductReference(referenceId);
  Promise.resolve(result).catch((error) => window.alert?.(error.message || "Не удалось удалить фото продукта"));
}

function openProductModal(root) {
  const modal = root.querySelector("#product-modal");
  if (!modal) return;
  modal.hidden = false;
  root.querySelector("#product-form input[name='name']")?.focus();
}

function openProductModalWhenReady(root, store) {
  if ((store.getState?.().selectedProjectTab || "project") !== "product") {
    store.selectProjectTab?.("product");
    deferUi(() => openProductModal(root));
    return;
  }
  openProductModal(root);
}

function deferUi(callback) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(callback);
  else setTimeout(callback, 0);
}

function closeProductModal(root) {
  root.querySelector("#product-modal")?.setAttribute("hidden", "");
}

function openProductReferenceModal(root) {
  root.querySelector("#product-reference-modal")?.removeAttribute("hidden");
}

function closeProductReferenceModal(root) {
  root.querySelector("#product-reference-modal")?.setAttribute("hidden", "");
}
