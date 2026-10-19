/**
 * Strip essay / ticket-noise comments from printloop-api/src.
 * Keeps short useful notes, eslint/ts directives, and license-ish one-liners.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "migrations") continue; // leave migration history alone
      walk(p, out);
    } else if (/\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

const NOISE_RE =
  /V2-\d+|BLACK-BOXES|Dimension\s+\d+|NDPR|GDPR\/NDPR|Fire-and-forget|fire-and-forget|Recommended provider|Idempotent boot|surfacing via|from BLACK|today's behaviour|docker-compose\.yml provisions|Provider-gated exactly|sealed converter|Bolt-style|mega-file|verraearth|neurapath-style/i;

function isNoiseBlock(body) {
  const text = body.replace(/^\s*\*\s?/gm, "").trim();
  if (text.length < 40) return false;
  if (NOISE_RE.test(text)) return true;
  // Long narrative JSDoc (> 280 chars of prose) without @param/@returns/@example
  if (text.length > 280 && !/@param|@returns|@example|@deprecated|@throws/.test(text)) {
    return true;
  }
  return false;
}

function isNoiseLine(line) {
  const t = line.trim();
  if (!t.startsWith("//")) return false;
  if (/eslint-disable|@ts-|prettier-ignore|webpack|istanbul|c8 ignore/i.test(t)) return false;
  // Section banners
  if (/^\/\/\s*[─═\-*=]{4,}/.test(t)) return true;
  if (/^\/\/\s*[━═]/.test(t)) return true;
  // Ticket / essay one-liners
  if (NOISE_RE.test(t) && t.length > 30) return true;
  // Pure decorative
  if (/^\/\/\s*$/.test(t)) return true;
  return false;
}

let filesChanged = 0;
let blocksRemoved = 0;
let linesRemoved = 0;

for (const file of walk(root)) {
  let src = fs.readFileSync(file, "utf8");
  const orig = src;

  // Remove /** ... */ and /* ... */ noise blocks (non-nested simple scan)
  src = src.replace(/\/\*\*?([\s\S]*?)\*\//g, (full, body) => {
    // Keep eslint / ts-expect style blocks
    if (/eslint|@ts-|istanbul|c8/.test(body)) return full;
    if (isNoiseBlock(body)) {
      blocksRemoved++;
      return "";
    }
    return full;
  });

  // Line-level noise
  const outLines = [];
  for (const line of src.split(/\r?\n/)) {
    if (isNoiseLine(line)) {
      linesRemoved++;
      continue;
    }
    outLines.push(line);
  }
  src = outLines.join("\n");

  // Collapse 3+ blank lines → 2
  src = src.replace(/\n{3,}/g, "\n\n");
  // Trim leading blank after removals at top of file
  src = src.replace(/^\s+/, "");

  if (src !== orig) {
    fs.writeFileSync(file, src);
    filesChanged++;
  }
}

console.log(
  JSON.stringify({ filesChanged, blocksRemoved, linesRemoved }, null, 2),
);
