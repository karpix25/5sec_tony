import { createImageUploadBody } from "./image-upload-body.js";

export async function uploadProductReferenceAsset(reference, productId = "") {
  if (!/^data:image\//i.test(String(reference?.imageData || ""))) return reference;
  const { imageData, ...fields } = reference;
  const upload = await createImageUploadBody({ ...fields, productId }, imageData, reference.imageName || "product-reference");
  const response = await fetch("/api/product-reference-assets", {
    method: "POST",
    ...upload
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось сохранить фото продукта в S3");
  return payload.reference || { ...reference, imageData: payload.url };
}

export async function uploadProductReferenceAssets(references = [], productId = "") {
  return Promise.all(references.map((reference) => uploadProductReferenceAsset(reference, productId)));
}
