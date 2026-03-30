/**
 * Coding Terminal deterministic tool helpers.
 */
'use strict';

function createDeterministicToolHelpers(deps = {}) {
  const fs = deps.fs;
  const path = deps.path;
  const execFileSync = typeof deps.execFileSync === 'function' ? deps.execFileSync : null;
  const emitPlanTrace = typeof deps.emitPlanTrace === 'function' ? deps.emitPlanTrace : () => {};
  const languageFromFilename = typeof deps.languageFromFilename === 'function' ? deps.languageFromFilename : () => 'text';

  function isToolRunTestsRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\btool\.run_tests\b|\brun tests with tool\b|\btool\.verify\b/.test(text);
  }

  function isToolReadFileRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\btool\.read_file\b/.test(text);
  }

  function isToolWriteFileRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\btool\.write_file\b/.test(text);
  }

  function isToolListFilesRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\btool\.list_files\b/.test(text);
  }

  function isToolSearchCodeRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\btool\.search_code\b/.test(text);
  }

  function isToolReadFileChunkRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\btool\.read_file_chunk\b/.test(text);
  }

  function isToolApplyPatchRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\btool\.apply_patch\b/.test(text);
  }

  function isToolVerifyRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\btool\.verify\b/.test(text);
  }

  function parseToolPathArg(message) {
    const input = String(message || '');
    const direct = input.match(/\bpath\s*[:=]\s*([^\s\n]+)/i);
    if (direct && direct[1]) return String(direct[1]).trim().replace(/^["']|["']$/g, '');
    const quoted = input.match(/\btool\.(?:read_file|write_file)\b[\s:,-]*["']([^"']+)["']/i);
    if (quoted && quoted[1]) return String(quoted[1]).trim();
    return '';
  }

  function extractFirstFencedBlock(message) {
    const input = String(message || '');
    const m = input.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```/);
    if (!m || !m[1]) return '';
    return String(m[1]);
  }

  function parseKeyValueArg(message, key) {
    const input = String(message || '');
    const pattern = new RegExp(`\\b${String(key || '').replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*[:=]\\s*([^\\s\\n]+)`, 'i');
    const match = input.match(pattern);
    if (!match || !match[1]) return '';
    return String(match[1]).trim().replace(/^["']|["']$/g, '');
  }

  function parseIntArg(message, key, fallback) {
    const raw = parseKeyValueArg(message, key);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  function parseBoolArg(message, key, fallback = false) {
    const raw = parseKeyValueArg(message, key).toLowerCase();
    if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
    if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
    return fallback;
  }

  function extractInlineToolJson(message, toolName) {
    const input = String(message || '');
    const marker = `tool.${String(toolName || '').trim()} `;
    const idx = input.toLowerCase().indexOf(marker.toLowerCase());
    if (idx < 0) return null;
    const tail = input.slice(idx + marker.length).trim();
    if (!tail.startsWith('{')) return null;
    try {
      return JSON.parse(tail);
    } catch {
      return null;
    }
  }

  function resolveProjectFilePath(projectPath, requestedPath) {
    const root = String(projectPath || '').trim();
    const req = String(requestedPath || '').trim();
    if (!root || !req) return { ok: false, error: 'project root or path missing' };
    if (!fs.existsSync(root)) return { ok: false, error: 'project root not found' };
    const rootResolved = path.resolve(root);
    const abs = path.resolve(rootResolved, req);
    const inside = abs === rootResolved || abs.startsWith(`${rootResolved}${path.sep}`);
    if (!inside) return { ok: false, error: 'path escapes project root' };
    return {
      ok: true,
      absolutePath: abs,
      relativePath: path.relative(rootResolved, abs).split(path.sep).join('/')
    };
  }

  function resolveProjectDirPath(projectPath, requestedPath = '.') {
    const root = String(projectPath || '').trim();
    const req = String(requestedPath || '.').trim() || '.';
    if (!root) return { ok: false, error: 'project root missing' };
    if (!fs.existsSync(root)) return { ok: false, error: 'project root not found' };
    const rootResolved = path.resolve(root);
    const abs = path.resolve(rootResolved, req);
    const inside = abs === rootResolved || abs.startsWith(`${rootResolved}${path.sep}`);
    if (!inside) return { ok: false, error: 'path escapes project root' };
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      return { ok: false, error: `directory not found (${req})` };
    }
    return {
      ok: true,
      absolutePath: abs,
      relativePath: path.relative(rootResolved, abs).split(path.sep).join('/') || '.',
      projectRoot: rootResolved
    };
  }

  function listFilesRecursive(dirPath, options = {}) {
    const maxDepth = Math.max(0, Math.min(Number(options.maxDepth) || 2, 8));
    const limit = Math.max(1, Math.min(Number(options.limit) || 200, 2000));
    const glob = String(options.glob || '').trim();
    const out = [];
    const stack = [{ dir: dirPath, depth: 0 }];
    while (stack.length > 0 && out.length < limit) {
      const current = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const full = path.join(current.dir, entry.name);
        if (entry.isDirectory()) {
          if (current.depth < maxDepth) {
            stack.push({ dir: full, depth: current.depth + 1 });
          }
          continue;
        }
        if (!entry.isFile()) continue;
        if (glob) {
          const bare = glob.replace(/\*/g, '').toLowerCase();
          if (bare && !entry.name.toLowerCase().includes(bare)) continue;
        }
        out.push(full);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  function normalizeRel(root, fullPath) {
    return (path.relative(root, fullPath) || path.basename(fullPath)).split(path.sep).join('/');
  }

  function runProjectTests(projectPath) {
    if (!execFileSync) {
      return { ok: false, label: 'tests', output: 'execFileSync unavailable in deterministic helper.' };
    }
    const root = String(projectPath || '').trim();
    if (!root || !fs.existsSync(root)) {
      return { ok: false, label: 'tests', output: 'Project root is not set or does not exist.' };
    }
    const hasPy = fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'));
    const hasNode = fs.existsSync(path.join(root, 'package.json'));
    let cmd = '';
    if (hasPy) cmd = 'python3 -m pytest -q';
    else if (hasNode) cmd = 'npm test --silent';
    else cmd = 'python3 -m pytest -q';
    try {
      const out = execFileSync('/bin/bash', ['-lc', cmd], {
        cwd: root,
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 4 * 1024 * 1024
      });
      return {
        ok: true,
        label: cmd,
        output: String(out || '').trim() || '(no output)'
      };
    } catch (err) {
      const stdout = String(err?.stdout || '');
      const stderr = String(err?.stderr || '');
      const msg = String(err?.message || '');
      const merged = [stdout, stderr, msg].filter(Boolean).join('\n').trim();
      return {
        ok: false,
        label: cmd,
        output: merged || 'test command failed'
      };
    }
  }

  function buildDeterministicToolRunTests({ message, projectPath = '' } = {}) {
    if (!isToolRunTestsRequest(message)) return null;
    const run = runProjectTests(projectPath);
    emitPlanTrace('tool.run_tests', {
      ok: !!run.ok,
      label: run.label || '',
      outputHead: String(run.output || '').slice(0, 280)
    });
    return {
      content:
        `Tool run_tests: ${run.ok ? 'PASS' : 'FAIL'}\n` +
        `Command: ${run.label || '(none)'}\n\n` +
        `${String(run.output || '').slice(0, 12000)}`,
      sources: []
    };
  }

  function buildDeterministicToolReadFile({ message, projectPath = '' } = {}) {
    if (!isToolReadFileRequest(message)) return null;
    const requested = parseToolPathArg(message);
    if (!requested) {
      return {
        content: 'Tool read_file: FAIL\nReason: missing path. Use: tool.read_file path=relative/path.ext',
        sources: []
      };
    }
    const resolved = resolveProjectFilePath(projectPath, requested);
    if (!resolved.ok) {
      return {
        content: `Tool read_file: FAIL\nReason: ${resolved.error}`,
        sources: []
      };
    }
    if (!fs.existsSync(resolved.absolutePath) || !fs.statSync(resolved.absolutePath).isFile()) {
      return {
        content: `Tool read_file: FAIL\nReason: file not found (${resolved.relativePath})`,
        sources: []
      };
    }
    let content = '';
    try {
      content = fs.readFileSync(resolved.absolutePath, 'utf8');
    } catch (err) {
      return {
        content: `Tool read_file: FAIL\nReason: ${String(err?.message || 'unable to read file')}`,
        sources: []
      };
    }
    emitPlanTrace('tool.read_file', {
      path: resolved.relativePath,
      bytes: Buffer.byteLength(content || '', 'utf8')
    });
    return {
      content:
        `Tool read_file: PASS\nPath: ${resolved.relativePath}\n\n` +
        `~~~${languageFromFilename(resolved.relativePath)}\n${String(content || '').slice(0, 200000)}\n~~~`,
      sources: []
    };
  }

  function buildDeterministicToolWriteFile({ message, projectPath = '' } = {}) {
    if (!isToolWriteFileRequest(message)) return null;
    const requested = parseToolPathArg(message);
    if (!requested) {
      return {
        content: 'Tool write_file: FAIL\nReason: missing path. Use: tool.write_file path=relative/path.ext + fenced content.',
        sources: []
      };
    }
    const nextContent = extractFirstFencedBlock(message);
    if (!nextContent) {
      return {
        content: 'Tool write_file: FAIL\nReason: missing fenced content block.',
        sources: []
      };
    }
    const resolved = resolveProjectFilePath(projectPath, requested);
    if (!resolved.ok) {
      return {
        content: `Tool write_file: FAIL\nReason: ${resolved.error}`,
        sources: []
      };
    }
    try {
      const dir = path.dirname(resolved.absolutePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolved.absolutePath, nextContent, 'utf8');
    } catch (err) {
      return {
        content: `Tool write_file: FAIL\nReason: ${String(err?.message || 'unable to write file')}`,
        sources: []
      };
    }
    emitPlanTrace('tool.write_file', {
      path: resolved.relativePath,
      bytes: Buffer.byteLength(nextContent || '', 'utf8')
    });
    return {
      content:
        `Tool write_file: PASS\nPath: ${resolved.relativePath}\nBytes: ${Buffer.byteLength(nextContent || '', 'utf8')}`,
      sources: []
    };
  }

  function buildDeterministicToolListFiles({ message, projectPath = '' } = {}) {
    if (!isToolListFilesRequest(message)) return null;
    const inline = extractInlineToolJson(message, 'list_files') || {};
    const targetPath = String(inline.path || parseKeyValueArg(message, 'path') || '.').trim() || '.';
    const maxDepth = Math.max(0, Math.min(Number(inline.max_depth ?? parseIntArg(message, 'max_depth', 2)), 8));
    const limit = Math.max(1, Math.min(Number(inline.limit ?? parseIntArg(message, 'limit', 200)), 2000));
    const glob = String(inline.glob || parseKeyValueArg(message, 'glob') || '').trim();
    const resolved = resolveProjectDirPath(projectPath, targetPath);
    if (!resolved.ok) {
      return { content: `Tool list_files: FAIL\nReason: ${resolved.error}`, sources: [] };
    }
    const files = listFilesRecursive(resolved.absolutePath, { maxDepth, limit, glob });
    const rel = files.map((entry) => normalizeRel(resolved.projectRoot, entry));
    emitPlanTrace('tool.list_files', {
      path: resolved.relativePath,
      count: rel.length,
      maxDepth,
      limit
    });
    return {
      content: [
        'Tool list_files: PASS',
        `Path: ${resolved.relativePath}`,
        `Count: ${rel.length}`,
        '',
        ...rel
      ].join('\n'),
      sources: []
    };
  }

  function buildDeterministicToolSearchCode({ message, projectPath = '' } = {}) {
    if (!isToolSearchCodeRequest(message)) return null;
    const inline = extractInlineToolJson(message, 'search_code') || {};
    const query = String(inline.query || parseKeyValueArg(message, 'query') || '').trim();
    if (!query) {
      return { content: 'Tool search_code: FAIL\nReason: missing query.', sources: [] };
    }
    const targetPath = String(inline.path || parseKeyValueArg(message, 'path') || '.').trim() || '.';
    const limit = Math.max(1, Math.min(Number(inline.limit ?? parseIntArg(message, 'limit', 100)), 1000));
    const maxDepth = Math.max(0, Math.min(Number(inline.max_depth ?? parseIntArg(message, 'max_depth', 5)), 10));
    const regex = Boolean(inline.regex ?? parseBoolArg(message, 'regex', false));
    const resolved = resolveProjectDirPath(projectPath, targetPath);
    if (!resolved.ok) {
      return { content: `Tool search_code: FAIL\nReason: ${resolved.error}`, sources: [] };
    }
    const files = listFilesRecursive(resolved.absolutePath, { maxDepth, limit: 4000, glob: '' });
    let matcher = null;
    if (regex) {
      try {
        matcher = new RegExp(query, 'i');
      } catch (err) {
        return { content: `Tool search_code: FAIL\nReason: invalid regex (${String(err?.message || err)})`, sources: [] };
      }
    }
    const hits = [];
    for (const filePath of files) {
      if (hits.length >= limit) break;
      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
      const lines = String(content || '').split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const matched = regex ? matcher.test(line) : line.toLowerCase().includes(query.toLowerCase());
        if (!matched) continue;
        hits.push(`${normalizeRel(resolved.projectRoot, filePath)}:${i + 1}: ${line}`);
        if (hits.length >= limit) break;
      }
    }
    emitPlanTrace('tool.search_code', {
      query,
      count: hits.length,
      regex
    });
    return {
      content: [
        'Tool search_code: PASS',
        `Query: ${query}`,
        `Matches: ${hits.length}`,
        '',
        ...hits
      ].join('\n'),
      sources: []
    };
  }

  function buildDeterministicToolReadFileChunk({ message, projectPath = '' } = {}) {
    if (!isToolReadFileChunkRequest(message)) return null;
    const inline = extractInlineToolJson(message, 'read_file_chunk') || {};
    const requested = String(inline.path || parseToolPathArg(message) || '').trim();
    if (!requested) {
      return { content: 'Tool read_file_chunk: FAIL\nReason: missing path.', sources: [] };
    }
    const start = Math.max(1, Number(inline.start ?? parseIntArg(message, 'start', 1)));
    const count = Math.max(1, Math.min(Number(inline.count ?? parseIntArg(message, 'count', 200)), 5000));
    const resolved = resolveProjectFilePath(projectPath, requested);
    if (!resolved.ok) {
      return { content: `Tool read_file_chunk: FAIL\nReason: ${resolved.error}`, sources: [] };
    }
    if (!fs.existsSync(resolved.absolutePath) || !fs.statSync(resolved.absolutePath).isFile()) {
      return { content: `Tool read_file_chunk: FAIL\nReason: file not found (${resolved.relativePath})`, sources: [] };
    }
    let content = '';
    try {
      content = fs.readFileSync(resolved.absolutePath, 'utf8');
    } catch (err) {
      return { content: `Tool read_file_chunk: FAIL\nReason: ${String(err?.message || 'unable to read file')}`, sources: [] };
    }
    const lines = String(content || '').split(/\r?\n/);
    const startIdx = Math.min(Math.max(0, start - 1), Math.max(0, lines.length - 1));
    const endIdx = Math.min(lines.length, startIdx + count);
    const chunk = [];
    for (let i = startIdx; i < endIdx; i += 1) {
      chunk.push(`${i + 1}: ${lines[i]}`);
    }
    emitPlanTrace('tool.read_file_chunk', {
      path: resolved.relativePath,
      start,
      count: chunk.length
    });
    return {
      content: [
        'Tool read_file_chunk: PASS',
        `Path: ${resolved.relativePath}`,
        `Range: ${startIdx + 1}-${endIdx}`,
        '',
        ...chunk
      ].join('\n'),
      sources: []
    };
  }

  function buildDeterministicToolApplyPatch({ message, projectPath = '' } = {}) {
    if (!isToolApplyPatchRequest(message)) return null;
    const inline = extractInlineToolJson(message, 'apply_patch') || {};
    const requested = String(inline.path || parseToolPathArg(message) || '').trim();
    if (!requested) {
      return {
        content: 'Tool apply_patch: FAIL\nReason: missing path. Use: tool.apply_patch {"path":"relative/path.ext","old_text":"...","new_text":"..."}',
        sources: []
      };
    }
    const oldText = String(inline.old_text ?? inline.oldText ?? '').replace(/\r\n/g, '\n');
    const newText = String(inline.new_text ?? inline.newText ?? '').replace(/\r\n/g, '\n');
    if (!oldText) {
      return {
        content: 'Tool apply_patch: FAIL\nReason: missing old_text in JSON payload.',
        sources: []
      };
    }
    const resolved = resolveProjectFilePath(projectPath, requested);
    if (!resolved.ok) {
      return { content: `Tool apply_patch: FAIL\nReason: ${resolved.error}`, sources: [] };
    }
    if (!fs.existsSync(resolved.absolutePath) || !fs.statSync(resolved.absolutePath).isFile()) {
      return { content: `Tool apply_patch: FAIL\nReason: file not found (${resolved.relativePath})`, sources: [] };
    }
    let current = '';
    try {
      current = fs.readFileSync(resolved.absolutePath, 'utf8');
    } catch (err) {
      return { content: `Tool apply_patch: FAIL\nReason: ${String(err?.message || 'unable to read file')}`, sources: [] };
    }
    if (!String(current).includes(oldText)) {
      return {
        content: 'Tool apply_patch: FAIL\nReason: old_text not found in target file.',
        sources: []
      };
    }
    const next = String(current).replace(oldText, newText);
    try {
      fs.writeFileSync(resolved.absolutePath, next, 'utf8');
    } catch (err) {
      return { content: `Tool apply_patch: FAIL\nReason: ${String(err?.message || 'unable to write file')}`, sources: [] };
    }
    emitPlanTrace('tool.apply_patch', {
      path: resolved.relativePath,
      replacedBytes: Buffer.byteLength(oldText, 'utf8')
    });
    return {
      content: `Tool apply_patch: PASS\nPath: ${resolved.relativePath}\nBytes: ${Buffer.byteLength(next, 'utf8')}`,
      sources: []
    };
  }

  function buildDeterministicToolVerify({ message, projectPath = '' } = {}) {
    if (!isToolVerifyRequest(message)) return null;
    const run = runProjectTests(projectPath);
    emitPlanTrace('tool.verify', {
      ok: !!run.ok,
      label: run.label || ''
    });
    return {
      content:
        `Tool verify: ${run.ok ? 'PASS' : 'FAIL'}\n` +
        `Command: ${run.label || '(none)'}\n\n` +
        `${String(run.output || '').slice(0, 12000)}`,
      sources: []
    };
  }

  return {
    buildDeterministicToolRunTests,
    buildDeterministicToolReadFile,
    buildDeterministicToolWriteFile,
    buildDeterministicToolVerify,
    buildDeterministicToolListFiles,
    buildDeterministicToolSearchCode,
    buildDeterministicToolReadFileChunk,
    buildDeterministicToolApplyPatch
  };
}

module.exports = createDeterministicToolHelpers;
