import { generateAudienceExpertDraft } from "../services/audience-expert.js";
import { raiseProjectLimitAboveUsedTotal, readProjectLimitBase } from "./project-limit-fields.js";

const projectAiFieldLabels = {
  projectTheme: "Тема проекта",
  niche: "Ниша",
  keyScenarios: "Сценарные кластеры",
  audiencePains: "Боли аудитории",
  audienceDesires: "Желания аудитории",
  audienceObjections: "Возражения аудитории",
  allowedTriggers: "Разрешенные триггеры",
  forbiddenTriggers: "Запрещенные триггеры",
  hookAggression: "Степень агрессивности хуков",
  contentRestrictions: "Контентные ограничения",
  companyInfo: "Информация о компании",
  companyAudience: "ЦА компании",
  toneOfVoice: "Tone of voice",
  restrictions: "Ограничения проекта"
};

const audienceExpertFields = [
  "niche",
  "keyScenarios",
  "audiencePains",
  "audienceDesires",
  "audienceObjections",
  "allowedTriggers",
  "forbiddenTriggers",
  "hookAggression",
  "contentRestrictions",
  "companyAudience",
  "toneOfVoice",
  "restrictions"
];

export async function runAudienceExpertAi(button, store) {
  const form = button.closest("form");
  const status = form?.querySelector("#audience-expert-status");
  const snapshot = formSnapshot(form);
  const previous = button.textContent;
  button.textContent = "Обновляю...";
  button.disabled = true;
  setStatus(status, "Обновляем память для будущих генераций...", "loading");
  try {
    const draft = await requestAudienceExpertDraft(store, snapshot);
    const liveForm = getLiveProjectForm(form);
    const liveSnapshot = formSnapshot(liveForm);
    const mergedDraft = mergeAudienceDraft(snapshot, liveSnapshot, draft);
    applyAudienceExpertDraft(liveForm, mergedDraft);
    await saveProjectSettings(store, { ...formSnapshot(liveForm), ...mergedDraft }, {
      projectLimitBase: readProjectLimitBase(liveForm)
    });
    setStatus(status, "AI-память обновлена и будет использоваться в генерациях.", "success");
  } catch (error) {
    setStatus(status, humanizeError(error), "error");
  } finally {
    button.textContent = previous;
    button.disabled = false;
  }
}

export async function saveProjectAndRefreshAiMemory(form, store, options = {}) {
  const button = form?.querySelector("#save-project-settings");
  const status = form?.querySelector("#audience-expert-status");
  const previous = button?.textContent || "";
  const projectId = store.getState?.().selectedProjectId;
  if (button) {
    button.textContent = "Сохраняем...";
    button.disabled = true;
  }
  setStatus(status, "Сохраняем проект...", "loading");
  try {
    const projectLimitBase = readProjectLimitBase(form);
    const limitResult = raiseProjectLimitAboveUsedTotal(formSnapshot(form), store, form);
    const snapshot = limitResult.payload;
    const shouldRefreshAi = hasProjectAiMemorySourceChanges(store, snapshot);
    await saveProjectSettings(store, snapshot, {
      projectLimitBase,
      preserveFields: audienceExpertFields,
      savedSnapshot: options.savedSnapshot
    });
    if (!shouldRefreshAi) {
      setStatus(status, limitResult.adjusted ? `Проект сохранен. ${limitResult.message}` : "Проект сохранен.", "success");
      return { savedPayload: snapshot, aiRefresh: null };
    }
    setStatus(status, "Проект сохранен. AI-память обновляется в фоне...", "loading");
    const aiRefresh = refreshProjectAiMemory({ form, store, snapshot, projectId, projectLimitBase, status });
    return { savedPayload: snapshot, aiRefresh };
  } catch (error) {
    setStatus(status, humanizeProjectSaveError(error), "error");
    if (options.rethrowSaveError) throw error;
    return { savedPayload: null, aiRefresh: null };
  } finally {
    if (button) {
      button.textContent = previous || "Сохранить проект";
      button.disabled = false;
    }
  }
}

async function refreshProjectAiMemory({ form, store, snapshot, projectId, projectLimitBase, status }) {
  try {
    const sourceSnapshot = getProjectAiSourceSnapshot(store, projectId, snapshot);
    const draft = await requestAudienceExpertDraft(store, snapshot, projectId);
    const currentProject = store.getState?.().projects?.find((item) => item.id === projectId);
    const liveForm = store.getState?.().selectedProjectId === projectId ? getLiveProjectForm(form) : null;
    const liveSnapshot = liveForm ? formSnapshot(liveForm) : currentProject;
    if (!currentProject || (typeof store.updateProjectPatchRemote === "function" && hasProjectAiSourceDrift(sourceSnapshot, currentProject))
      || (liveForm && hasProjectAiSourceDrift(sourceSnapshot, getProjectAiSourceSnapshot(store, projectId, liveSnapshot)))) {
      setStatus(liveForm?.querySelector("#audience-expert-status") || status, "Проект сохранен. AI-обновление пропущено: данные уже изменились.", "success");
      return null;
    }
    const mergedDraft = mergeAudienceDraft(snapshot, liveSnapshot, draft, { preserveFilledLiveValues: true });
    if (!Object.keys(mergedDraft).length) {
      setStatus(liveForm?.querySelector("#audience-expert-status") || status, "Проект сохранен. AI-память уже актуальна.", "success");
      return null;
    }
    if (typeof store.updateProjectPatchRemote === "function") {
      await store.updateProjectPatchRemote(projectId, mergedDraft, { kind: "ai-memory", label: "Обновляем AI-память" });
    } else {
      await saveProjectSettings(store, { ...liveSnapshot, ...mergedDraft }, {
        projectLimitBase: readProjectLimitBase(liveForm) ?? projectLimitBase
      });
    }
    const currentForm = store.getState?.().selectedProjectId === projectId ? getLiveProjectForm(liveForm || form) : null;
    const latestProject = store.getState?.().projects?.find((item) => item.id === projectId);
    const latestSnapshot = currentForm ? getProjectAiSourceSnapshot(store, projectId, formSnapshot(currentForm)) : latestProject;
    if (latestProject && (!currentForm || !hasProjectAiSourceDrift(sourceSnapshot, latestSnapshot))) applyAudienceExpertDraft(currentForm, mergedDraft);
    setStatus(currentForm?.querySelector("#audience-expert-status") || status, "Проект сохранен. AI-память обновлена.", "success");
    return mergedDraft;
  } catch (error) {
    const liveForm = store.getState?.().selectedProjectId === projectId ? getLiveProjectForm(form) : null;
    setStatus(liveForm?.querySelector("#audience-expert-status") || status, `Проект сохранен. ${humanizeMemoryError(error)}`, "error");
    return null;
  }
}

export async function runProjectFieldAi(button, store) {
  const form = button.closest("form");
  const fieldName = button.dataset.aiProjectField;
  const field = form?.querySelector(`[name="${fieldName}"]`);
  const status = form?.querySelector(`[data-ai-status-for="${fieldName}"]`);
  const snapshot = formSnapshot(form);
  const previous = button.textContent;
  button.textContent = "...";
  button.disabled = true;
  setStatus(status, "Генерируем с учетом текущих несохраненных полей...", "loading");
  try {
    const payload = await requestProjectFieldDraft(store, snapshot, fieldName);
    const liveForm = getLiveProjectForm(form);
    const liveSnapshot = formSnapshot(liveForm);
    const liveField = liveForm?.querySelector(`[name="${fieldName}"]`) || field;
    const nextValue = shouldKeepLiveValue(snapshot[fieldName], liveSnapshot[fieldName]) ? liveSnapshot[fieldName] : (payload.value || snapshot[fieldName] || "");
    if (liveField && nextValue) liveField.value = nextValue;
    await saveProjectSettings(store, { ...liveSnapshot, [fieldName]: nextValue }, {
      projectLimitBase: readProjectLimitBase(liveForm)
    });
    setStatus(status, "Готово. Проверьте текст и сохраните настройки.", "success");
  } catch (error) {
    const message = humanizeError(error);
    button.title = message;
    setStatus(status, message, "error");
  } finally {
    button.textContent = previous;
    button.disabled = false;
  }
}

async function saveProjectSettings(store, payload, options = {}) {
  if (typeof store.updateProjectSettingsRemote === "function") {
    return store.updateProjectSettingsRemote(payload, options);
  }
  store.updateProjectSettings(payload);
  return null;
}

async function requestAudienceExpertDraft(store, snapshot, projectId = store.getState().selectedProjectId) {
  const state = store.getState();
  const project = state.projects.find((item) => item.id === projectId);
  const products = state.products.filter((item) => item.projectId === projectId);
  const liveDraft = {
    ...snapshot,
    companyInfo: snapshot.companyInfo || snapshot.projectTheme || project?.companyInfo || ""
  };
  return generateAudienceExpertDraft({
    project: { ...project, ...liveDraft },
    draft: liveDraft,
    products
  });
}

function applyAudienceExpertDraft(form, draft) {
  audienceExpertFields.forEach((name) => {
    const field = form?.querySelector(`[name="${name}"]`);
    if (field && draft[name]) field.value = draft[name];
  });
}

async function requestProjectFieldDraft(store, snapshot, fieldName) {
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  const products = state.products.filter((item) => item.projectId === state.selectedProjectId);
  const liveProject = { ...project, ...snapshot };
  const response = await fetch("/api/project/generate-field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fieldName,
      fieldLabel: projectAiFieldLabels[fieldName] || fieldName,
      project: liveProject,
      draft: snapshot,
      products
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "AI-сервис не ответил");
  return payload;
}

function formSnapshot(form) {
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}

function hasProjectAiMemorySourceChanges(store, snapshot) {
  const state = store.getState?.();
  const project = state?.projects?.find((item) => item.id === state.selectedProjectId);
  if (!project) return true;
  return projectAiMemorySourceFields.some((field) => normalizeFormText(snapshot[field]) !== normalizeFormText(project[field]));
}

function getProjectAiSourceSnapshot(store, projectId, snapshot = {}) {
  const project = store.getState?.().projects?.find((item) => item.id === projectId) || {};
  return Object.fromEntries(projectAiMemorySourceFields.map((field) => [field, Object.hasOwn(snapshot, field) ? snapshot[field] : project[field]]));
}

function hasProjectAiSourceDrift(expected = {}, actual = {}) {
  return projectAiMemorySourceFields.some((field) => normalizeFormText(expected[field]) !== normalizeFormText(actual[field]));
}

const projectAiMemorySourceFields = [
  "projectTheme",
  "niche",
  "keyScenarios",
  "audiencePains",
  "audienceDesires",
  "audienceObjections",
  "allowedTriggers",
  "forbiddenTriggers",
  "hookAggression",
  "contentRestrictions",
  "companyInfo",
  "companyAudience",
  "toneOfVoice",
  "restrictions"
];

function normalizeFormText(value) {
  return String(value ?? "").trim();
}

function getLiveProjectForm(form) {
  if (typeof document === "undefined") return form;
  return document.querySelector("#project-settings-form") || form;
}

function mergeAudienceDraft(snapshot, liveSnapshot, draft, options = {}) {
  return audienceExpertFields.reduce((acc, fieldName) => {
    if (!draft[fieldName]) return acc;
    if (options.preserveFilledLiveValues && hasMeaningfulProjectValue(liveSnapshot[fieldName])) return acc;
    if (shouldKeepLiveValue(snapshot[fieldName], liveSnapshot[fieldName])) return acc;
    acc[fieldName] = draft[fieldName];
    return acc;
  }, {});
}

function shouldKeepLiveValue(initialValue, liveValue) {
  return normalizeProjectComparableValue(initialValue) !== normalizeProjectComparableValue(liveValue);
}

function normalizeProjectComparableValue(value) {
  return String(value || "").trim();
}

function hasMeaningfulProjectValue(value) {
  const text = normalizeProjectComparableValue(value);
  return Boolean(text && !/^\[object Object\](,\[object Object\])*$/.test(text));
}

function setStatus(status, text, tone) {
  if (!status) return;
  status.textContent = text;
  status.dataset.tone = tone;
}

function humanizeError(error) {
  const message = error.message || "AI-сервис не вернул результат";
  if (message.includes("OPENROUTER_API_KEY")) return "Нужно добавить OPENROUTER_API_KEY в .env и перезапустить сервер.";
  return message;
}

function humanizeMemoryError(error) {
  const message = humanizeError(error);
  if (message.includes("OPENROUTER_API_KEY")) return message;
  return "AI-память обновим позже.";
}

function humanizeProjectSaveError(error, options = {}) {
  const message = humanizeError(error);
  if (options.projectSaved) {
    return `Проект сохранен. ${humanizeMemoryError(error)}`;
  }
  return `Не удалось сохранить проект: ${message}`;
}
