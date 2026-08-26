import { getContext } from "../state/store.js";
import { refreshDesignAnalysis, refreshProductContentDirections, refreshProductPassport } from "../services/ai-memory.js";
import { preserveContentDirectionSelection } from "../domain/product-content-directions.js";
import { getFormSnapshot } from "./form-data.js";

export function bindAiMemoryControls(root, store) {
  root.querySelector("[data-refresh-product-passport]")?.addEventListener("click", () => runProductPassportRefresh(root, store));
  root.querySelector("[data-refresh-product-directions]")?.addEventListener("click", (event) => runProductContentDirectionsRefresh(root, store, event.currentTarget));
  root.querySelector("[data-refresh-design-analysis]")?.addEventListener("click", () => runDesignAnalysisRefresh(root, store));
}

async function runProductContentDirectionsRefresh(root, store, button) {
  const status = root.querySelector("#product-directions-status");
  try {
    button.disabled = true;
    if (status) status.textContent = "Рассчитываем направления для продукта...";
    const context = getContext(store.getState());
    const productForm = root.querySelector("#product-settings-form");
    const product = { ...context.product, ...getFormSnapshot(productForm) };
    const currentDirections = root.querySelector("[data-content-directions-value]")?.value || context.product.contentDirections;
    const contentDirections = await refreshProductContentDirections({ project: context.project, product });
    if (!contentDirections?.items?.length) throw new Error("AI не вернул направления для продукта");
    store.updateProduct({ contentDirections: preserveContentDirectionSelection(currentDirections, contentDirections) });
    root.querySelector("#product-directions-status")?.replaceChildren("Направления обновлены. Выберите нужные и сохраните изменения.");
  } catch (error) {
    if (status) status.textContent = error.message || "Не удалось рассчитать направления.";
  } finally {
    button.disabled = false;
  }
}

async function runProductPassportRefresh(root, store) {
  const status = root.querySelector("#product-passport-status");
  try {
    if (status) status.textContent = "Обновляем AI-паспорт на сервере...";
    const context = getContext(store.getState());
    const passport = await refreshProductPassport({ project: context.project, product: context.product });
    store.updateProduct({ aiPassport: { ...passport, updatedAt: new Date().toISOString() } });
    if (status) status.textContent = "AI-паспорт обновлен.";
  } catch (error) {
    if (status) status.textContent = error.message || "Не удалось обновить AI-паспорт.";
  }
}

async function runDesignAnalysisRefresh(root, store) {
  const status = root.querySelector("#design-analysis-status");
  try {
    if (status) status.textContent = "Анализируем дизайн-референс на сервере...";
    const context = getContext(store.getState());
    const designAnalysis = await refreshDesignAnalysis({ project: context.project, reference: context.reference });
    await store.updateSelectedDesignReference({ designAnalysis: { ...designAnalysis, analyzedAt: new Date().toISOString() } });
    if (status) status.textContent = "Анализ дизайна сохранен.";
  } catch (error) {
    if (status) status.textContent = error.message || "Не удалось обновить анализ дизайна.";
  }
}
