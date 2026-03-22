/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * compile-obfuscator-files.js
 * File scanning/copy helpers used by compile-obfuscator.
 */

const path = require('path');
const fs = require('fs');

function collectJsFiles(sourceDir, options = {}) {
  const {
    specificFilesOnly = true,
    filesToObfuscate = [],
    skipPatterns = []
  } = options;
  const filesToProcess = [];

  function walk(dir, relativePath = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relativePath, entry.name);

      if (skipPatterns.some((skip) => String(entry.name).includes(skip))) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
        continue;
      }

      if (!entry.name.endsWith('.js')) continue;
      if (specificFilesOnly && !filesToObfuscate.includes(entry.name)) continue;
      filesToProcess.push({ fullPath, relPath, name: entry.name });
    }
  }

  walk(sourceDir);
  return filesToProcess;
}

function copyNonJsFiles(sourceDir, outputDir, filesToObfuscate = []) {
  if (!fs.existsSync(sourceDir)) return;

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(outputDir, entry.name);

    if (entry.name === 'node_modules') continue;

    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyNonJsFiles(srcPath, destPath, filesToObfuscate);
      continue;
    }

    if (!entry.name.endsWith('.js')) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
      continue;
    }

    if (!filesToObfuscate.includes(entry.name)) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
      console.log(`[Obfuscator] Copied (unobfuscated): ${entry.name}`);
    }
  }
}

module.exports = {
  collectJsFiles,
  copyNonJsFiles
};

