export async function createImageUploadBody(fields = {}, imageData = "", imageName = "image") {
  if (canUseMultipartUpload(imageData)) {
    try {
      const blob = await fetch(imageData).then((response) => response.blob());
      const form = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) form.append(key, String(value));
      });
      form.append("image", blob, imageName || "image");
      return { body: form, headers: {} };
    } catch {
      // Keep JSON fallback for old browsers, tests, and unusual data URL fetch failures.
    }
  }
  return {
    body: JSON.stringify({ ...fields, imageData, imageName }),
    headers: { "Content-Type": "application/json" }
  };
}

function canUseMultipartUpload(imageData) {
  return /^data:image\//i.test(String(imageData || ""))
    && typeof FormData !== "undefined"
    && typeof FormData.prototype?.append === "function"
    && typeof fetch === "function";
}
