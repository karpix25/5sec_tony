import { getContext } from "../state/store.js";
import { refreshDesignAnalysis } from "../services/ai-memory.js";
import { uploadReferenceAsset } from "../services/reference-assets.js";
import { readImageFileAsOptimizedDataUrl } from "./form-data.js";

export function bindDesignReferenceFormEvents(root, store) {
  root.querySelector("#reference-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitDesignReferenceForm(event.currentTarget, store, { submitter: event.submitter });
  });
}

export async function submitDesignReferenceForm(form, store, options = {}) {
  try {
    setReferenceFormStatus(form, "Загружаем состояние из БД");
    await store.whenHydrated?.();
    const mode = getSubmitMode(form, options.submitter);
    const payload = await getDesignReferencePayloadWithStatus(form, store, options.submitter, { reset: false });
    if (!payload.imageData) {
      if (mode === "replace") throw new Error("Для замены выберите файл референса");
      setReferenceFormStatus(form, "Сохраняем шаблон");
      store.createDesignReferenceTemplate(payload);
      form.reset?.();
      setReferenceFormStatus(form, "Шаблон сохранен");
      return;
    }
    setReferenceFormStatus(form, "Сохраняем референс в БД");
    if (mode === "replace" && options.submitter?.dataset?.replaceReference) {
      await store.replaceDesignReference(options.submitter.dataset.replaceReference, payload);
    } else {
      await store.createReference({ ...payload, promptComment: "", takeaways: "" });
    }
    form.reset?.();
    setReferenceFormStatus(form, "Референс сохранен");
    refreshSavedDesignAnalysis(store).catch((error) => {
      console.warn("[design-reference:analysis:error]", error.message || error);
    });
  } catch (error) {
    setReferenceFormStatus(form, `Ошибка: ${error.message || "не удалось сохранить референс"}`);
    console.warn("[design-reference:save:error]", error.message || error);
  }
}

async function refreshSavedDesignAnalysis(store) {
  if (!store.getState || !store.updateSelectedDesignReference) return;
  const context = getContext(store.getState());
  if (!context.reference?.imageData) return;
  const designAnalysis = await refreshDesignAnalysis({
    project: context.project,
    reference: context.reference
  });
  await store.updateSelectedDesignReference({ designAnalysis: { ...designAnalysis, analyzedAt: new Date().toISOString() } });
}

export async function getDesignReferencePayload(form, options = {}) {
  const file = form.querySelector("input[type='file']")?.files?.[0];
  const payload = Object.fromEntries(new FormData(form).entries());
  if (!file) {
    if (options.reset !== false) form.reset();
    return payload;
  }

  payload.imageName = file.name;
  const imageData = await readImageFileAsOptimizedDataUrl(file);
  const uploaded = await uploadReferenceAsset({ imageData, imageName: file.name });
  payload.imageData = uploaded.url;
  if (options.reset !== false) form.reset();
  return payload;
}

async function getDesignReferencePayloadWithStatus(form, store, submitter, options = {}) {
  if (!hasSelectedDesignFile(form) || typeof store.runScopedOperation !== "function") {
    return getDesignReferencePayload(form, options);
  }
  const projectId = store.getState?.().selectedProjectId || "project";
  return store.runScopedOperation({
    scope: `design-reference-upload:${projectId}`,
    key: `design-reference-upload:${projectId}:${submitter?.dataset?.replaceReference || "new"}`,
    kind: "upload",
    targetId: submitter?.dataset?.replaceReference || "new",
    label: "Загружаем файл референса",
    activeStatus: "uploading"
  }, () => getDesignReferencePayload(form, options));
}

function hasSelectedDesignFile(form) {
  return Boolean(form.querySelector("input[type='file']")?.files?.[0]);
}

function getSubmitMode(form, submitter) {
  const mode = submitter?.dataset?.replaceReference ? "replace" : form?.dataset?.submitMode || "create";
  form?.removeAttribute?.("data-submit-mode");
  return mode;
}

function setReferenceFormStatus(form, message) {
  const status = form?.querySelector?.("#reference-form-status")
    || (typeof document !== "undefined" ? document.querySelector("#reference-form-status") : null);
  if (status) status.textContent = message;
}
