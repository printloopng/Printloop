/**
 * One-shot: copy PrintLoop 01-backend domain files into printloop-api
 * neurapath-style layout, rewrite ESM `.js` imports → TS path aliases.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const oldRoot = path.resolve(apiRoot, "..", "01-backend");

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

function rewrite(content, kind) {
  let s = content;
  // Drop ESM .js suffixes in relative / alias imports
  s = s.replace(/(from\s+['"])([^'"]+)\.js(['"])/g, "$1$2$3");
  s = s.replace(/(import\s*\(\s*['"])([^'"]+)\.js(['"]\s*\))/g, "$1$2$3");

  // Remap common PrintLoop paths → new layout
  const map = [
    [/from\s+['"]\.\.\/\.\.\/entities\//g, "from '@/database/entities/"],
    [/from\s+['"]\.\.\/entities\//g, "from '@/database/entities/"],
    [/from\s+['"]\.\/entities\//g, "from '@/database/entities/"],
    [/from\s+['"]\.\.\/\.\.\/migrations\//g, "from '@/database/migrations/"],
    [/from\s+['"]\.\.\/migrations\//g, "from '@/database/migrations/"],
    [/from\s+['"]\.\.\/\.\.\/config\/database['"]/g, "from '@/config/data-source'"],
    [/from\s+['"]\.\.\/config\/database['"]/g, "from '@/config/data-source'"],
    [/from\s+['"]\.\/database['"]/g, "from '@/config/data-source'"],
    [/from\s+['"]\.\.\/\.\.\/config\/redis['"]/g, "from '@/config/redis'"],
    [/from\s+['"]\.\.\/config\/redis['"]/g, "from '@/config/redis'"],
    [/from\s+['"]\.\.\/\.\.\/config\/index['"]/g, "from '@/config'"],
    [/from\s+['"]\.\.\/config\/index['"]/g, "from '@/config'"],
    [/from\s+['"]\.\.\/\.\.\/config\/seed['"]/g, "from '@/database/seeders/seed'"],
    [/from\s+['"]\.\.\/config\/seed['"]/g, "from '@/database/seeders/seed'"],
    [/from\s+['"]\.\.\/\.\.\/config\/settings['"]/g, "from '@/config/settings'"],
    [/from\s+['"]\.\.\/config\/settings['"]/g, "from '@/config/settings'"],
    [/from\s+['"]\.\.\/\.\.\/middleware\//g, "from '@/common/middleware/"],
    [/from\s+['"]\.\.\/middleware\//g, "from '@/common/middleware/"],
    [/from\s+['"]\.\.\/\.\.\/utils\//g, "from '@/core/utils/"],
    [/from\s+['"]\.\.\/utils\//g, "from '@/core/utils/"],
    [/from\s+['"]\.\.\/\.\.\/services\//g, "from '@/core/services/"],
    [/from\s+['"]\.\.\/services\//g, "from '@/core/services/"],
    [/from\s+['"]\.\.\/\.\.\/workers\//g, "from '@/workers/"],
    [/from\s+['"]\.\.\/workers\//g, "from '@/workers/"],
    [/from\s+['"]\.\.\/\.\.\/controllers\//g, "from '@/modules/_shared/controllers/"],
    [/from\s+['"]\.\.\/controllers\//g, "from '@/modules/_shared/controllers/"],
    [/AppDataSource/g, "AppDataSource"], // keep name
  ];
  for (const [re, to] of map) s = s.replace(re, to);

  // Entity files often import siblings — keep relative within entities folder
  if (kind === "entity") {
    s = s.replace(/from\s+['"]\.\/([^'"]+)\.entity['"]/g, "from './$1.entity'");
  }
  return s;
}

function copyDir(relFrom, relTo, kind) {
  const from = path.join(oldRoot, relFrom);
  const to = path.join(apiRoot, "src", relTo);
  fs.mkdirSync(to, { recursive: true });
  const files = walk(from);
  for (const file of files) {
    const rel = path.relative(from, file);
    const dest = path.join(to, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const raw = fs.readFileSync(file, "utf8");
    fs.writeFileSync(dest, rewrite(raw, kind), "utf8");
  }
  console.log(`copied ${files.length} files → src/${relTo}`);
}

// Domain copies
copyDir("entities", "database/entities", "entity");
copyDir("migrations", "database/migrations", "migration");
copyDir("services", "core/services", "service");
copyDir("utils", "core/utils", "util");
copyDir("workers", "workers", "worker");
copyDir("controllers", "modules/_shared/controllers", "controller");
// PrintLoop middleware keeps its original filenames alongside neurapath ones.
copyDir("middleware", "common/middleware", "middleware");

// Config helpers that aren't the neurapath-style ones
for (const f of ["seed.ts", "settings.ts", "validateEnv.ts"]) {
  const src = path.join(oldRoot, "config", f);
  if (!fs.existsSync(src)) continue;
  const destDir =
    f === "seed.ts"
      ? path.join(apiRoot, "src", "database", "seeders")
      : path.join(apiRoot, "src", "config");
  fs.mkdirSync(destDir, { recursive: true });
  const destName = f === "seed.ts" ? "seed.ts" : f;
  fs.writeFileSync(
    path.join(destDir, destName),
    rewrite(fs.readFileSync(src, "utf8"), "config"),
    "utf8",
  );
  console.log(`copied config/${f}`);
}

// Route files → modules (product only; skip legacy admin + devApi)
const routeMap = {
  "discovery.routes.ts": "modules/public/routes/discovery.routes.ts",
  "publicBranding.routes.ts": "modules/public/routes/branding.routes.ts",
  "publicPricing.routes.ts": "modules/public/routes/pricing.routes.ts",
  "legal.routes.ts": "modules/public/routes/legal.routes.ts",
  "blog.routes.ts": "modules/public/routes/blog.routes.ts",
  "render.routes.ts": "modules/public/routes/render.routes.ts",
  "integrations.routes.ts": "modules/public/routes/integrations.routes.ts",
  "customerAuth.routes.ts": "modules/customer/routes/auth.routes.ts",
  "customerPrint.routes.ts": "modules/customer/routes/print.routes.ts",
  "payments.routes.ts": "modules/customer/routes/payments.routes.ts",
  "groupSession.routes.ts": "modules/customer/routes/groups.routes.ts",
  "preflight.routes.ts": "modules/customer/routes/preflight.routes.ts",
  "passwordReset.routes.ts": "modules/customer/routes/password-reset.routes.ts",
  "dispute.routes.ts": "modules/customer/routes/dispute.routes.ts",
  "saas.routes.ts": "modules/saas/routes/saas.routes.ts",
  "editor.routes.ts": "modules/saas/routes/editor.routes.ts",
  "admin-kiosk.routes.ts": "modules/saas/routes/kiosk-admin.routes.ts",
  "platform.routes.ts": "modules/platform/routes/platform.routes.ts",
  "printer.routes.ts": "modules/kiosk/routes/printer.routes.ts",
  "agent.routes.ts": "modules/kiosk/routes/agent.routes.ts",
  "participantUpload.routes.ts": "modules/kiosk/routes/participant-upload.routes.ts",
  "cups.routes.ts": "modules/kiosk/routes/cups.routes.ts",
  "files.routes.ts": "modules/global/routes/files.routes.ts",
  "openapi.ts": "modules/global/routes/openapi.routes.ts",
};

for (const [srcName, destRel] of Object.entries(routeMap)) {
  const src = path.join(oldRoot, "routes", srcName);
  if (!fs.existsSync(src)) {
    console.warn("missing route", srcName);
    continue;
  }
  const dest = path.join(apiRoot, "src", destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, rewrite(fs.readFileSync(src, "utf8"), "route"), "utf8");
  console.log(`route ${srcName} → ${destRel}`);
}

console.log("port complete");
