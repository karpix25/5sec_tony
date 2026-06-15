const hookStorageKey = "anton-hook-library";

export function getHookLibrary() {
  const fallback = { activeVersionId: "", versions: [] };
  try {
    if (typeof window === "undefined" || !window.localStorage) return fallback;
    const text = window.localStorage.getItem(hookStorageKey);
    return normalizeHookLibrary(text ? JSON.parse(text) : fallback);
  } catch {
    return fallback;
  }
}

export function saveHookLibrary(library) {
  const normalized = normalizeHookLibrary(library);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(hookStorageKey, JSON.stringify(normalized));
    }
  } catch {}
  return normalized;
}

export function createHookDraft({ title, sourceType = "text", text = "" }) {
  const hooks = parseHookLines(text).map((line) => createHookItem(line));
  return {
    title: title || `Версия хуков ${new Date().toLocaleDateString("ru-RU")}`,
    sourceType,
    hooks,
    duplicateCount: Math.max(0, parseRawHookLines(text).length - hooks.length)
  };
}

export function applyHookDraft(library, draft) {
  const version = {
    id: hookCreateId("hook-version"),
    title: draft.title || "Новая версия хуков",
    status: "active",
    createdAt: new Date().toISOString(),
    sourceType: draft.sourceType || "text",
    hooks: (draft.hooks || []).map((hook) => ({ ...createHookItem(hook.text || hook), ...hook }))
  };
  const archived = normalizeHookLibrary(library).versions.map((item) =>
    item.status === "active" ? { ...item, status: "archive" } : item
  );
  return saveHookLibrary({ activeVersionId: version.id, versions: [version, ...archived] });
}

export function setHookVersionStatus(library, versionId, status) {
  const next = normalizeHookLibrary(library);
  const versions = next.versions.map((version) => {
    if (status === "active" && version.id !== versionId && version.status === "active") {
      return { ...version, status: "archive" };
    }
    return version.id === versionId ? { ...version, status } : version;
  });
  return saveHookLibrary({
    activeVersionId: status === "active" ? versionId : versions.find((item) => item.status === "active")?.id || "",
    versions
  });
}

export function toggleHookEnabled(library, hookId) {
  const next = normalizeHookLibrary(library);
  return saveHookLibrary({
    ...next,
    versions: next.versions.map((version) => ({
      ...version,
      hooks: version.hooks.map((hook) => hook.id === hookId ? { ...hook, enabled: !hook.enabled } : hook)
    }))
  });
}

export function selectHookReference({ project, product, pattern, slot }) {
  const library = getHookLibrary();
  const active = library.versions.filter((version) => version.status === "active");
  const eligibleHooks = active.flatMap((version) => version.hooks)
    .filter((hook) => hook.enabled !== false)
    .filter((hook) => hook.text);
  const matchingHooks = eligibleHooks.filter((hook) => hookMatchesContext(hook, { project, product, pattern }));
  const hooks = matchingHooks.length ? matchingHooks : eligibleHooks;
  if (!hooks.length) return null;
  const source = [
    project?.projectTheme || "",
    product?.name || "",
    pattern?.id || "",
    slot?.id || "",
    slot?.topic || "",
    slot?.angle || ""
  ].join(" ");
  const index = Math.abs(hashHookSource(source)) % hooks.length;
  return hooks[index];
}

export function adaptHookFromReference(hook, { project, product, angle }) {
  const subject = hookShortSubject(project, product, angle);
  const problem = hookFirstLine(product?.pains) || hookFirstLine(project?.audiencePains) || "ситуация";
  const replacements = {
    "\\[тема\\]": subject,
    "\\[темы\\]": subject,
    "\\[объект\\]": product?.name || subject,
    "\\[объекта\\]": product?.name || subject,
    "\\[проблема\\]": problem,
    "\\[проблемы\\]": problem,
    "\\[результат\\]": product?.offer || hookFirstLine(project?.audienceDesires) || "результат",
    "\\(ниша, клиент\\)": subject,
    "\\(ниша\\)": subject,
    "\\(клиент\\)": product?.name || subject,
    "\\(проект, блог, способ что-то делать\\)": subject,
    "\\(чего-то\\)": subject,
    "\\(что-то\\)": product?.name || subject,
    "\\(действие\\)": hookFirstLine(project?.keyScenarios) || "это",
    "\\(сайт, ресурс, портал\\)": product?.name || subject,
    "\\(сайт, приложение, инструмент\\)": product?.name || subject,
    "\\(мест, вещей, ресторанов и тд\\)": product?.name || subject,
    "\\(город, страна\\)": subject,
    "\\(страна, город\\)": subject,
    "\\(указать боли аудитории\\)": problem
  };
  let text = hook.text || "";
  Object.entries(replacements).forEach(([pattern, value]) => {
    text = text.replace(new RegExp(pattern, "gi"), value);
  });
  text = text.replace(/\bN\b/g, getReferenceHookPointCount(text) || "5");
  if (/\bэто\b/i.test(text)) return text.replace(/\bэто\b/i, subject);
  return text.includes("[") ? text : `${text}: ${subject}`;
}

function getReferenceHookPointCount(value) {
  const match = String(value || "").match(/\b([3-9])\b/);
  return match ? match[1] : "";
}

function normalizeHookLibrary(library) {
  const versions = Array.isArray(library?.versions) ? library.versions.map(normalizeHookVersion) : [];
  const activeVersionId = library?.activeVersionId || versions.find((item) => item.status === "active")?.id || "";
  return { activeVersionId, versions };
}

function normalizeHookVersion(version) {
  return {
    id: version.id || hookCreateId("hook-version"),
    title: version.title || "Версия хуков",
    status: ["active", "test", "archive"].includes(version.status) ? version.status : "test",
    createdAt: version.createdAt || new Date().toISOString(),
    sourceType: version.sourceType || "text",
    hooks: Array.isArray(version.hooks) ? version.hooks.map((hook) => ({ ...createHookItem(hook.text || hook), ...hook })) : []
  };
}

function createHookItem(text) {
  return {
    id: hookCreateId("hook"),
    text: String(text || "").trim(),
    enabled: true,
    tags: classifyHookTags(text),
    aggression: classifyHookAggression(text)
  };
}

function parseHookLines(text) {
  return [...new Set(parseRawHookLines(text).map((line) => line.toLowerCase()))]
    .map((lower) => parseRawHookLines(text).find((line) => line.toLowerCase() === lower))
    .filter(Boolean);
}

function parseRawHookLines(text) {
  return String(text || "")
    .split(/\n|•|— |\d+[.)]/)
    .map((line) => line.replace(/^[-–—*"'«»\s]+|["'«»\s]+$/g, "").trim())
    .filter((line) => line.length >= 8);
}

function classifyHookTags(text) {
  const source = String(text || "").toLowerCase();
  const tags = [];
  if (/красн|флаг|опасн|риск/.test(source)) tags.push("красный флаг");
  if (/ошиб|стоить|дорого|лома/.test(source)) tags.push("ошибка");
  if (/пока|сегодня|час|успей|дедлайн/.test(source)) tags.push("дедлайн");
  if (/проверь|чек|пункт|признак/.test(source)) tags.push("чеклист");
  if (/норма|миф|реальн|путай/.test(source)) tags.push("сравнение");
  if (/секрет|молчат|не говорят/.test(source)) tags.push("секрет");
  return tags.length ? tags : ["универсальный"];
}

function classifyHookAggression(text) {
  const source = String(text || "").toLowerCase();
  if (/никогда|опасн|красн|сгорит|потеря|туп/.test(source)) return "высокая";
  if (/ошиб|не делайте|проверь|риск/.test(source)) return "средняя";
  return "низкая";
}

function hookMatchesContext(hook, { project, product, pattern }) {
  const source = `${pattern?.id || ""} ${project?.allowedTriggers || ""} ${project?.keyScenarios || ""} ${product?.pains?.join(" ") || ""}`.toLowerCase();
  if (!hook.tags?.length || hook.tags.includes("универсальный")) return true;
  return hook.tags.some((tag) => source.includes(tag.split(" ")[0]));
}

function hookShortSubject(project, product, angle) {
  return hookFirstLine(angle) || hookFirstLine(project?.projectTheme) || product?.name || "это";
}

function hookFirstLine(value) {
  return String(Array.isArray(value) ? value.find(Boolean) || "" : value || "").split(/\n|;|,/)[0].trim();
}

function hashHookSource(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0);
}

function hookCreateId(prefix) {
  return `${prefix}-${Math.floor(Date.now() + Math.random() * 100000)}`;
}
