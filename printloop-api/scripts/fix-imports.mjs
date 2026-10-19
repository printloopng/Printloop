import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const replacements = [
  [/from\s+['"]\.\.\/entities\/([^'"]+)['"]/g, "from '@/database/entities/$1'"],
  [/from\s+['"]\.\.\/\.\.\/entities\/([^'"]+)['"]/g, "from '@/database/entities/$1'"],
  [/from\s+['"]\.\.\/services\/([^'"]+)['"]/g, "from '@/core/services/$1'"],
  [/from\s+['"]\.\.\/\.\.\/services\/([^'"]+)['"]/g, "from '@/core/services/$1'"],
  [/from\s+['"]\.\.\/middleware\/([^'"]+)['"]/g, "from '@/common/middleware/$1'"],
  [/from\s+['"]\.\.\/\.\.\/middleware\/([^'"]+)['"]/g, "from '@/common/middleware/$1'"],
  [/from\s+['"]\.\.\/utils\/([^'"]+)['"]/g, "from '@/core/utils/$1'"],
  [/from\s+['"]\.\.\/\.\.\/utils\/([^'"]+)['"]/g, "from '@/core/utils/$1'"],
  [/from\s+['"]\.\.\/workers\/([^'"]+)['"]/g, "from '@/workers/$1'"],
  [/from\s+['"]\.\.\/\.\.\/workers\/([^'"]+)['"]/g, "from '@/workers/$1'"],
  [/from\s+['"]\.\.\/config['"]/g, "from '@/config'"],
  [/from\s+['"]\.\.\/\.\.\/config['"]/g, "from '@/config'"],
  [/from\s+['"]\.\.\/config\/([^'"]+)['"]/g, "from '@/config/$1'"],
  [/import\(['"]\.\.\/entities\/([^'"]+)['"]\)/g, "import('@/database/entities/$1')"],
  [/import\(['"]\.\.\/services\/([^'"]+)['"]\)/g, "import('@/core/services/$1')"],
  [/import\(['"]\.\.\/middleware\/([^'"]+)['"]\)/g, "import('@/common/middleware/$1')"],
  [/import\(['"]\.\.\/utils\/([^'"]+)['"]\)/g, "import('@/core/utils/$1')"],
  [/import\(['"]\.\.\/workers\/([^'"]+)['"]\)/g, "import('@/workers/$1')"],
  [/import\(['"]\.\.\/config['"]\)/g, "import('@/config')"],
];

let changedFiles = 0;
for (const file of walk(srcRoot)) {
  let text = fs.readFileSync(file, "utf8");
  const orig = text;
  for (const [re, rep] of replacements) {
    text = text.replace(re, rep);
  }
  text = text.replace(
    /path\.dirname\(fileURLToPath\(import\.meta\.url\)\)/g,
    "__dirname",
  );
  text = text.replace(
    /fileURLToPath\(import\.meta\.url\)/g,
    "__filename",
  );
  text = text.replace(/import\.meta\.url/g, "__filename");
  if (text !== orig) {
    fs.writeFileSync(file, text);
    changedFiles++;
    console.log("fixed", path.relative(srcRoot, file));
  }
}
console.log(`Updated ${changedFiles} files`);
