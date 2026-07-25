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
    await store.whenHydrated?.();
    const mode = getSubmitMode(form, options.submitter);
    const payload = await getDesignReferencePayloadWithStatus(form, store, options.submitter);
    if (!payload.imageData) {
      if (mode === "replace") throw new Error("Для замены выберите файл референса");
      store.createDesignReferenceTemplate(payload);
      return;
    }
    if (mode === "replace" && options.submitter?.dataset?.replaceReference) {
      await store.replaceDesignReference(options.submitter.dataset.replaceReference, payload);
    } else {
      await store.createReference({ ...payload, promptComment: "", takeaways: "" });
    }
    refreshSavedDesignAnalysis(store).catch((error) => {
      console.warn("[design-reference:analysis:error]", error.message || error);
    });
  } catch (error) {
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

export async function getDesignReferencePayload(form) {
  const file = form.querySelector("input[type='file']")?.files?.[0];
  const payload = Object.fromEntries(new FormData(form).entries());
  if (!file) {
    form.reset();
    return payload;
  }

  payload.imageName = file.name;
  const imageData = await readImageFileAsOptimizedDataUrl(file);
  const uploaded = await uploadReferenceAsset({ imageData, imageName: file.name });
  payload.imageData = uploaded.url;
  form.reset();
  return payload;
}

async function getDesignReferencePayloadWithStatus(form, store, submitter) {
  if (!hasSelectedDesignFile(form) || typeof store.runScopedOperation !== "function") {
    return getDesignReferencePayload(form);
  }
  const projectId = store.getState?.().selectedProjectId || "project";
  return store.runScopedOperation({
    scope: `design-reference-upload:${projectId}`,
    key: `design-reference-upload:${projectId}:${submitter?.dataset?.replaceReference || "new"}`,
    kind: "upload",
    targetId: submitter?.dataset?.replaceReference || "new",
    label: "Загружаем файл референса",
    activeStatus: "uploading"
  }, () => getDesignReferencePayload(form));
}

function hasSelectedDesignFile(form) {
  return Boolean(form.querySelector("input[type='file']")?.files?.[0]);
}

function getSubmitMode(form, submitter) {
  const mode = submitter?.dataset?.replaceReference ? "replace" : form?.dataset?.submitMode || "create";
  form?.removeAttribute?.("data-submit-mode");
  return mode;
}
