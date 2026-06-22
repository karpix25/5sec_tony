export async function runServerImageJob({ job, context }) {
  const response = await fetch("/api/jobs/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job, context })
  });
  return readServerJobPayload(response);
}

export async function getServerImageJobStatus(jobId) {
  const response = await fetch(`/api/jobs/status?jobId=${encodeURIComponent(jobId)}`);
  return readServerJobPayload(response);
}

async function readServerJobPayload(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Server job request failed");
  return payload;
}
