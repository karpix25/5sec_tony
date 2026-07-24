import { createScopedOperationQueue, removeOperation, upsertOperation } from "./operation-status.js";

export function createOperationController(notify) {
  let operations = {};
  const queue = createScopedOperationQueue();

  function getOperations() {
    return operations;
  }

  function setOperation(patch) {
    operations = upsertOperation(operations, patch);
    notify?.(operations);
  }

  function clearOperation(key) {
    operations = removeOperation(operations, key);
    notify?.(operations);
  }

  function runScopedOperation(config = {}, task) {
    const scope = config.scope || "global";
    const key = config.key || `${scope}:${config.kind || "operation"}`;
    setOperation({ ...config, key, scope, status: "queued", error: "" });
    return queue.enqueue(scope, async () => {
      setOperation({ ...config, key, scope, status: config.activeStatus || "saving", error: "" });
      try {
        const result = await task();
        setOperation({ ...config, key, scope, status: "done", error: "" });
        clearOperation(key);
        return result;
      } catch (error) {
        setOperation({ ...config, key, scope, status: "failed", error: error.message || "Ошибка операции" });
        throw error;
      }
    });
  }

  return { getOperations, runScopedOperation };
}
