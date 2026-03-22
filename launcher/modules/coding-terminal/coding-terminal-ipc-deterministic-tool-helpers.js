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
    buildDeterministicToolVerify
  };
}

module.exports = createDeterministicToolHelpers;
