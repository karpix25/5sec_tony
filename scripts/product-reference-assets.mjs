import { appendProductReferenceToState } from "./media-state-store.mjs";
import { isS3AssetStorageConfigured, uploadDataUrlToS3 } from "./s3-assets.mjs";

const imageDataUrlPattern = /^data:image\/[^;]+;base64,/i;
const maxImagePayloadBytes = 15 * 1024 * 1024;

export async function handleProductReferenceAssetsApi(request, response, url) {
  if (request.method !== "POST" || url.pathname !== "/api/product-reference-assets") return false;
  try {
    if (!isS3AssetStorageConfigured()) return sendJson(response, 503, { error: "S3 storage is not configured" });
    const body = await readJson(request, maxImagePayloadBytes);
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

function readJson(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        reject(new Error("Product reference request is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
  return true;
}
