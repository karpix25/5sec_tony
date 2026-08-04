const unicodeReplacementCharacterPattern = /\uFFFD+/g;

export function stripUnicodeReplacementCharacters(value) {
  return String(value ?? "").replace(unicodeReplacementCharacterPattern, "");
}

export function sanitizeTextTree(value) {
  if (typeof value === "string") return stripUnicodeReplacementCharacters(value);
  if (Array.isArray(value)) return value.map(sanitizeTextTree);
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeTextTree(item)]));
}
