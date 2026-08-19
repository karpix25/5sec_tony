export function readJsonRequest(request, { limitBytes = 1024 * 1024, tooLargeMessage = "Request body is too large" } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > limitBytes) {
        reject(new Error(tooLargeMessage));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
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
