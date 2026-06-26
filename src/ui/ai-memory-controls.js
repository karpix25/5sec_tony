import { getContext } from "../state/store.js";
import { refreshDesignAnalysis, refreshProductPassport } from "../services/ai-memory.js";

export function bindAiMemoryControls(root, store) {
  root.querySelector("[data-refresh-product-passport]")?.addEventListener("click", () => runProductPassportRefresh(root, store));
  root.querySelector("[data-refresh-design-analysis]")?.addEventListener("click", () => runDesignAnalysisRefresh(root, store));
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
    store.updateSelectedDesignReference({ designAnalysis: { ...designAnalysis, analyzedAt: new Date().toISOString() } });
    if (status) status.textContent = "Анализ дизайна сохранен.";
  } catch (error) {
    if (status) status.textContent = error.message || "Не удалось обновить анализ дизайна.";
  }
}
