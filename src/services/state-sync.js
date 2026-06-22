export async function loadRemoteState() {
  const response = await fetch("/api/state", { method: "GET" });
  const payload = await readStateSyncResponse(response);
  return {
    state: payload.state || null,
    disabled: Boolean(payload.disabled),
    updatedAt: payload.updatedAt || "",
    error: payload.error || ""
  };
}

export async function saveRemoteState(state) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state })
  });
  const payload = await readStateSyncResponse(response);
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    updatedAt: payload.updatedAt || "",
    parityOk: payload.parityOk !== false,
    error: payload.error || ""
  };
}

async function readStateSyncResponse(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok) throw new Error(payload.error || "State sync request failed");
  return payload;
}
