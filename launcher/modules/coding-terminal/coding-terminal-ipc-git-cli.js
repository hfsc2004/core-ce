/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - IPC Git CLI Helpers
 */

'use strict';

function createGitCliTools(deps = {}) {
  const fs = deps.fs;
  const path = deps.path;
  const execFile = deps.execFile;
  const codingTerminalPlatform = deps.codingTerminalPlatform;
  const getAppDir = typeof deps.getAppDir === 'function' ? deps.getAppDir : () => null;

  function buildGitArgs(op, payload = {}) {
    const p = payload || {};
    switch (op) {
      case 'status':
        return ['status', '--short', '--branch'];
      case 'init':
        return ['init'];
      case 'add': {
        const paths = Array.isArray(p.paths) ? p.paths.filter(Boolean) : [];
        return ['add', ...(paths.length > 0 ? paths : ['-A'])];
      }
      case 'blame': {
        const file = String(p.file || '').trim();
        if (!file) return null;
        const line = Number(p.line);
        if (Number.isFinite(line) && line > 0) {
          return ['blame', '-L', `${line},${line}`, file];
        }
        return ['blame', file];
      }
      case 'bisect': {
        const sub = String(p.subcommand || '').trim();
        if (!sub) return null;
        const extra = Array.isArray(p.args) ? p.args.filter(Boolean).map(String) : [];
        return ['bisect', sub, ...extra];
      }
      case 'checkout': {
        const ref = String(p.ref || '').trim();
        if (!ref) return null;
        const create = !!p.create;
        return ['checkout', ...(create ? ['-b'] : []), ref];
      }
      case 'commit': {
        const message = String(p.message || '').trim();
        if (!message) return null;
        return ['commit', '-m', message];
      }
      case 'amend': {
        const message = String(p.message || '').trim();
        if (message) return ['commit', '--amend', '-m', message];
        return ['commit', '--amend', '--no-edit'];
      }
      case 'diff': {
        const staged = !!p.staged;
        const file = String(p.file || '').trim();
        return ['diff', ...(staged ? ['--staged'] : []), ...(file ? [file] : [])];
      }
      case 'pull': {
        const remote = String(p.remote || '').trim();
        const branch = String(p.branch || '').trim();
        const rebase = !!p.rebase;
        return ['pull', ...(rebase ? ['--rebase'] : []), ...(remote ? [remote] : []), ...(branch ? [branch] : [])];
      }
      case 'push': {
        const remote = String(p.remote || '').trim();
        const branch = String(p.branch || '').trim();
        const setUpstream = !!p.setUpstream;
        return ['push', ...(setUpstream ? ['-u'] : []), ...(remote ? [remote] : []), ...(branch ? [branch] : [])];
      }
      case 'reflog':
        return ['reflog', '--date=iso'];
      case 'remote-add': {
        const name = String(p.name || '').trim();
        const url = String(p.url || '').trim();
        if (!name || !url) return null;
        return ['remote', 'add', name, url];
      }
      case 'log': {
        const limit = Math.max(1, Math.min(Number(p.limit) || 20, 200));
        return ['log', `-n${limit}`, '--oneline', '--decorate'];
      }
      case 'show': {
        const ref = String(p.ref || 'HEAD').trim() || 'HEAD';
        return ['show', ref];
      }
      case 'rebase': {
        if (p.abort) return ['rebase', '--abort'];
        if (p.continue) return ['rebase', '--continue'];
        const onto = String(p.onto || '').trim();
        if (!onto) return null;
        return ['rebase', onto];
      }
      case 'reset': {
        const modeRaw = String(p.mode || 'mixed').toLowerCase();
        const mode = modeRaw === 'soft' || modeRaw === 'mixed' || modeRaw === 'hard' ? modeRaw : 'mixed';
        const target = String(p.target || 'HEAD').trim() || 'HEAD';
        return ['reset', `--${mode}`, target];
      }
      default:
        return null;
    }
  }

  function runGitCli(projectPath, args, timeoutMs = 30000) {
    return new Promise((resolve) => {
      const candidates = resolveGitExecutables();
      const tryNext = (idx) => {
        if (idx >= candidates.length) {
          resolve({
            success: false,
            cwd: projectPath,
            error: 'Git executable not found. Install git or provide bundled binary in binaries/git/<platform>/...'
          });
          return;
        }

        const candidate = candidates[idx];
        const env = { ...process.env };
        if (candidate.source === 'bundled' && path.isAbsolute(candidate.path)) {
          const gitRoot = path.dirname(path.dirname(candidate.path));
          const localExecPath = path.join(gitRoot, 'libexec', 'git-core');
          if (fs.existsSync(localExecPath)) {
            env.GIT_EXEC_PATH = localExecPath;
          }
          const binDir = path.join(gitRoot, 'bin');
          const cmdDir = path.join(gitRoot, 'cmd');
          const currentPath = env.PATH || '';
          env.PATH = [binDir, cmdDir, currentPath].filter(Boolean).join(path.delimiter);
        }
        execFile(candidate.path, args, {
          cwd: projectPath,
          env,
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024
        }, (err, stdout, stderr) => {
          const out = String(stdout || '').trim();
          const errText = String(stderr || '').trim();
          if (err) {
            const missing = err.code === 'ENOENT';
            const denied = err.code === 'EACCES';
            if (missing || denied) {
              tryNext(idx + 1);
              return;
            }
            resolve({
              success: false,
              cwd: projectPath,
              code: typeof err.code === 'number' ? err.code : 1,
              command: `${candidate.path} ${args.join(' ')}`,
              executable: candidate.path,
              source: candidate.source,
              stdout: out,
              stderr: errText || err.message,
              error: errText || err.message
            });
            return;
          }
          resolve({
            success: true,
            cwd: projectPath,
            code: 0,
            command: `${candidate.path} ${args.join(' ')}`,
            executable: candidate.path,
            source: candidate.source,
            stdout: out,
            stderr: errText
          });
        });
      };

      tryNext(0);
    });
  }

  function resolveGitExecutables() {
    const list = [{ path: 'git', source: 'system' }];
    const appDir = getAppDir();
    if (!appDir) return list;

    const projectRoot = path.join(appDir, '..');
    const key = codingTerminalPlatform.getPlatformKey();
    const gitBase = path.join(projectRoot, 'binaries', 'git', key);
    const candidates = codingTerminalPlatform.isWindows()
      ? [
          path.join(gitBase, 'cmd', 'git.exe'),
          path.join(gitBase, 'bin', 'git.exe')
        ]
      : [
          path.join(gitBase, 'bin', 'git'),
          path.join(gitBase, 'cmd', 'git')
        ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        list.push({ path: p, source: 'bundled' });
      }
    }
    return list;
  }

  return {
    buildGitArgs,
    runGitCli
  };
}

module.exports = createGitCliTools;

