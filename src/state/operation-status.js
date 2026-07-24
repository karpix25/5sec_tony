const activeStatuses = new Set(["queued", "uploading", "saving", "syncing", "analyzing", "deleting"]);

export function createScopedOperationQueue() {
  const tails = new Map();
  return {
    hasPending(scope) {
      return tails.has(scope);
    },
    enqueue(scope, task) {
      const previous = tails.get(scope) || Promise.resolve();
      const current = previous.catch(() => null).then(task);
      const cleanup = current.finally(() => {
        if (tails.get(scope) === cleanup) tails.delete(scope);
      }).catch(() => null);
      tails.set(scope, cleanup);
      return current;
    }
  };
}

export function upsertOperation(operations = {}, patch = {}) {
  if (!patch.key) return operations;
  const previous = operations[patch.key] || {};
  return {
    ...operations,
    [patch.key]: {
      ...previous,
      ...patch,
      updatedAt: new Date().toISOString()
    }
  };
}

export function removeOperation(operations = {}, key) {
  if (!key || !operations[key]) return operations;
  const next = { ...operations };
  delete next[key];
  return next;
}

export function getOperationForTarget(operations = {}, { scope = "", targetId = "", kind = "" } = {}) {
  return Object.values(operations).find((operation) => {
    if (scope && operation.scope !== scope) return false;
    if (targetId && operation.targetId !== targetId) return false;
    if (kind && operation.kind !== kind) return false;
    return true;
  }) || null;
}

export function getOperationsForScope(operations = {}, scope = "") {
  return Object.values(operations).filter((operation) => !scope || operation.scope === scope);
}

export function isOperationActive(operation) {
  return activeStatuses.has(String(operation?.status || ""));
}
