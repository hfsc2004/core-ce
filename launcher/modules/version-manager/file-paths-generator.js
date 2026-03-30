/**
 * Pseudo Science Fiction Core Collection - File Paths Document Generator
 * Builds FilePaths_<version>.md from current repository state.
 *
 * @module file-paths-generator
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 * @license SEE LICENSE.txt
 */

const fs = require('fs');
const path = require('path');

function toUnderscoreVersion(version) {
  return String(version || '').replace(/\./g, '_');
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'blobs',
  'manifests',
  '__pycache__',
  '.cache'
]);

function shouldSkipDirName(name) {
  if (!name) return true;
  if (name.startsWith('.')) return true;
  return SKIP_DIRS.has(name);
}

function shouldSkipPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  return (
    normalized.includes('/venv/') ||
    normalized.includes('/dist/') ||
    normalized.includes('/build/') ||
    normalized.includes('/.venv/') ||
    normalized.includes('/anythingllm/server/node_modules/') ||
    normalized.includes('/anythingllm/frontend/node_modules/') ||
    normalized.includes('/anythingllm/collector/node_modules/')
  );
}

function walkTree(baseDir, relativeDir = '', depth = 0, maxDepth = 6) {
  if (depth > maxDepth) return [];
  const fullDir = relativeDir ? path.join(baseDir, relativeDir) : baseDir;
  let entries = [];
  try {
    entries = fs.readdirSync(fullDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && !shouldSkipDirName(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = [];
  for (const d of dirs) {
    const rel = relativeDir ? path.join(relativeDir, d.name) : d.name;
    if (shouldSkipPath(rel)) continue;
    out.push({ type: 'dir', rel, depth });
    out.push(...walkTree(baseDir, rel, depth + 1, maxDepth));
  }
  for (const f of files) {
    const rel = relativeDir ? path.join(relativeDir, f.name) : f.name;
    if (shouldSkipPath(rel)) continue;
    out.push({ type: 'file', rel, depth });
  }
  return out;
}

function generateFilePathsDoc(projectRoot, newVersion, dateFormatted) {
  const versionUnderscore = toUnderscoreVersion(newVersion);
  const fileName = `FilePaths_${versionUnderscore}.md`;
  const filePath = path.join(projectRoot, fileName);
  const companion = `ProjectFiles_${versionUnderscore}.md`;

  const tree = walkTree(projectRoot, '', 0, 6);
  const lines = [
    '/**',
    ' * Pseudo Science Fiction Core Collection - File Structure',
    ` * Companion file: ${companion} for detailed descriptions`,
    ` * @version ${newVersion} - ${dateFormatted}`,
    ' */',
    '',
    '/{project root}'
  ];

  for (const node of tree) {
    const indent = '  '.repeat(node.depth + 1);
    const rel = node.rel.replace(/\\/g, '/');
    if (node.type === 'dir') {
      lines.push(`${indent}- ${rel}/`);
    } else {
      lines.push(`${indent}- ${rel}`);
    }
  }

  lines.push('', `*Version: ${newVersion}*`);
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  return { success: true, fileName, filePath };
}

module.exports = {
  generateFilePathsDoc
};

