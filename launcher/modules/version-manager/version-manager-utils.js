/**
 * Version manager utilities.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./version-manager-config');

function isValidVersion(version) {
  const pattern = /^\d+\.\d+\.\d+[a-z]?$/;
  return pattern.test(version);
}

function shouldSkipFile(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  
  // Skip explicitly excluded files
  if (config.SKIP_FILES.includes(fileName)) {
    return true;
  }
  
  // Skip non-taggable extensions
  if (!config.TAGGABLE_EXTENSIONS.includes(ext)) {
    return true;
  }

  // Skip third-party/vendor/minified paths
  if (Array.isArray(config.SKIP_PATH_PATTERNS)) {
    for (const pattern of config.SKIP_PATH_PATTERNS) {
      try {
        if (pattern && pattern.test && pattern.test(filePath)) {
          return true;
        }
      } catch {
        // Ignore malformed pattern entries
      }
    }
  }
  
  // Skip if in excluded directory
  for (const skipDir of config.SKIP_DIRECTORIES) {
    if (filePath.includes(path.sep + skipDir + path.sep) || filePath.includes('/' + skipDir + '/')) {
      return true;
    }
  }
  
  return false;
}

function findTaggableFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }
  
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    // Skip hidden files and excluded directories
    if (file.startsWith('.') || config.SKIP_DIRECTORIES.includes(file)) {
      continue;
    }
    
    const filePath = path.join(dir, file);
    
    try {
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        findTaggableFiles(filePath, fileList);
      } else if (!shouldSkipFile(filePath)) {
        fileList.push(filePath);
      }
    } catch (err) {
      // Skip files we can't stat
      console.warn(`[Version Manager] Could not stat: ${filePath}`);
    }
  }
  
  return fileList;
}

function versionToUnderscore(version) {
  return version.replace(/\./g, '_');
}

function renameVersionedDocuments(projectRoot, newVersion, previousVersion = null) {
  const results = [];
  const files = fs.readdirSync(projectRoot)
    .filter((name) => /\.md$/i.test(name));

  const newVersionUnderscore = versionToUnderscore(newVersion);
  const fromDot = String(previousVersion || '').trim();
  const fromUnderscore = fromDot ? versionToUnderscore(fromDot) : '';

  const buildTargetName = (fileName) => {
    if (fromUnderscore && fileName.includes(fromUnderscore)) {
      return fileName.replace(fromUnderscore, newVersionUnderscore);
    }
    if (fromDot && fileName.includes(fromDot)) {
      return fileName.replace(fromDot, newVersion);
    }

    if (/\d+_\d+_\d+[a-z]?/i.test(fileName)) {
      return fileName.replace(/\d+_\d+_\d+[a-z]?/i, newVersionUnderscore);
    }
    if (/\d+\.\d+\.\d+[a-z]?/i.test(fileName)) {
      return fileName.replace(/\d+\.\d+\.\d+[a-z]?/i, newVersion);
    }
    return fileName;
  };

  for (const file of files) {
    const newFileName = buildTargetName(file);

    if (!newFileName || newFileName === file) {
      continue;
    }

    const oldPath = path.join(projectRoot, file);
    const newPath = path.join(projectRoot, newFileName);
    if (fs.existsSync(newPath)) {
      console.warn('[Version Manager] Skipping markdown rename; target exists: ' + newFileName);
      continue;
    }

    fs.renameSync(oldPath, newPath);
    results.push({
      oldName: file,
      newName: newFileName,
      message: 'Renamed ' + file + ' -> ' + newFileName
    });
  }

  return results;
}

function renameFilePathsDocument(projectRoot, newVersion) {
  const results = renameVersionedDocuments(projectRoot, newVersion);
  return results.length > 0 ? results[0] : null;
}

function rewriteAbsoluteWorkspacePaths(projectRoot, targetRoot = projectRoot) {
  const currentRoot = String(projectRoot || '').replace(/\\/g, '/');
  const replacementRoot = String(targetRoot || projectRoot || '').replace(/\\/g, '/');
  const result = { scanned: 0, updated: 0, files: [] };
  if (!currentRoot || !replacementRoot) return result;

  const candidates = [];

  const pushIfExists = (filePath) => {
    if (fs.existsSync(filePath)) candidates.push(filePath);
  };

  pushIfExists(path.join(projectRoot, 'launcher', 'config', 'coding-terminal.json'));

  const manifestsDir = path.join(projectRoot, 'models', 'manifests', 'registry.ollama.ai', 'library');
  if (fs.existsSync(manifestsDir)) {
    const modelDirs = fs.readdirSync(manifestsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(manifestsDir, d.name, 'latest'));
    for (const file of modelDirs) {
      pushIfExists(file);
    }
  }

  const pyWebUiDir = path.join(projectRoot, 'binaries', 'python-webui');
  if (fs.existsSync(pyWebUiDir)) {
    const stack = [pyWebUiDir];
    while (stack.length > 0) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (entry.isFile() && entry.name.toLowerCase() === 'pyvenv.cfg') {
          candidates.push(full);
        }
      }
    }
  }

  const anythingDir = path.join(projectRoot, 'binaries', 'anythingllm');
  if (fs.existsSync(anythingDir)) {
    const envCandidates = [
      path.join(anythingDir, '.env'),
      path.join(anythingDir, 'server', '.env'),
      path.join(anythingDir, 'frontend', '.env'),
      path.join(anythingDir, 'collector', '.env')
    ];
    for (const envFile of envCandidates) {
      pushIfExists(envFile);
    }
  }

  const llamaDir = path.join(projectRoot, 'binaries', 'llama.cpp');
  if (fs.existsSync(llamaDir)) {
    let platformDirs = [];
    try {
      platformDirs = fs.readdirSync(llamaDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {
      platformDirs = [];
    }
    for (const dirent of platformDirs) {
      pushIfExists(path.join(llamaDir, dirent.name, 'build', 'CMakeCache.txt'));
    }
  }

  const workRootRegex = /\/[^\s"'`]*PSF_Offline_[0-9]+\.[0-9]+\.[0-9]+[a-z]?_WORK/gi;

  for (const filePath of candidates) {
    result.scanned += 1;
    let original = '';
    try {
      original = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const rewritten = original.replace(workRootRegex, (matched) => {
      const normalized = String(matched || '').replace(/\\/g, '/');
      return normalized === replacementRoot ? matched : replacementRoot;
    });
    if (rewritten !== original) {
      try {
        fs.writeFileSync(filePath, rewritten, 'utf8');
        result.updated += 1;
        result.files.push(path.relative(projectRoot, filePath));
      } catch {
        // Ignore write failures and continue migration.
      }
    }
  }

  return result;
}

function rewriteCodexSessionPaths(projectRoot, targetRoot = projectRoot) {
  const currentRoot = String(projectRoot || '').replace(/\\/g, '/');
  const replacementRoot = String(targetRoot || projectRoot || '').replace(/\\/g, '/');
  const result = { scanned: 0, updated: 0, files: [] };
  if (!currentRoot || !replacementRoot || currentRoot === replacementRoot) return result;

  const toNorm = (value) => String(value || '').replace(/\\/g, '/');
  const addUnique = (list, value) => {
    const normalized = toNorm(value);
    if (!normalized) return;
    if (!list.includes(normalized)) list.push(normalized);
  };

  const sourceRoots = [];
  const targetRoots = [];
  addUnique(sourceRoots, currentRoot);
  addUnique(targetRoots, replacementRoot);
  try { addUnique(sourceRoots, fs.realpathSync(currentRoot)); } catch {}
  try { addUnique(targetRoots, fs.realpathSync(replacementRoot)); } catch {}

  const replacementPairs = [];
  for (const src of sourceRoots) {
    if (targetRoots.includes(src)) continue;
    replacementPairs.push({ src, dst: replacementRoot });
  }
  if (replacementPairs.length === 0) return result;

  const codexDir = path.join(os.homedir(), '.codex');
  const sessionsDir = path.join(codexDir, 'sessions');
  if (!fs.existsSync(codexDir)) return result;

  const files = [];
  const pushIfExists = (filePath) => {
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) files.push(filePath);
    } catch {
      // ignore
    }
  };

  pushIfExists(path.join(codexDir, 'history.jsonl'));
  pushIfExists(path.join(codexDir, 'config.toml'));

  if (fs.existsSync(sessionsDir)) {
    const stack = [sessionsDir];
    while (stack.length > 0) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!entry.isFile()) continue;
        const name = String(entry.name || '');
        if (name.endsWith('.jsonl') || name.includes('.jsonl.bak-')) {
          files.push(full);
        }
      }
    }
  }

  const replaceRootInString = (value) => {
    const normalized = String(value || '').replace(/\\/g, '/');
    if (!normalized) return { value, changed: false };
    let changed = false;
    let rewritten = normalized;
    for (const pair of replacementPairs) {
      if (!rewritten.includes(pair.src)) continue;
      rewritten = rewritten.split(pair.src).join(pair.dst);
      changed = true;
    }
    return changed ? { value: rewritten, changed: true } : { value, changed: false };
  };

  const rewriteDeep = (node) => {
    if (typeof node === 'string') {
      return replaceRootInString(node);
    }
    if (Array.isArray(node)) {
      let changed = false;
      const next = node.map((item) => {
        const migrated = rewriteDeep(item);
        if (migrated.changed) changed = true;
        return migrated.value;
      });
      return changed ? { value: next, changed: true } : { value: node, changed: false };
    }
    if (node && typeof node === 'object') {
      let changed = false;
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        const migrated = rewriteDeep(value);
        if (migrated.changed) changed = true;
        out[key] = migrated.value;
      }
      return changed ? { value: out, changed: true } : { value: node, changed: false };
    }
    return { value: node, changed: false };
  };

  const migrateJsonlLine = (line) => {
    if (!line || !line.trim()) return { line, changed: false };
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      return { line, changed: false };
    }
    const migrated = rewriteDeep(obj);
    if (!migrated.changed) return { line, changed: false };
    return { line: JSON.stringify(migrated.value), changed: true };
  };

  const dedupeCodexProjectTables = (content) => {
    const text = String(content || '');
    if (!text) return { value: text, changed: false };
    const lines = text.split('\n');
    const out = [];
    const seenProjectTables = new Set();
    const projectHeader = /^\s*\[projects\."([^"]+)"\]\s*$/;
    let changed = false;

    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      const match = projectHeader.exec(line);
      if (!match) {
        out.push(line);
        i += 1;
        continue;
      }

      const key = String(match[1] || '');
      let j = i + 1;
      while (j < lines.length && !/^\s*\[/.test(lines[j])) j += 1;
      const block = lines.slice(i, j);
      if (seenProjectTables.has(key)) {
        changed = true;
      } else {
        seenProjectTables.add(key);
        out.push(...block);
      }
      i = j;
    }

    const value = out.join('\n');
    return { value, changed: changed || value !== text };
  };

  for (const filePath of files) {
    result.scanned += 1;
    let original = '';
    try {
      original = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const isConfigToml = path.basename(filePath) === 'config.toml';
    const hasAnySource = replacementPairs.some((pair) => original.includes(pair.src));
    if (!hasAnySource && !isConfigToml) continue;

    let rewritten = original;
    let fileChanged = false;

    if (isConfigToml) {
      const migrated = replaceRootInString(original);
      const deduped = dedupeCodexProjectTables(String(migrated.value || ''));
      rewritten = String(deduped.value || '');
      fileChanged = Boolean(migrated.changed || deduped.changed);
    } else if (filePath.endsWith('.jsonl') || filePath.includes('.jsonl.bak-')) {
      rewritten = original.split('\n').map((line) => {
        const migrated = migrateJsonlLine(line);
        if (migrated.changed) fileChanged = true;
        return migrated.line;
      }).join('\n');
    } else {
      const migrated = replaceRootInString(original);
      rewritten = String(migrated.value || '');
      fileChanged = migrated.changed;
    }

    if (!fileChanged || rewritten === original) continue;

    try {
      fs.writeFileSync(filePath, rewritten, 'utf8');
      result.updated += 1;
      result.files.push(filePath);
    } catch {
      // Best effort only.
    }
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  isValidVersion,
  shouldSkipFile,
  findTaggableFiles,
  renameFilePathsDocument,
  renameVersionedDocuments,
  versionToUnderscore,
  rewriteAbsoluteWorkspacePaths,
  rewriteCodexSessionPaths
};
