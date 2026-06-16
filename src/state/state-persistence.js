import { loadRemoteState, saveRemoteState } from "../services/state-sync.js";

const saveDelayMs = 700;

export function createStatePersistence({ getState, replaceState, notifyStatus }) {
  let timer = null;
  let saveInFlight = false;
  let pendingSave = false;
  let hydrated = false;

  async function hydrate() {
    notifyStatus({ status: "loading", message: "Загружаем из БД" });
    try {
      const result = await loadRemoteState();
      hydrated = true;
      if (result.disabled) {
        notifyStatus({ status: "local", message: "БД не настроена" });
        return;
      }
      if (result.state) {
        replaceStateWhenSafe(result.state);
        notifyStatus({ status: "saved", message: "Загружено из БД", updatedAt: result.updatedAt });
        return;
      }
      scheduleSave();
      notifyStatus({ status: "saving", message: "Создаем запись в БД" });
    } catch (error) {
      hydrated = true;
      notifyStatus({ status: "error", message: error.message || "Ошибка БД" });
    }
  }

  function scheduleSave() {
    if (!hydrated) return;
    pendingSave = true;
    clearTimeout(timer);
    timer = setTimeout(flushSave, saveDelayMs);
    notifyStatus({ status: "saving", message: "Сохраняем в БД" });
  }

  async function flushSave() {
    if (saveInFlight) return;
    pendingSave = false;
    saveInFlight = true;
    try {
      const result = await saveRemoteState(getState());
      if (result.disabled) {
        notifyStatus({ status: "local", message: "БД не настроена" });
      } else {
        notifyStatus({ status: "saved", message: "Сохранено в БД", updatedAt: result.updatedAt });
      }
    } catch (error) {
      notifyStatus({ status: "error", message: error.message || "Ошибка сохранения в БД" });
    } finally {
      saveInFlight = false;
      if (pendingSave) flushSave();
    }
  }

  return { hydrate, scheduleSave };

  function replaceStateWhenSafe(nextState) {
    if (!isUserEditing()) {
      replaceState(nextState);
      return;
    }
    const retry = () => {
      if (!isUserEditing()) replaceState(nextState);
      else setTimeout(retry, 400);
    };
    setTimeout(retry, 400);
  }
}

function isUserEditing() {
  if (typeof document === "undefined") return false;
  const element = document.activeElement;
  return Boolean(element?.matches?.("input, textarea, select, [contenteditable='true']"));
}
