import { normalizeResearchResult } from "../domain/reels-research.js";

export async function analyzeReelsResearch({ accounts, limit = 10 }) {
  const response = await fetch("/api/reels/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accounts, limit })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Не удалось изучить Reels");
  return normalizeResearchResult(payload);
}
