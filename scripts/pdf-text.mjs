import { inflateSync } from "node:zlib";

export function extractPdfText(bytes) {
  const streams = readPdfStreams(bytes);
  const cmap = createUnicodeMap(streams.map((stream) => stream.text).join("\n"));
  const chunks = streams.flatMap((stream) => extractTextChunks(stream.text, cmap));
  return normalizePdfText(chunks.join("\n"));
}

function readPdfStreams(bytes) {
  const source = Buffer.from(bytes).toString("latin1");
  const streams = [];
  const pattern = /<<(.*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let match;
  while ((match = pattern.exec(source))) {
    const dict = match[1] || "";
    const raw = trimStreamBytes(Buffer.from(match[2], "latin1"));
    const decoded = /\/FlateDecode\b/.test(dict) ? inflateStream(raw) : raw;
    if (decoded.length) streams.push({ dict, text: decoded.toString("latin1") });
  }
  return streams;
}

function inflateStream(bytes) {
  try {
    return inflateSync(bytes);
  } catch {
    return Buffer.alloc(0);
  }
}

function trimStreamBytes(bytes) {
  let start = 0;
  let end = bytes.length;
  while (start < end && (bytes[start] === 10 || bytes[start] === 13)) start += 1;
  while (end > start && (bytes[end - 1] === 10 || bytes[end - 1] === 13)) end -= 1;
  return bytes.subarray(start, end);
}

function createUnicodeMap(text) {
  const map = new Map();
  const charPattern = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
  let match;
  while ((match = charPattern.exec(text))) {
    map.set(normalizeHex(match[1]), decodeHexUnicode(match[2]));
  }
  return map;
}

function extractTextChunks(text, cmap) {
  const chunks = [];
  const blockPattern = /BT([\s\S]*?)ET/g;
  let block;
  while ((block = blockPattern.exec(text))) {
    chunks.push(...readTextBlock(block[1], cmap));
  }
  return chunks;
}

function readTextBlock(block, cmap) {
  const chunks = [];
  let current = "";
  for (let index = 0; index < block.length; index += 1) {
    const char = block[index];
    if (char === "(") {
      const parsed = readLiteralString(block, index);
      current += parsed.value;
      index = parsed.end;
      continue;
    }
    if (char === "<" && block[index + 1] !== "<") {
      const parsed = readHexString(block, index, cmap);
      current += parsed.value;
      index = parsed.end;
      continue;
    }
    if (startsTextBreak(block, index) && current.trim()) {
      chunks.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function readLiteralString(text, start) {
  let value = "";
  let depth = 1;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      const parsed = readEscapedChar(text, index);
      value += parsed.value;
      index = parsed.end;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (!depth) return { value, end: index };
    value += char;
  }
  return { value, end: text.length - 1 };
}

function readEscapedChar(text, start) {
  const char = text[start + 1] || "";
  if (/[0-7]/.test(char)) {
    const octal = (text.slice(start + 1).match(/^[0-7]{1,3}/) || [""])[0];
    return { value: String.fromCharCode(parseInt(octal, 8)), end: start + octal.length };
  }
  const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
  return { value: escapes[char] ?? char, end: start + 1 };
}

function readHexString(text, start, cmap) {
  const end = text.indexOf(">", start + 1);
  if (end === -1) return { value: "", end: start };
  const hex = normalizeHex(text.slice(start + 1, end));
  return { value: decodeMappedHex(hex, cmap), end };
}

function decodeMappedHex(hex, cmap) {
  if (!hex) return "";
  if (!cmap.size) return decodeHexUnicode(hex);
  const keySizes = [...new Set([...cmap.keys()].map((key) => key.length))].sort((a, b) => b - a);
  let value = "";
  for (let index = 0; index < hex.length;) {
    const size = keySizes.find((length) => cmap.has(hex.slice(index, index + length)));
    if (!size) {
      index += 2;
      continue;
    }
    value += cmap.get(hex.slice(index, index + size)) || "";
    index += size;
  }
  return value;
}

function decodeHexUnicode(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return "";
  const bytes = Buffer.from(normalized.length % 2 ? `${normalized}0` : normalized, "hex");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decodeUtf16Be(bytes.subarray(2));
  if (bytes.length >= 2 && bytes.every((byte, index) => index % 2 ? true : byte === 0)) {
    return String.fromCharCode(...Array.from({ length: bytes.length / 2 }, (_, index) => bytes[index * 2 + 1]));
  }
  return bytes.toString("utf8").replace(/\0/g, "");
}

function decodeUtf16Be(bytes) {
  return String.fromCharCode(...Array.from({ length: Math.floor(bytes.length / 2) }, (_, index) => (
    bytes[index * 2] << 8
  ) + bytes[index * 2 + 1]));
}

function startsTextBreak(text, index) {
  const tail = text.slice(index);
  return /^(?:\s*(?:Tj|TJ|["']|T\*|\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+T[dD]))\b/.test(tail);
}

function normalizeHex(value) {
  return String(value || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

function normalizePdfText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(isReadableLine)
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .filter(Boolean)
    .join("\n");
}

function isReadableLine(line) {
  if (!line || line.length < 3) return false;
  const controlCount = (line.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g) || []).length;
  if (controlCount / line.length > 0.05) return false;
  return /[\p{L}\d]/u.test(line);
}
