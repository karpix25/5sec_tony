import { appendProductReferenceToState } from "./media-state-store.mjs";
import { isMultipartRequest, readMultipartForm } from "./multipart-form.mjs";
import { readJsonRequest } from "./request-body.mjs";
import { isS3AssetStorageConfigured, uploadDataUrlToS3 } from "./s3-assets.mjs";

const imageDataUrlPattern = /^data:image\/[^;]+;base64,/i;
const maxImagePayloadBytes = 15 * 1024 * 1024;

export async function handleProductReferenceAssetsApi(request, response, url) {
  if (request.method !== "POST" || url.pathname !== "/api/product-reference-assets") return false;
  try {
    if (!isS3AssetStorageConfigured()) return sendJson(response, 503, { error: "S3 storage is not configured" });
    const body = await readProductReferenceBody(request);
    if (!imageDataUrlPattern.test(String(body.imageData || ""))) {
      return sendJson(response, 400, { error: "imageData must be an image data URL" });
    }
    const imageUrl = await uploadDataUrlToS3(body.imageData, { prefix: "product-references" });
    const reference = await appendProductReferenceToState(body.productId || "", {
      id: body.id || "",
      title: body.title || body.imageName || "",
      promptComment: body.promptComment || "",
      imageName: body.imageName || "",
      imageData: imageUrl,
      createdAt: body.createdAt || ""
    });
    return sendJson(response, 200, { reference, url: imageUrl });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось сохранить фото продукта" });
  }
}

async function readProductReferenceBody(request) {
  if (!isMultipartRequest(request.headers)) return readJson(request, maxImagePayloadBytes);
  const form = await readMultipartForm(request, request.headers["content-type"], maxImagePayloadBytes);
  const file = form.files.image || form.files.imageData;
  return {
    ...form.fields,
    imageName: form.fields.imageName || file?.filename || "",
    imageData: file ? createDataImageUrl(file.mimeType, file.buffer) : ""
  };
}

function readJson(request, maxBytes) {
  return readJsonRequest(request, { limitBytes: maxBytes, tooLargeMessage: "Product reference request is too large" });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
  return true;
}

function createDataImageUrl(mimeType, buffer) {
  const normalized = String(mimeType || "").toLowerCase().replace("image/jpg", "image/jpeg");
  if (!/^image\/(?:png|jpeg|webp)$/.test(normalized)) throw new Error("Неподдерживаемый формат product reference image");
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error("Product reference image слишком большой, максимум 12 MB");
  return `data:${normalized};base64,${buffer.toString("base64")}`;
}
