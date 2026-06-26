export async function createServerGenerationBatch(payload) {
  const response = await fetch("/api/generation/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не удалось запустить серверную очередь");
  return data;
}
