const maxContentDirections = 7;

export const directProductContentDirection = {
  id: "direct-product",
  title: "Сам продукт и его применение",
  relation: "Прямой контент о продукте, его составе, применении и выборе.",
  kind: "direct",
  enabled: true
};

export function normalizeProductContentDirections(value) {
  const source = parseObject(value);
  const rawItems = Array.isArray(source.items) ? source.items : [];
  if (!rawItems.length) return null;

  const items = dedupeDirections(rawItems)
    .filter((item) => item.id !== directProductContentDirection.id)
    .slice(0, maxContentDirections - 1);
  return {
    version: 1,
    generatedAt: clean(source.generatedAt),
    items: [
      { ...directProductContentDirection, enabled: readEnabled(rawItems, directProductContentDirection.id) },
      ...items
    ]
  };
}

export function getProductContentDirections(product = {}) {
  return normalizeProductContentDirections(product.contentDirections || product.extra?.contentDirections);
}

export function preserveContentDirectionSelection(current, next) {
  const previous = normalizeProductContentDirections(current);
  const replacement = normalizeProductContentDirections(next);
  if (!replacement || !previous) return replacement;
  const enabledById = new Map(previous.items.map((item) => [item.id, item.enabled !== false]));
  return normalizeProductContentDirections({
    ...replacement,
    items: replacement.items.map((item) => enabledById.has(item.id)
      ? { ...item, enabled: enabledById.get(item.id) }
      : item)
  });
}

export function getEnabledContentDirections(product = {}, requestedIds = []) {
  const directions = getProductContentDirections(product);
  if (!directions) return [];
  const requested = new Set(normalizeDirectionIds(requestedIds));
  return directions.items.filter((item) => item.enabled && (!requested.size || requested.has(item.id)));
}

export function pickContentDirection({ product = {}, existingJobs = [], requestedIds = [] } = {}) {
  const enabled = getEnabledContentDirections(product, requestedIds);
  if (!enabled.length) return null;

  const direct = enabled.find((item) => item.kind === "direct");
  const recent = existingJobs
    .filter((job) => !product.id || job.productId === product.id)
    .map((job, index) => ({
      id: job.diversitySlot?.contentDirection?.id || job.contentDirection?.id || "",
      createdAt: Date.parse(job.createdAt || "") || 0,
      index
    }))
    .sort((left, right) => right.createdAt - left.createdAt || right.index - left.index)
    .map((item) => item.id)
    .filter(Boolean);
  const recentDirectIndex = direct ? recent.indexOf(direct.id) : -1;
  if (direct && (recentDirectIndex < 0 || recentDirectIndex >= 2)) return direct;

  const adjacent = enabled.filter((item) => item.kind !== "direct");
  if (!adjacent.length) return direct || enabled[0];
  return pickLeastRecent(adjacent, recent);
}

export function normalizeDirectionIds(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((item) => clean(item)).filter(Boolean))].slice(0, maxContentDirections);
}

function dedupeDirections(items) {
  const seen = new Set();
  return items
    .map((item) => normalizeDirection(item))
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function normalizeDirection(item = {}) {
  const title = clean(item.title || item.label);
  if (!title || title.length > 90) return null;
  const id = clean(item.id).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "");
  if (!id) return null;
  return {
    id,
    title,
    relation: clean(item.relation || item.description).slice(0, 180),
    kind: "adjacent",
    enabled: item.enabled !== false
  };
}

function readEnabled(items, id) {
  const item = items.find((candidate) => clean(candidate?.id) === id);
  return item ? item.enabled !== false : true;
}

function pickLeastRecent(items, recent) {
  return items.reduce((best, item) => {
    const bestIndex = recent.indexOf(best.id);
    const itemIndex = recent.indexOf(item.id);
    if (itemIndex < 0) return bestIndex < 0 ? best : item;
    if (bestIndex < 0) return best;
    return itemIndex > bestIndex ? item : best;
  }, items[0]);
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
