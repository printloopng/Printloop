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

const TICKET = /V2-\d+|Dimension\s+\d+|BLACK-BOXES|HIDE DOWNLOAD URL/i;
const BANNER = /^\/\/\s*[─═━\-=*]{3,}|^\/\/\s*.*[─═━]{8,}/;
const KEEP = /eslint|@ts-|prettier-ignore|istanbul|c8 ignore/i;

let changed = 0;
let removed = 0;

for (const file of walk(root)) {
  const orig = fs.readFileSync(file, "utf8");
  const lines = orig.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (t.startsWith("//") && !KEEP.test(t)) {
      if (TICKET.test(t) || BANNER.test(t) || /[─═━]{5,}/.test(t)) {
        removed++;
        i++;
        continue;
      }
      let j = i;
      const block = [];
      while (
        j < lines.length &&
        lines[j].trim().startsWith("//") &&
        !KEEP.test(lines[j])
      ) {
        block.push(lines[j]);
        j++;
      }
      const text = block
        .map((l) => l.replace(/^\s*\/\/\s?/, ""))
        .join(" ");
      if (block.length >= 3 || text.length > 160) {
        removed += block.length;
        i = j;
        continue;
      }
    }

    out.push(raw);
    i++;
  }

  let src = out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+/, "");
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
  }
}

console.log(JSON.stringify({ changed, removed }));
