import { StateSyncConflictError, loadRemoteJobsPage, loadRemoteState, loadRemoteStateMeta, saveRemoteState } from "../services/state-sync.js";
import { isTransientFetchError } from "../services/sync-fetch.js";
import { mergeAvatarVideoNameConflict } from "./state-conflict-merge.js";

const saveDelayMs = 250;
const defaultRefreshIntervalMs = 10000;
const defaultTransientSaveRetryDelayMs = 5000;

export function createStatePersistence({
  getState,
  replaceState,
  notifyStatus,
  getLocalFallbackState,
  getPendingRemoteSave,
  savePendingRemoteSave,
  clearPendingRemoteSave,
  onRemoteModeChange,
  hasActiveOperation = () => false,
  refreshIntervalMs = defaultRefreshIntervalMs,
  transientSaveRetryDelayMs = defaultTransientSaveRetryDelayMs
}) {
  let timer = null;
  let refreshTimer = null;
  let saveInFlight = false;
  let refreshInFlight = false;
  let pendingSave = false;
  let hydrated = false;
  let hydratePromise = null;
  let remoteUpdatedAt = "";
  let remoteRefreshUpdatedAt = "";
  let remoteCatalogUpdatedAt = "";
  let remoteStateSnapshot = null;
  let remoteJobsReady = true;
  let jobsHydrationInFlight = false;
  let jobsRetryTimer = null;
  let jobsHydrationPromise = Promise.resolve();
  let resolveJobsHydration = null;

  async function hydrate() {
    if (hydratePromise) return hydratePromise;
    notifyStatus({ status: "loading", message: "Загружаем из БД" });
    hydratePromise = (async () => {
      try {
        const result = await loadRemoteState();
        hydrated = true;
        if (result.disabled) {
          stopAutoRefresh();
          onRemoteModeChange?.("local");
          await restoreLocalFallbackState();
          notifyStatus({ status: "local", message: "БД не настроена" });
          return;
        }
        onRemoteModeChange?.("remote");
        remoteUpdatedAt = result.updatedAt || "";
        remoteRefreshUpdatedAt = result.refreshUpdatedAt || result.updatedAt || "";
        remoteCatalogUpdatedAt = result.catalogUpdatedAt || result.refreshUpdatedAt || result.updatedAt || "";
        remoteStateSnapshot = result.state || null;
        remoteJobsReady = !result.jobsDeferred || !result.state;
        startAutoRefresh();
        if (await restorePendingRemoteSave(result)) {
          startJobsHydration(result);
          return;
        }
        if (result.state) {
          await replaceStateWhenSafe(result.state);
          startJobsHydration(result);
          notifyStatus({ status: "saved", message: "Загружено из БД", updatedAt: result.updatedAt });
          return;
        }
        scheduleSave();
        notifyStatus({ status: "saving", message: "Создаем запись в БД" });
      } catch (error) {
        hydrated = true;
        remoteJobsReady = false;
        stopAutoRefresh();
        onRemoteModeChange?.("error");
        await restoreLocalFallbackState();
        notifyStatus({ status: "error", message: error.message || "Ошибка БД" });
      }
    })();
    return hydratePromise;
  }

  function scheduleSave() {
    if (!hydrated) return;
    pendingSave = true;
    savePendingRemoteSave?.(getState(), remoteUpdatedAt);
    if (!remoteJobsReady) {
      notifyStatus({ status: "loading", message: "Загружаем историю генераций перед сохранением" });
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(flushSave, saveDelayMs);
    notifyStatus({ status: "saving", message: "Сохраняем в БД" });
  }

  async function flushSave() {
    if (saveInFlight) return;
    if (!remoteJobsReady) {
      pendingSave = true;
      return;
    }
    pendingSave = false;
    clearTimeout(timer);
    timer = null;
    saveInFlight = true;
    const stateToSave = getState();
    const baseUpdatedAt = remoteUpdatedAt;
    const baseState = remoteStateSnapshot;
    let deferPendingSaveFlush = false;
    try {
      savePendingRemoteSave?.(stateToSave, baseUpdatedAt);
      const result = await saveRemoteState(stateToSave, baseUpdatedAt);
      if (result.disabled) {
        stopAutoRefresh();
        clearPendingRemoteSave?.();
        notifyStatus({ status: "local", message: "БД не настроена" });
      } else {
        remoteUpdatedAt = result.updatedAt || remoteUpdatedAt;
        remoteRefreshUpdatedAt = result.refreshUpdatedAt || result.updatedAt || remoteRefreshUpdatedAt;
        remoteCatalogUpdatedAt = result.catalogUpdatedAt || result.refreshUpdatedAt || result.updatedAt || remoteCatalogUpdatedAt;
        remoteStateSnapshot = stateToSave;
        clearPendingRemoteSave?.();
        notifyStatus({ status: "saved", message: "Сохранено в БД", updatedAt: result.updatedAt });
      }
    } catch (error) {
      if (error instanceof StateSyncConflictError || error?.conflict) {
        await acceptRemoteConflict(error, { attemptedState: stateToSave, baseState });
        return;
      }
      if (isTransientFetchError(error)) {
        scheduleTransientSaveRetry(stateToSave, baseUpdatedAt);
        deferPendingSaveFlush = true;
        return;
      }
      notifyStatus({ status: "error", message: error.message || "Ошибка сохранения в БД" });
    } finally {
      saveInFlight = false;
      if (pendingSave && !deferPendingSaveFlush) flushSave();
    }
  }

  function recordRemoteSave(nextState = getState(), updatedAt = "", refreshUpdatedAt = "", catalogUpdatedAt = "") {
    const hadPendingSave = pendingSave || Boolean(timer) || saveInFlight;
    if (updatedAt) remoteUpdatedAt = updatedAt;
    if (refreshUpdatedAt) remoteRefreshUpdatedAt = refreshUpdatedAt;
    if (catalogUpdatedAt) remoteCatalogUpdatedAt = catalogUpdatedAt;
    remoteStateSnapshot = nextState || getState();
    if (hadPendingSave) {
      pendingSave = true;
      savePendingRemoteSave?.(getState(), remoteUpdatedAt);
      if (!saveInFlight && !timer) timer = setTimeout(flushSave, saveDelayMs);
      notifyStatus({
        status: "saving",
        message: "Сохраняем остальные изменения в БД",
        updatedAt: remoteUpdatedAt
      });
      return;
    }
    pendingSave = false;
    clearTimeout(timer);
    timer = null;
    clearPendingRemoteSave?.();
    notifyStatus({ status: "saved", message: "Сохранено в БД", updatedAt: remoteUpdatedAt });
  }

  function scheduleTransientSaveRetry(stateToSave, baseUpdatedAt) {
    pendingSave = true;
    savePendingRemoteSave?.(stateToSave, baseUpdatedAt);
    clearTimeout(timer);
    timer = setTimeout(flushSave, transientSaveRetryDelayMs);
    notifyStatus({
      status: "saving",
      message: "БД отвечает медленно, повторяем сохранение",
      updatedAt: remoteUpdatedAt
    });
  }

  function startJobsHydration(result) {
    if (!result?.jobsDeferred || jobsHydrationInFlight) return;
    if (!resolveJobsHydration) {
      jobsHydrationPromise = new Promise((resolve) => { resolveJobsHydration = resolve; });
    }
    jobsHydrationInFlight = true;
    void hydrateRemoteJobs();
  }

  async function hydrateRemoteJobs() {
    try {
      const jobs = [];
      let offset = 0;
      do {
        const page = await loadRemoteJobsPage(offset, 500);
        if (page.disabled) break;
        jobs.push(...page.jobs);
        const nextOffset = Number(page.nextOffset);
        if (!page.hasMore || nextOffset <= offset) break;
        offset = nextOffset;
      } while (true);
      remoteJobsReady = true;
      jobsHydrationInFlight = false;
      resolveJobsHydration?.();
      resolveJobsHydration = null;
      remoteStateSnapshot = { ...(remoteStateSnapshot || {}), jobs };
      await replaceStateWhenSafe({ ...getState(), jobs });
      notifyStatus({ status: "saved", message: "История генераций загружена", updatedAt: remoteUpdatedAt });
      if (pendingSave) {
        clearTimeout(timer);
        timer = setTimeout(flushSave, saveDelayMs);
      }
    } catch (error) {
      jobsHydrationInFlight = false;
      notifyStatus({ status: "error", message: error.message || "Не удалось загрузить историю генераций" });
      clearTimeout(jobsRetryTimer);
      jobsRetryTimer = setTimeout(() => startJobsHydration({ jobsDeferred: true }), transientSaveRetryDelayMs);
    }
  }

  async function retryHydration() {
    clearTimeout(jobsRetryTimer);
    jobsRetryTimer = null;
    hydratePromise = null;
    hydrated = false;
    remoteJobsReady = true;
    jobsHydrationPromise = Promise.resolve();
    resolveJobsHydration = null;
    return hydrate();
  }

  return {
    hydrate,
    retryHydration,
    scheduleSave,
    recordRemoteSave,
    handleRemoteConflict: acceptRemoteConflict,
    getRemoteUpdatedAt: () => remoteUpdatedAt,
    getRemoteRefreshUpdatedAt: () => remoteRefreshUpdatedAt,
    getRemoteCatalogUpdatedAt: () => remoteCatalogUpdatedAt,
    hasPendingSave: () => pendingSave || Boolean(timer) || saveInFlight,
    whenHydrated: () => hydratePromise || Promise.resolve(),
    whenJobsHydrated: () => jobsHydrationPromise
  };

  async function restoreLocalFallbackState() {
    const fallbackState = getLocalFallbackState?.();
    if (fallbackState) await replaceStateWhenSafe(fallbackState);
  }

  function replaceStateWhenSafe(nextState) {
    if (!isUserEditing()) {
      replaceState(nextState);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const retry = () => {
        if (!isUserEditing()) {
          replaceState(nextState);
          resolve();
          return;
        }
        setTimeout(retry, 400);
      };
      setTimeout(retry, 400);
    });
  }

  function startAutoRefresh() {
    if (!refreshIntervalMs || refreshTimer) return;
    refreshTimer = setInterval(refreshFromRemote, refreshIntervalMs);
    refreshTimer.unref?.();
  }

  function stopAutoRefresh() {
    if (!refreshTimer) return;
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  async function refreshFromRemote() {
    if (!hydrated || saveInFlight || pendingSave || refreshInFlight || jobsHydrationInFlight || hasActiveOperation() || isUserEditing()) return;
    refreshInFlight = true;
    try {
      const meta = await loadRemoteStateMeta();
      if (meta.disabled) {
        stopAutoRefresh();
        onRemoteModeChange?.("local");
        notifyStatus({ status: "local", message: "БД не настроена" });
        return;
      }
      remoteUpdatedAt = meta.updatedAt || remoteUpdatedAt;
      remoteCatalogUpdatedAt = meta.catalogUpdatedAt || remoteCatalogUpdatedAt;
      if (meta.refreshUpdatedAt === remoteRefreshUpdatedAt) return;
      const result = await loadRemoteState();
      if (result.disabled) {
        stopAutoRefresh();
        onRemoteModeChange?.("local");
        notifyStatus({ status: "local", message: "БД не настроена" });
        return;
      }
      if (result.state && result.refreshUpdatedAt && result.refreshUpdatedAt !== remoteRefreshUpdatedAt) {
        remoteUpdatedAt = result.updatedAt;
        remoteRefreshUpdatedAt = result.refreshUpdatedAt || result.updatedAt;
        remoteCatalogUpdatedAt = result.catalogUpdatedAt || result.refreshUpdatedAt || result.updatedAt;
        remoteJobsReady = !result.jobsDeferred;
        remoteStateSnapshot = { ...result.state, jobs: remoteStateSnapshot?.jobs || getState().jobs || [] };
        const nextState = result.jobsDeferred ? { ...result.state, jobs: getState().jobs || [] } : result.state;
        await replaceStateWhenSafe(nextState);
        startJobsHydration(result);
        notifyStatus({ status: "saved", message: "Обновлено из БД", updatedAt: result.updatedAt });
      }
    } catch (error) {
      notifyStatus({ status: "error", message: error.message || "Ошибка обновления из БД" });
    } finally {
      refreshInFlight = false;
    }
  }

  async function acceptRemoteConflict(error, { attemptedState, baseState } = {}) {
    pendingSave = false;
    clearPendingRemoteSave?.();
    remoteUpdatedAt = error.updatedAt || remoteUpdatedAt;
    remoteRefreshUpdatedAt = error.refreshUpdatedAt || remoteRefreshUpdatedAt;
    remoteCatalogUpdatedAt = error.catalogUpdatedAt || remoteCatalogUpdatedAt;
    remoteStateSnapshot = error.state || remoteStateSnapshot;
    const mergedState = mergeAvatarVideoNameConflict({
      baseState,
      localState: attemptedState,
      remoteState: error.state
    });
    if (mergedState) {
      await replaceStateWhenSafe(mergedState);
      pendingSave = true;
      savePendingRemoteSave?.(mergedState, remoteUpdatedAt);
      notifyStatus({
        status: "saving",
        message: "Сохраняем название ролика поверх свежей БД",
        updatedAt: remoteUpdatedAt
      });
      return;
    }
    if (error.state) {
      await replaceStateWhenSafe(error.state);
    }
    notifyStatus({
      status: "conflict",
      message: "БД обновлена другим оператором",
      updatedAt: remoteUpdatedAt
    });
  }

  async function restorePendingRemoteSave(result) {
    const pending = getPendingRemoteSave?.();
    if (!pending?.state) return false;
    const currentUpdatedAt = result.updatedAt || "";
    if ((pending.baseUpdatedAt || "") !== currentUpdatedAt) {
      clearPendingRemoteSave?.();
      return false;
    }
    await replaceStateWhenSafe(pending.state);
    pendingSave = true;
    clearTimeout(timer);
    timer = setTimeout(flushSave, 0);
    notifyStatus({ status: "saving", message: "Досохраняем в БД", updatedAt: currentUpdatedAt });
    return true;
  }
}

function isUserEditing() {
  if (typeof document === "undefined") return false;
  const element = document.activeElement;
  return Boolean(element?.matches?.("input, textarea, select, [contenteditable='true']")) || hasDirtyFormControls(document);
}

function hasDirtyFormControls(root) {
  return [...(root?.querySelectorAll?.("input, textarea, select") || [])].some(isDirtyControl);
}

function isDirtyControl(control) {
  if (control.matches?.("textarea")) return control.value !== control.defaultValue;
  if (control.matches?.("select")) return control.value !== getDefaultSelectValue(control);
  if (control.matches?.('input[type="checkbox"], input[type="radio"]')) return control.checked !== control.defaultChecked;
  if (control.matches?.('input[type="file"]')) return Number(control.files?.length || 0) > 0;
  return control.value !== control.defaultValue;
}

function getDefaultSelectValue(control) {
  const selected = [...(control.options || [])].find((option) => option.defaultSelected) || control.options?.[0];
  return selected?.value || "";
}
