import { readFileAsDataUrl } from "./form-data.js";

const productAnalysisTimeoutMs = 210000;

export async function getProductPhotoPayloads(form) {
  const files = [...(form.querySelector("input[type='file']")?.files || [])];
  const images = await Promise.all(files.map(async (file) => ({
    name: file.name,
    dataUrl: await readFileAsDataUrl(file)
  })));
  return images;
}

export async function analyzeProductPhotos({ project, product, images }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), productAnalysisTimeoutMs);
  try {
    const response = await fetch("/api/products/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, product, images }),
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Не удалось проанализировать фото продукта");
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Анализ фото занял слишком много времени. Попробуйте 1-2 фото или сожмите изображения.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function fillProductDraft(form, draft) {
  const normalized = normalizeProductDraft(draft);
  setValue(form, "description", normalized.description);
  setValue(form, "offer", normalized.offer);
  setValue(form, "components", normalized.components);
  setValue(form, "pains", listText(normalized.pains));
  setValue(form, "facts", listText(normalized.facts));
  setValue(form, "forbidden", listText(normalized.forbidden));
}

export function productReferencesFromImages(images, promptComment = "Фото продукта из AI-анализа: упаковка, этикетка, форма, цвет и важные надписи.") {
  const referencePrompt = normalizeReferencePromptComment(promptComment);
  return images.map((image, index) => ({
    id: `product-ref-${Date.now().toString(36)}-${index}`,
    title: image.name || `Фото продукта ${index + 1}`,
    promptComment: referencePrompt,
    imageName: image.name || "",
    imageData: image.dataUrl || "",
    createdAt: new Date().toISOString()
  }));
}

export function productPayloadFromDraft(base, draft = {}, references = []) {
  const normalized = normalizeProductDraft(draft);
  return {
    ...base,
    description: normalized.description || base.description || "",
    offer: normalized.offer || base.offer || "",
    components: normalized.components || base.components || "",
    pains: normalized.pains || base.pains || "",
    facts: normalized.facts || base.facts || "",
    forbidden: normalized.forbidden || base.forbidden || "",
    references: [...references, ...(base.references || [])]
  };
}

function normalizeProductDraft(draft = {}) {
  return {
    description: draft.description || draft.whatItIs || "",
    offer: draft.offer || draft.allowedPromise || draft.safePromise || "",
    components: draft.components || draft.details || "",
    pains: draft.pains || draft.whenNeeded || draft.useCases || "",
    facts: draft.facts || draft.proofPoints || "",
    forbidden: draft.forbidden || draft.forbiddenPromises || draft.risks || ""
  };
}

function normalizeReferencePromptComment(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "Фото продукта из AI-анализа: упаковка, этикетка, форма, цвет и важные надписи.";
  return text;
}

function setValue(form, name, value) {
  const field = form?.querySelector(`[name="${name}"]`);
  if (field && value) field.value = value;
}

function listText(value) {
  return Array.isArray(value) ? value.join("\n") : value;
}
