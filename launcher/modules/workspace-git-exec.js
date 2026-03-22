/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function getWorkspaceRoot(appDir) {
  return path.resolve(appDir, '..');
}

function getPlatformKey() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  if (platform === 'darwin') return arch === 'arm64' ? 'macos-arm' : 'macos-intel';
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  return 'unknown';
}

function resolveGitExecutables(appDir) {
  const list = [];
  const workspaceRoot = getWorkspaceRoot(appDir);
  const gitBase = path.join(workspaceRoot, 'binaries', 'git', getPlatformKey());
  const candidates = process.platform === 'win32'
    ? [path.join(gitBase, 'cmd', 'git.exe'), path.join(gitBase, 'bin', 'git.exe')]
    : [path.join(gitBase, 'bin', 'git'), path.join(gitBase, 'cmd', 'git')];

  for (const p of candidates) {
    if (fs.existsSync(p)) list.push({ path: p, source: 'bundled' });
  }
  list.push({ path: 'git', source: 'system' });
  return list;
}

function runGit(appDir, args, options = {}) {
  const cwd = options.cwd || getWorkspaceRoot(appDir);
  const timeout = Number(options.timeout || 30000);
  const maxBuffer = Number(options.maxBuffer || (2 * 1024 * 1024));
  const candidates = resolveGitExecutables(appDir);

  const isIndexLockError = (msg) => /index\.lock.*File exists/i.test(String(msg || ''));
  const clearIndexLock = (cwd) => {
    try {
      const lockPath = path.join(cwd, '.git', 'index.lock');
      if (fs.existsSync(lockPath) && fs.statSync(lockPath).isFile()) {
        fs.unlinkSync(lockPath);
        return { cleared: true, lockPath };
      }
    } catch {}
    return { cleared: false, lockPath: '' };
  };

  return new Promise((resolve) => {
    const tryNext = (idx) => {
      if (idx >= candidates.length) {
        resolve({ success: false, cwd, error: 'Git executable not found. Install bundled git or system git.' });
        return;
      }
      const candidate = candidates[idx];
      const env = { ...process.env };
      if (candidate.source === 'bundled' && path.isAbsolute(candidate.path)) {
        const gitRoot = path.dirname(path.dirname(candidate.path));
        const localExecPath = path.join(gitRoot, 'libexec', 'git-core');
        if (fs.existsSync(localExecPath)) env.GIT_EXEC_PATH = localExecPath;
        const binDir = path.join(gitRoot, 'bin');
        const cmdDir = path.join(gitRoot, 'cmd');
        env.PATH = [binDir, cmdDir, env.PATH || ''].filter(Boolean).join(path.delimiter);
      }

      const runOnce = (retriedAfterLock = false) => execFile(candidate.path, args, { cwd, env, timeout, maxBuffer }, (err, stdout, stderr) => {
        const out = String(stdout || '').trim();
        const errText = String(stderr || '').trim();
        if (err) {
          if (err.code === 'ENOENT' || err.code === 'EACCES') return tryNext(idx + 1);
          if (!retriedAfterLock && isIndexLockError(errText || err.message)) {
            const lockFix = clearIndexLock(cwd);
            if (lockFix.cleared) return runOnce(true);
          }
          resolve({
            success: false,
            cwd,
            code: typeof err.code === 'number' ? err.code : 1,
            executable: candidate.path,
            source: candidate.source,
            command: `${candidate.path} ${args.join(' ')}`,
            stdout: out,
            stderr: errText || err.message,
            error: errText || err.message,
            lockRecovered: false
          });
          return;
        }
        resolve({
          success: true,
          cwd,
          code: 0,
          executable: candidate.path,
          source: candidate.source,
          command: `${candidate.path} ${args.join(' ')}`,
          stdout: out,
          stderr: errText,
          lockRecovered: retriedAfterLock
        });
      });
      runOnce(false);
    };
    tryNext(0);
  });
}

function parseStatusPorcelain(statusText) {
  const lines = String(statusText || '').split(/\r?\n/).filter(Boolean);
  let branch = '';
  const files = [];
  let staged = 0;
  let modified = 0;
  let untracked = 0;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const raw = line.slice(3).trim();
      branch = raw.split('...')[0].trim();
      continue;
    }
    if (line.startsWith('?? ')) {
      files.push({ file: line.slice(3).trim(), status: 'untracked' });
      untracked += 1;
      continue;
    }
    if (line.length >= 3) {
      const x = line[0];
      const y = line[1];
      const file = line.slice(3).trim();
      if (x && x !== ' ') staged += 1;
      if (y && y !== ' ') modified += 1;
      let status = 'modified';
      if (x === 'A' || y === 'A') status = 'added';
      else if (x === 'D' || y === 'D') status = 'deleted';
      else if (x === 'R' || y === 'R') status = 'renamed';
      files.push({ file, status, xy: `${x}${y}` });
    }
  }

  return {
    branch: branch || 'detached',
    files,
    counts: { staged, modified, untracked, total: files.length },
    clean: files.length === 0
  };
}

module.exports = {
  getWorkspaceRoot,
  getPlatformKey,
  resolveGitExecutables,
  runGit,
  parseStatusPorcelain
};
