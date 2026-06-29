export async function uploadProductReferenceAsset(reference, productId = "") {
  if (!/^data:image\//i.test(String(reference?.imageData || ""))) return reference;
  const response = await fetch("/api/product-reference-assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...reference, productId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось сохранить фото продукта в S3");
  return payload.reference || { ...reference, imageData: payload.url };
}

export async function uploadProductReferenceAssets(references = [], productId = "") {
  return Promise.all(references.map((reference) => uploadProductReferenceAsset(reference, productId)));
}
