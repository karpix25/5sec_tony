export function getFormPayload(form) {
  const payload = getFormSnapshot(form);
  form?.reset?.();
  return payload;
}

export function getFormSnapshot(form) {
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function readImageFileAsOptimizedDataUrl(file, options = {}) {
  const original = await readFileAsDataUrl(file);
  if (!canOptimizeImage(file)) return original;
  try {
    return await optimizeImageDataUrl(original, options);
  } catch {
    return original;
  }
}

function canOptimizeImage(file) {
  return /^image\/(?:png|jpe?g|webp)$/i.test(file?.type || "")
    && typeof Image !== "undefined"
    && typeof document !== "undefined";
}

function optimizeImageDataUrl(dataUrl, {
  maxSide = 1800,
  mimeType = "image/jpeg",
  quality = 0.86
} = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
      const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
      const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL(mimeType, quality));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}
