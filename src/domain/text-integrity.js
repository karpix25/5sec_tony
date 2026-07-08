const unicodeReplacementCharacterPattern = /\uFFFD+/g;

export function stripUnicodeReplacementCharacters(value) {
  return String(value ?? "").replace(unicodeReplacementCharacterPattern, "");
}
