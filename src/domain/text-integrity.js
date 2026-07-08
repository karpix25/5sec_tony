const unicodeReplacementCharacterPattern = /\uFFFD/;

export function hasUnicodeReplacementCharacter(value) {
  if (typeof value === "string") return unicodeReplacementCharacterPattern.test(value);
  if (Array.isArray(value)) return value.some(hasUnicodeReplacementCharacter);
  if (value && typeof value === "object") return Object.values(value).some(hasUnicodeReplacementCharacter);
  return false;
}
