export async function createServerGenerationBatch(payload) {
  const response = await fetch("/api/generation/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Не удалось запустить серверную очередь");
    error.code = data.code || "";
    error.status = response.status;
    throw error;
  }
  return data;
}
