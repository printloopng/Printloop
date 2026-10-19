/**
 * Strip block comments and full-line // comments (keep eslint/@ts directives).
 * Skips migrations.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "migrations") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

const KEEP = /eslint-disable|@ts-|prettier-ignore|istanbul|c8 ignore/i;

let filesChanged = 0;
let blocks = 0;
let lines = 0;

for (const file of walk(root)) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;

  src = src.replace(/\/\*[\s\S]*?\*\//g, (full) => {
    if (KEEP.test(full)) return full;
    blocks++;
    return "";
  });

  const out = [];
  for (const line of src.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("//") && !KEEP.test(t)) {
      lines++;
      continue;
    }
    out.push(line);
  }

  src = out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+/, "");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    filesChanged++;
  }
}

console.log(JSON.stringify({ filesChanged, blocks, lines }));
