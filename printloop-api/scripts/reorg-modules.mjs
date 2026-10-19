import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "src");

/** @type {Record<string, string>} serviceFile -> module name */
const OWNERS = {
  "payments.service.ts": "customer",
  "preflight.service.ts": "customer",
  "groupSession.service.ts": "customer",
  "abuseLimits.service.ts": "customer",
  "acceptWindow.service.ts": "customer",
  "promotion.service.ts": "customer",

  "pricing.service.ts": "public",
  "geocoding.service.ts": "public",
  "renderEnqueue.service.ts": "public",
  "documentConversion.service.ts": "public",
  "documentConvert.service.ts": "public",
  "qrCode.service.ts": "public",

  "onboarding.service.ts": "saas",
  "customDomain.service.ts": "saas",
  "statement.service.ts": "saas",
  "tenantExport.service.ts": "saas",
  "tenantDelete.service.ts": "saas",
  "tenantWebhook.service.ts": "saas",
  "tenantBalance.service.ts": "saas",
  "documentEditor.service.ts": "saas",
  "editorCollaboration.service.ts": "saas",
  "editorExport.service.ts": "saas",
  "etherpad.service.ts": "saas",
  "kiosk.service.ts": "saas",
  "kioskAlert.service.ts": "saas",
  "printerProfile.service.ts": "saas",
  "printerExtensions.service.ts": "saas",
  "payout.service.ts": "saas",
  "commission.service.ts": "saas",
  "costReconciliation.service.ts": "saas",
  "printPolicy.service.ts": "saas",

  "adminDashboard.service.ts": "platform",
  "backup.service.ts": "platform",

  "ipp.service.ts": "kiosk",
};

const CORE_KEEP = new Set([
  "email.service.ts",
  "sms.service.ts",
  "sentry.service.ts",
  "metrics.ts",
  "audit.service.ts",
  "paystack.service.ts",
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const coreDir = path.join(src, "core", "services");
const moved = [];

for (const [file, mod] of Object.entries(OWNERS)) {
  const from = path.join(coreDir, file);
  if (!fs.existsSync(from)) {
    console.warn("missing", file);
    continue;
  }
  const destDir = path.join(src, "modules", mod, "services");
  fs.mkdirSync(destDir, { recursive: true });
  const to = path.join(destDir, file);
  fs.renameSync(from, to);
  moved.push({ file, mod, base: file.replace(/\.ts$/, "") });
  console.log(`moved ${file} → modules/${mod}/services/`);
}

const files = walk(src);
let rewriteCount = 0;
for (const f of files) {
  let text = fs.readFileSync(f, "utf8");
  const orig = text;
  for (const { file, mod, base } of moved) {
    const oldPath = `@/core/services/${base}`;
    const newPath = `@/modules/${mod}/services/${base}`;
    text = text.split(oldPath).join(newPath);
    text = text.replace(
      new RegExp(`from ['"]\\.\\./services/${base.replace(".", "\\.")}['"]`, "g"),
      `from '${newPath}'`,
    );
  }
  if (text !== orig) {
    fs.writeFileSync(f, text);
    rewriteCount++;
  }
}

const shared = path.join(src, "modules", "_shared", "controllers");
const sharedMap = {
  "kiosk.controller.ts": ["saas", "kiosk.controller.ts"],
  "printerExtensions.controller.ts": ["saas", "printerExtensions.controller.ts"],
  "groupSession.controller.ts": ["customer", "groupSession.controller.ts"],
};
if (fs.existsSync(shared)) {
  for (const [name, [mod, destName]] of Object.entries(sharedMap)) {
    const from = path.join(shared, name);
    if (!fs.existsSync(from)) continue;
    const destDir = path.join(src, "modules", mod, "controllers");
    fs.mkdirSync(destDir, { recursive: true });
    let body = fs.readFileSync(from, "utf8");
    fs.writeFileSync(path.join(destDir, destName), body);
    fs.unlinkSync(from);
    console.log(`moved _shared/${name} → modules/${mod}/controllers/`);
  }
}

console.log(`\nMoved ${moved.length} services; rewrote imports in ${rewriteCount} files`);
console.log("Core remaining:", fs.readdirSync(coreDir).filter((f) => f.endsWith(".ts")));
