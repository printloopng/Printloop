const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'src', 'mails');
const destDir = path.join(__dirname, '..', 'dist', 'mails');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(sourceDir)) {
  console.log(`Source directory ${sourceDir} does not exist. Skipping copy.`);
  process.exit(0);
}

try {
  copyRecursiveSync(sourceDir, destDir);
  console.log(`✅ Successfully copied ${sourceDir} to ${destDir}`);
} catch (error) {
  console.error(`❌ Error copying assets:`, error);
  process.exit(1);
}
