import { adaptHookText } from "./hook-adapter.js";

export function createEmptyHookLibrary() {
  return { activeVersionId: "", versions: [] };
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
  return normalizeHookLibrary({ activeVersionId: version.id, versions: [version, ...archived] });
}

export function setHookVersionStatus(library, versionId, status) {
  const next = normalizeHookLibrary(library);
  const versions = next.versions.map((version) => {
    if (status === "active" && version.id !== versionId && version.status === "active") {
      return { ...version, status: "archive" };
    }
    return version.id === versionId ? { ...version, status } : version;
  });
  return normalizeHookLibrary({
    activeVersionId: status === "active" ? versionId : versions.find((item) => item.status === "active")?.id || "",
    versions
  });
}

export function toggleHookEnabled(library, hookId) {
  const next = normalizeHookLibrary(library);
  return normalizeHookLibrary({
    ...next,
    versions: next.versions.map((version) => ({
      ...version,
      hooks: version.hooks.map((hook) => hook.id === hookId ? { ...hook, enabled: !hook.enabled } : hook)
    }))
  });
}

export function selectHookReference({ hookLibrary, project, product, pattern, slot, existingJobs = [] }) {
  const library = normalizeHookLibrary(hookLibrary);
  const active = library.versions.filter((version) => version.status === "active");
  const eligibleHooks = active.flatMap((version) => version.hooks)
    .filter((hook) => hook.enabled !== false)
    .filter((hook) => hook.text);
  const matchingHooks = eligibleHooks.filter((hook) => hookMatchesContext(hook, { project, product, pattern }));
  const hooks = matchingHooks.length ? matchingHooks : eligibleHooks;
  if (!hooks.length) return null;
  const scoredHooks = hooks
    .map((hook) => ({ hook, score: scoreHookReference(hook, { project, pattern, slot }) }))
    .sort((left, right) => right.score - left.score);
  const bestScore = scoredHooks[0]?.score ?? 0;
  const pool = scoredHooks.filter((item) => item.score >= bestScore - 1).map((item) => item.hook);
  const source = [
    project?.projectTheme || "",
    product?.name || "",
    pattern?.id || "",
    slot?.id || "",
    slot?.topic || "",
    slot?.angle || "",
    existingJobs.length
  ].join(" ");
  const index = Math.abs(hashHookSource(source)) % pool.length;
  return pool[index];
}

export function adaptHookFromReference(hook, { project, product, angle }) {
  return adaptHookText(hook, { project, product, angle });
}

function getReferenceHookPointCount(value) {
  const match = String(value || "").match(/\b([3-9])\b/);
  return match ? match[1] : "";
}

export function normalizeHookLibrary(library) {
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

function hookFirstLine(value) {
  return String(Array.isArray(value) ? value.find(Boolean) || "" : value || "").split(/\n|;|,/)[0].trim();
}

function hashHookSource(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0);
}

function hookCreateId(prefix) {
  return `${prefix}-${Math.floor(Date.now() + Math.random() * 100000)}`;
}

function scoreHookReference(hook, { project, pattern, slot }) {
  const format = String(slot?.format || pattern?.format || "").toLowerCase();
  const tags = hook.tags || [];
  let score = 0;

  if (pattern?.id === "red-flag" && tags.includes("красный флаг")) score += 4;
  if (pattern?.id === "hidden-mistake" && tags.includes("ошибка")) score += 4;
  if (pattern?.id === "myth-reality" && tags.includes("сравнение")) score += 4;
  if (/check|list|scheme|comparison/.test(format) && tags.includes("чеклист")) score += 2;
  if (/high|высок/.test(String(project?.hookAggression || "").toLowerCase()) && hook.aggression === "высокая") score += 1;
  if (/сред/.test(String(project?.hookAggression || "").toLowerCase()) && hook.aggression === "средняя") score += 1;
  if (/\[.*?\]|\(.*?\)|\bчто-то\b/i.test(hook.text || "")) score -= 1;
  if (/\bя\b/i.test(hook.text || "")) score -= 1;

  return score;
}
