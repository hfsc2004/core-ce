/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Compile manager edition policy and packaging validation helpers.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const EDITION_COPY_POLICIES = Object.freeze({
  standard: {
    coreFiles: [
      'src/index.html',
      'src/loading.html',
      'src/terminal.html',
      'src/terminal-renderer.js',
      'src/styles-standard.css',
      'src/filter-buttons.css'
    ],
    preloadPrimary: 'preload-standard.js',
    preloadFallback: 'preload.js',
    rendererFiles: [
      'delete-data.js',
      'globals.js',
      'hardware-detect.js',
      'license-modal.js',
      'model-actions.js',
      'model-browser.js',
      'screen-navigation.js',
      'utilities.js',
      'webui-launcher.js'
    ],
    rootFiles: [
      {
        src: 'session-manager-standard.js',
        dest: 'session-manager-standard.js',
        required: false,
        logSuccess: 'Copied: session-manager-standard.js (BMOC-Lite)'
      },
      {
        src: 'webui-launcher-standard.js',
        dest: 'webui-launcher-standard.js',
        required: false,
        logSuccess: 'Copied: webui-launcher-standard.js'
      },
      {
        src: 'anythingllm-launcher-standard.js',
        dest: 'anythingllm-launcher-standard.js',
        required: false,
        logSuccess: 'Copied: anythingllm-launcher-standard.js'
      }
    ],
    moduleDirs: [
      {
        src: 'modules/port-pool',
        dest: 'modules/port-pool',
        filesOnly: true
      }
    ],
    forbiddenPaths: [
      'src/index-developer.html',
      'src/coding-terminal.html',
      'src/coding-terminal-renderer.js',
      'src/coding-terminal-renderer-chat.js',
      'src/coding-terminal-renderer-rag.js',
      'src/coding-terminal-renderer-git.js',
      'src/moe-chat-renderer.js'
    ],
    forbiddenRegexes: [
      /^src\/renderer\/renderer-developer(?:\/|$)/,
      /^modules\/coding-terminal(?:\/|$)/,
      /^modules\/moe(?:\/|$)/,
      /^modules\/dispatcher(?:\/|$)/
    ]
  }
});

function normalizeEdition(edition) {
  const raw = String(edition || 'standard').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (raw === 'std') return 'standard';
  return raw || 'standard';
}

function getEditionCopyPolicy(edition) {
  const normalizedEdition = normalizeEdition(edition);
  const policy = EDITION_COPY_POLICIES[normalizedEdition];

  if (!policy) {
    const available = Object.keys(EDITION_COPY_POLICIES).join(', ');
    throw new Error(`Unsupported compile edition "${normalizedEdition}". Available editions: ${available}`);
  }

  return { edition: normalizedEdition, policy };
}

function listRelativeFilesRecursive(rootDir, currentDir = rootDir, files = []) {
  if (!fs.existsSync(currentDir)) return files;

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      listRelativeFilesRecursive(rootDir, fullPath, files);
      continue;
    }
    if (entry.isFile()) {
      const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      files.push(relPath);
    }
  }

  return files;
}

function verifyEditionPackaging(appDir, options = {}, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
  };

  const { edition, policy } = getEditionCopyPolicy(options.edition || 'standard');
  const violations = new Set();

  for (const relPath of policy.forbiddenPaths || []) {
    if (fs.existsSync(path.join(appDir, relPath))) {
      violations.add(relPath);
    }
  }

  const bundledFiles = listRelativeFilesRecursive(appDir);
  for (const relPath of bundledFiles) {
    for (const regex of policy.forbiddenRegexes || []) {
      if (regex.test(relPath)) {
        violations.add(relPath);
      }
    }
  }

  if (violations.size > 0) {
    const lines = Array.from(violations).sort().map((v) => `- ${v}`).join('\n');
    throw new Error(`[Compile Manager] Edition packaging violation (${edition})\n${lines}`);
  }

  sendProgress('Edition packaging verified', 96, `${edition}: no forbidden modules detected`);
  return { success: true, edition, scannedFiles: bundledFiles.length };
}

module.exports = {
  normalizeEdition,
  getEditionCopyPolicy,
  listRelativeFilesRecursive,
  verifyEditionPackaging
};
