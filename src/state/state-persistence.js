import { StateSyncConflictError, loadRemoteState, saveRemoteState } from "../services/state-sync.js";

const saveDelayMs = 250;
const defaultRefreshIntervalMs = 10000;

export function createStatePersistence({
  getState,
  replaceState,
  notifyStatus,
  getLocalFallbackState,
  getPendingRemoteSave,
  savePendingRemoteSave,
  clearPendingRemoteSave,
  onRemoteModeChange,
  refreshIntervalMs = defaultRefreshIntervalMs
}) {
  let timer = null;
  let refreshTimer = null;
  let saveInFlight = false;
  let refreshInFlight = false;
  let pendingSave = false;
  let hydrated = false;
  let hydratePromise = null;
  let remoteUpdatedAt = "";

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
        startAutoRefresh();
        if (await restorePendingRemoteSave(result)) return;
        if (result.state) {
          await replaceStateWhenSafe(result.state);
          notifyStatus({ status: "saved", message: "Загружено из БД", updatedAt: result.updatedAt });
          return;
        }
        scheduleSave();
        notifyStatus({ status: "saving", message: "Создаем запись в БД" });
      } catch (error) {
        hydrated = true;
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
    clearTimeout(timer);
    timer = setTimeout(flushSave, saveDelayMs);
    notifyStatus({ status: "saving", message: "Сохраняем в БД" });
  }

  async function flushSave() {
    if (saveInFlight) return;
    pendingSave = false;
    saveInFlight = true;
    try {
      savePendingRemoteSave?.(getState(), remoteUpdatedAt);
      const result = await saveRemoteState(getState(), remoteUpdatedAt);
      if (result.disabled) {
        stopAutoRefresh();
        clearPendingRemoteSave?.();
        notifyStatus({ status: "local", message: "БД не настроена" });
      } else {
        remoteUpdatedAt = result.updatedAt || remoteUpdatedAt;
        clearPendingRemoteSave?.();
        notifyStatus({ status: "saved", message: "Сохранено в БД", updatedAt: result.updatedAt });
      }
    } catch (error) {
      if (error instanceof StateSyncConflictError || error?.conflict) {
        await acceptRemoteConflict(error);
        return;
      }
      notifyStatus({ status: "error", message: error.message || "Ошибка сохранения в БД" });
    } finally {
      saveInFlight = false;
      if (pendingSave) flushSave();
    }
  }

  return { hydrate, scheduleSave, whenHydrated: () => hydratePromise || Promise.resolve() };

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
    if (!hydrated || saveInFlight || pendingSave || refreshInFlight || isUserEditing()) return;
    refreshInFlight = true;
    try {
      const result = await loadRemoteState();
      if (result.disabled) {
        stopAutoRefresh();
        onRemoteModeChange?.("local");
        notifyStatus({ status: "local", message: "БД не настроена" });
        return;
      }
      if (result.state && result.updatedAt && result.updatedAt !== remoteUpdatedAt) {
        remoteUpdatedAt = result.updatedAt;
        await replaceStateWhenSafe(result.state);
        notifyStatus({ status: "saved", message: "Обновлено из БД", updatedAt: result.updatedAt });
      }
    } catch (error) {
      notifyStatus({ status: "error", message: error.message || "Ошибка обновления из БД" });
    } finally {
      refreshInFlight = false;
    }
  }

  async function acceptRemoteConflict(error) {
    pendingSave = false;
    clearPendingRemoteSave?.();
    remoteUpdatedAt = error.updatedAt || remoteUpdatedAt;
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
