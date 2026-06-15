import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "scripts", "tests"];
const maxLines = 500;
const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(js|mjs|css|html)$/.test(path)) continue;
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n").length;
    if (lines > maxLines) problems.push(`${path}: ${lines} lines`);
  }
}

for (const root of roots) walk(root);

if (problems.length) {
  console.error(`Files over ${maxLines} lines:\n${problems.join("\n")}`);
  process.exit(1);
}

console.log("File size policy: ok");
