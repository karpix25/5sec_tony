export async function readMultipartForm(request, contentType, maxBytes) {
  const boundary = getMultipartBoundary(contentType);
  if (!boundary) throw new Error("Multipart boundary is missing");
  return parseMultipartBuffer(await readRequestBuffer(request, maxBytes), boundary);
}

export function isMultipartRequest(headers = {}) {
  return /^multipart\/form-data/i.test(String(headers["content-type"] || headers["Content-Type"] || ""));
}

export function readRequestBuffer(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        reject(new Error("Request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function getMultipartBoundary(contentType = "") {
  return String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1]
    || String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2]
    || "";
}

function parseMultipartBuffer(buffer, boundary) {
  const fields = {};
  const files = {};
  const parts = buffer.toString("binary").split(`--${boundary}`).slice(1, -1);
  for (const rawPart of parts) {
    const part = trimPart(rawPart);
    const separatorIndex = part.indexOf("\r\n\r\n");
    if (separatorIndex < 0) continue;
    const headers = parseHeaders(part.slice(0, separatorIndex));
    const content = part.slice(separatorIndex + 4).replace(/\r\n$/, "");
    const disposition = headers["content-disposition"] || "";
    const name = disposition.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];
    if (filename !== undefined) {
      files[name] = {
        filename,
        mimeType: headers["content-type"] || "application/octet-stream",
        buffer: Buffer.from(content, "binary")
      };
      continue;
    }
    fields[name] = Buffer.from(content, "binary").toString("utf8");
  }
  return { fields, files };
}

function trimPart(part) {
  return String(part || "").replace(/^\r\n/, "").replace(/\r\n$/, "");
}

function parseHeaders(value) {
  return Object.fromEntries(String(value || "")
    .split("\r\n")
    .map((line) => {
      const index = line.indexOf(":");
      return index < 0 ? null : [line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim()];
    })
    .filter(Boolean));
}
