/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE_GITIGNORE_BLOCK_START = '# --- PSF Workspace Git Exclusions (managed) ---';
const WORKSPACE_GITIGNORE_BLOCK_END = '# --- /PSF Workspace Git Exclusions ---';
const WORKSPACE_GITIGNORE_PATTERNS = [
  '/binaries/',
  '/models/*',
  '!/models/*.json',
  '!/models/*.js',
  '/models/psf-settings.json',
  '/launcher/node_modules/',
  '**/node_modules/',
  '.DS_Store'
];

function ensureWorkspaceGitignore(workspaceRoot) {
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  let existing = '';
  try {
    if (fs.existsSync(gitignorePath)) {
      existing = fs.readFileSync(gitignorePath, 'utf8');
    }
  } catch {
    return;
  }

  const managedBlock = [
    WORKSPACE_GITIGNORE_BLOCK_START,
    ...WORKSPACE_GITIGNORE_PATTERNS,
    WORKSPACE_GITIGNORE_BLOCK_END
  ].join('\n');

  if (existing.includes(WORKSPACE_GITIGNORE_BLOCK_START) && existing.includes(WORKSPACE_GITIGNORE_BLOCK_END)) {
    const replaced = existing.replace(
      new RegExp(
        `${escapeRegex(WORKSPACE_GITIGNORE_BLOCK_START)}[\\s\\S]*?${escapeRegex(WORKSPACE_GITIGNORE_BLOCK_END)}`,
        'm'
      ),
      managedBlock
    );
    if (replaced !== existing) {
      try { fs.writeFileSync(gitignorePath, replaced, 'utf8'); } catch {}
    }
    return;
  }

  const next = `${existing.replace(/\s*$/, '')}${existing.trim() ? '\n\n' : ''}${managedBlock}\n`;
  try { fs.writeFileSync(gitignorePath, next, 'utf8'); } catch {}
}

function getWorkspaceGitPolicy() {
  return {
    gitignorePatterns: [...WORKSPACE_GITIGNORE_PATTERNS],
    addAllExcludes: [
      '/binaries/**',
      '/models/<subdir>/**',
      '/launcher/node_modules/**',
      '**/node_modules/**',
      '/models/psf-settings.json'
    ],
    addAllIncludes: [
      '/launcher/**',
      '/compile-configs/**',
      '/*.md',
      '/*.sh',
      '/*.bat',
      '/*.py',
      '/models/*.json',
      '/models/*.js (except psf-settings.json)'
    ],
    note: 'Git status shows only changed/untracked files. Use trackedCount for total tracked files.'
  };
}

function listImmediateSubdirs(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

async function scanStagedFilesForSecrets(runGit, appDir, workspaceRoot, stagedFiles) {
  const suspiciousFiles = [];
  const maxFiles = 200;
  const toScan = stagedFiles.slice(0, maxFiles);
  const patterns = [
    /hf_(?!x{20,}\b)[A-Za-z0-9]{20,}/ig,
    /sk-(?!x{20,}\b)[A-Za-z0-9]{20,}/ig,
    /-----BEGIN (?:RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----/g,
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret)\b\s*[:=]\s*['"]?[A-Za-z0-9_\-]{12,}/ig
  ];

  for (const relPath of toScan) {
    const blob = await runGit(appDir, ['show', `:${relPath}`], { cwd: workspaceRoot, timeout: 12000, maxBuffer: 1024 * 1024 });
    if (!blob.success) continue;
    const text = String(blob.stdout || '');
    if (!text) continue;
    const hit = patterns.some((rx) => rx.test(text));
    patterns.forEach((rx) => { rx.lastIndex = 0; });
    if (hit) suspiciousFiles.push(relPath);
  }

  return {
    blocked: suspiciousFiles.length > 0,
    files: suspiciousFiles
  };
}

function listRootModelMetadataFiles(workspaceRoot) {
  try {
    const modelsDir = path.join(workspaceRoot, 'models');
    if (!fs.existsSync(modelsDir)) return [];
    return fs.readdirSync(modelsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => (name.endsWith('.json') || name.endsWith('.js')) && name !== 'psf-settings.json')
      .map((name) => path.posix.join('models', name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function normalizeWorkspaceRelPath(workspaceRoot, inputPath) {
  const raw = String(inputPath || '').trim();
  if (!raw) return '';
  if (raw.includes(' -> ')) return '';

  const normalized = raw.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return '';
  if (normalized.split('/').some((part) => part === '..')) return '';

  const absolute = path.resolve(workspaceRoot, normalized);
  const relative = path.relative(workspaceRoot, absolute).replace(/\\/g, '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return '';
  return relative;
}

function getTimestampForBranch() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sanitizeBranchPrefix(input) {
  return String(input || 'backup/pre-reset')
    .replace(/[^A-Za-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/-+/g, '-')
    .replace(/^\.+|\.+$/g, '') || 'backup/pre-reset';
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  WORKSPACE_GITIGNORE_BLOCK_START,
  WORKSPACE_GITIGNORE_BLOCK_END,
  WORKSPACE_GITIGNORE_PATTERNS,
  ensureWorkspaceGitignore,
  getWorkspaceGitPolicy,
  listImmediateSubdirs,
  scanStagedFilesForSecrets,
  listRootModelMetadataFiles,
  normalizeWorkspaceRelPath,
  getTimestampForBranch,
  sanitizeBranchPrefix
};
