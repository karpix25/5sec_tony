export function readJsonRequest(request, { limitBytes = 1024 * 1024, tooLargeMessage = "Request body is too large" } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let rejectedForSize = false;
    request.on("data", (chunk) => {
      if (rejectedForSize) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > limitBytes) {
        rejectedForSize = true;
        const error = new Error(tooLargeMessage);
        error.code = "REQUEST_BODY_TOO_LARGE";
        error.requestBytes = total;
        error.limitBytes = limitBytes;
        reject(error);
        request.resume?.();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      if (rejectedForSize) return;
      try {
        const data = Buffer.concat(chunks).toString("utf8");
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
