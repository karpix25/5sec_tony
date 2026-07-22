import { getContext } from "../state/store.js";
import { refreshDesignAnalysis } from "../services/ai-memory.js";
import { uploadReferenceAsset } from "../services/reference-assets.js";

export function bindDesignReferenceFormEvents(root, store) {
  root.querySelector("#reference-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitDesignReferenceForm(event.currentTarget, store);
  });
}

export async function submitDesignReferenceForm(form, store) {
  try {
    const payload = await getDesignReferencePayload(form);
    if (!payload.imageData) {
      store.createDesignReferenceTemplate(payload);
      return;
    }
    await store.createReference({ ...payload, promptComment: "", takeaways: "" });
    await refreshSavedDesignAnalysis(store);
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
  const imageData = await readDesignFileAsDataUrl(file);
  const uploaded = await uploadReferenceAsset({ imageData, imageName: file.name });
  payload.imageData = uploaded.url;
  form.reset();
  return payload;
}

function readDesignFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
