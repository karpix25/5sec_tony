export async function refreshProductPassport({ project, product }) {
  const payload = await postJson("/api/products/passport", { project, product });
  return payload.passport || {};
}

export async function refreshProductContentDirections({ project, product }) {
  const payload = await postJson("/api/products/content-directions", { project, product });
  return payload.contentDirections || null;
}

export async function refreshDesignAnalysis({ reference }) {
  const payload = await postJson("/api/design-references/analyze", { reference });
  return payload.designAnalysis || {};
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `API failed: ${response.status}`);
  return payload;
}
