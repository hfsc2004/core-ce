/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Project/Editor IPC Tools
 */

function createEditorTools(deps = {}) {
  const {
    codingTerminalCommon,
    fs,
    path
  } = deps;

  async function handleSetProject(_event, projectPath) {
    codingTerminalCommon.setProject(projectPath);
    return { success: true, path: projectPath };
  }

  async function handleGetProject() {
    return codingTerminalCommon.getProject();
  }

  async function handleEditorListFiles(_event, options = {}) {
    try {
      const projectPath = codingTerminalCommon.getProject();
      if (!projectPath) {
        return { success: false, error: 'No project attached.' };
      }

      const maxFiles = Math.max(50, Math.min(Number(options.maxFiles) || 2000, 5000));
      const maxDepth = Math.max(1, Math.min(Number(options.maxDepth) || 12, 24));
      const includeHidden = !!options.includeHidden;
      const files = listProjectFiles(projectPath, { maxFiles, maxDepth, includeHidden });
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function handleEditorReadFile(_event, relativePath) {
    try {
      const projectPath = codingTerminalCommon.getProject();
      if (!projectPath) {
        return { success: false, error: 'No project attached.' };
      }

      const resolved = resolveProjectFile(projectPath, relativePath);
      if (!resolved.success) {
        return { success: false, error: resolved.error };
      }

      const stat = fs.statSync(resolved.path);
      if (!stat.isFile()) {
        return { success: false, error: 'Path is not a file.' };
      }
      if (stat.size > 1024 * 1024) {
        return { success: false, error: 'File is too large for editor view (max 1MB).' };
      }

      const content = fs.readFileSync(resolved.path, 'utf8');
      return {
        success: true,
        file: {
          relativePath: resolved.relativePath,
          absolutePath: resolved.path,
          size: stat.size,
          content
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function handleEditorSaveFile(_event, payload = {}) {
    try {
      const projectPath = codingTerminalCommon.getProject();
      if (!projectPath) {
        return { success: false, error: 'No project attached.' };
      }

      const resolved = resolveProjectFile(projectPath, payload.relativePath);
      if (!resolved.success) {
        return { success: false, error: resolved.error };
      }

      const text = typeof payload.content === 'string' ? payload.content : '';
      if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) {
        return { success: false, error: 'Edited content exceeds 1MB limit.' };
      }

      fs.writeFileSync(resolved.path, text, 'utf8');
      const stat = fs.statSync(resolved.path);
      return {
        success: true,
        file: {
          relativePath: resolved.relativePath,
          absolutePath: resolved.path,
          size: stat.size
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function listProjectFiles(projectPath, options = {}) {
    const maxFiles = Math.max(50, Math.min(Number(options.maxFiles) || 2000, 5000));
    const maxDepth = Math.max(1, Math.min(Number(options.maxDepth) || 12, 24));
    const includeHidden = !!options.includeHidden;
    const skipDirs = new Set([
      'node_modules', '.git', 'dist', 'build', '.next', '.cache', '.venv', 'venv',
      '.idea', '.vscode', 'binaries', 'coverage'
    ]);

    const result = [];
    const stack = [{ dir: projectPath, depth: 0 }];
    while (stack.length > 0 && result.length < maxFiles) {
      const current = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (result.length >= maxFiles) break;
        if (!includeHidden && entry.name.startsWith('.')) continue;
        const full = path.join(current.dir, entry.name);
        if (entry.isDirectory()) {
          if (skipDirs.has(entry.name)) continue;
          if (current.depth + 1 <= maxDepth) {
            stack.push({ dir: full, depth: current.depth + 1 });
          }
          continue;
        }
        if (!entry.isFile()) continue;
        const rel = path.relative(projectPath, full);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
        result.push(rel.replace(/\\/g, '/'));
      }
    }

    result.sort((a, b) => a.localeCompare(b));
    return result;
  }

  function resolveProjectFile(projectPath, inputPath) {
    const raw = String(inputPath || '').trim();
    if (!raw) {
      return { success: false, error: 'Missing file path.' };
    }

    const normalized = raw.replace(/\\/g, '/');
    const candidate = path.isAbsolute(normalized)
      ? path.normalize(normalized)
      : path.join(projectPath, normalized);
    if (!isPathInsideProject(candidate, projectPath)) {
      return { success: false, error: 'Path is outside attached project.' };
    }
    if (!fs.existsSync(candidate)) {
      return { success: false, error: `File not found: ${normalized}` };
    }

    return {
      success: true,
      path: candidate,
      relativePath: (path.relative(projectPath, candidate) || path.basename(candidate)).replace(/\\/g, '/')
    };
  }

  function isPathInsideProject(candidatePath, projectPath) {
    try {
      const rel = path.relative(projectPath, candidatePath);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    } catch {
      return false;
    }
  }

  return {
    handleSetProject,
    handleGetProject,
    handleEditorListFiles,
    handleEditorReadFile,
    handleEditorSaveFile
  };
}

module.exports = createEditorTools;
