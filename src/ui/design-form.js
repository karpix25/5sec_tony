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
    store.createReference({ ...payload, promptComment: payload.prompt, takeaways: payload.prompt });
  } catch (error) {
    console.warn("[design-reference:save:error]", error.message || error);
  }
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
