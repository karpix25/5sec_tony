import { compactStateForLocalCache } from "../src/state/local-cache-state.js";

const fullTransportModes = new Set(["full", "legacy", "raw"]);

export function shouldUseFullStateTransport(url) {
  const mode = String(url?.searchParams?.get("transport") || "").toLowerCase();
  return fullTransportModes.has(mode);
}

export function prepareStateForTransport(state, options = {}) {
  if (!state || typeof state !== "object") return state || null;
  if (options.full) return state;
  return compactStateForLocalCache(state);
}

export function getStateTransportMeta(state, transportState, options = {}) {
  const transportBytes = estimateJsonBytes(transportState);
  if (!options.full) {
    return {
      mode: "compact",
      originalBytes: null,
      transportBytes,
      savedBytes: null
    };
  }
  const originalBytes = estimateJsonBytes(state);
  return {
    mode: "full",
    originalBytes,
    transportBytes,
    savedBytes: Math.max(0, originalBytes - transportBytes)
  };
}

function estimateJsonBytes(value) {
  if (!value) return 0;
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
