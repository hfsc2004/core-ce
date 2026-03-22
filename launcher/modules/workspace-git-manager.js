/**
 * Workspace Git Manager
 * Git operations for the PSF workspace (separate from Coding Terminal project git).
 *
 * @module workspace-git-manager
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 * @license SEE LICENSE.txt
 */

const path = require('path');
const policy = require('./workspace-git-policy');
const gitExec = require('./workspace-git-exec');
const { getWorkspaceRoot, runGit, parseStatusPorcelain } = gitExec;

async function getStatus(appDir) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const inside = await runGit(appDir, ['rev-parse', '--is-inside-work-tree'], { cwd: workspaceRoot, timeout: 8000 });
  if (!inside.success) {
    return {
      success: true,
      isRepo: false,
      root: workspaceRoot,
      branch: null,
      files: [],
      counts: { staged: 0, modified: 0, untracked: 0, total: 0 },
      clean: true
    };
  }

  const status = await runGit(appDir, ['status', '--porcelain=v1', '-b'], { cwd: workspaceRoot, timeout: 10000 });
  if (!status.success) {
    return {
      success: false,
      isRepo: true,
      root: workspaceRoot,
      error: status.error || 'Failed to read git status',
      stderr: status.stderr || ''
    };
  }

  const parsed = parseStatusPorcelain(status.stdout || '');
  const lastCommitRes = await runGit(appDir, ['log', '--pretty=format:%h|%ad|%s', '--date=short', '-n', '1'], {
    cwd: workspaceRoot,
    timeout: 8000
  });
  let lastCommit = null;
  if (lastCommitRes.success && String(lastCommitRes.stdout || '').trim()) {
    const parts = String(lastCommitRes.stdout || '').split('|');
    lastCommit = {
      short: String(parts[0] || '').trim(),
      date: String(parts[1] || '').trim(),
      subject: String(parts.slice(2).join('|') || '').trim()
    };
  }
  const tracked = await runGit(appDir, ['ls-files', '--cached'], { cwd: workspaceRoot, timeout: 15000 });
  const trackedFiles = tracked.success
    ? String(tracked.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : [];
  const trackedCount = trackedFiles.length;
  const trackedSet = new Set(trackedFiles);
  const statusByFile = new Map((parsed.files || []).map((f) => [f.file, f]));
  const allFiles = trackedFiles.map((file) => {
    const hit = statusByFile.get(file);
    if (!hit) return { file, status: 'tracked', xy: '  ' };
    return { file, status: hit.status || 'modified', xy: hit.xy || '  ' };
  });

  for (const f of parsed.files || []) {
    if (!f?.file) continue;
    if (trackedSet.has(f.file)) continue;
    allFiles.push({
      file: f.file,
      status: f.status || 'untracked',
      xy: f.xy || '??'
    });
  }

  allFiles.sort((a, b) => String(a.file).localeCompare(String(b.file)));
  const maxAllFiles = 5000;
  const trimmedAllFiles = allFiles.slice(0, maxAllFiles);
  return {
    success: true,
    isRepo: true,
    root: workspaceRoot,
    branch: parsed.branch,
    files: parsed.files,
    allFiles: trimmedAllFiles,
    allFilesOverflow: Math.max(0, allFiles.length - trimmedAllFiles.length),
    counts: parsed.counts,
    clean: parsed.clean,
    lastCommit,
    trackedCount,
    exclusions: policy.getWorkspaceGitPolicy()
  };
}

async function initRepo(appDir) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const result = await runGit(appDir, ['init'], { cwd: workspaceRoot, timeout: 15000 });
  if (!result.success) return result;
  policy.ensureWorkspaceGitignore(workspaceRoot);
  return result;
}

async function addAll(appDir) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  policy.ensureWorkspaceGitignore(workspaceRoot);
  // Ensure excluded heavyweight folders are not tracked in index.
  const modelSubdirs = policy.listImmediateSubdirs(path.join(workspaceRoot, 'models'))
    .map((name) => path.posix.join('models', name));
  await runGit(appDir, [
    'rm',
    '--cached',
    '-r',
    '--ignore-unmatch',
    'binaries',
    'launcher/node_modules',
    'models/psf-settings.json',
    ...modelSubdirs
  ], { cwd: workspaceRoot, timeout: 30000 });

  // Stage source paths plus models root metadata files only.
  const stagePaths = [
    'launcher',
    'compile-configs',
    '*.md',
    '*.sh',
    '*.bat',
    '*.py',
    'start.sh',
    'start.bat',
    'start.command',
    'autorun.inf'
  ];
  const modelMetaFiles = policy.listRootModelMetadataFiles(workspaceRoot);
  if (modelMetaFiles.length > 0) {
    stagePaths.push(...modelMetaFiles);
  }

  const addResult = await runGit(appDir, [
    'add',
    '-A',
    '--',
    ...stagePaths
  ], { cwd: workspaceRoot, timeout: 60000 });
  if (!addResult.success) return addResult;

  const stagedStatus = await runGit(appDir, ['diff', '--cached', '--name-status'], { cwd: workspaceRoot, timeout: 15000 });
  if (!stagedStatus.success) return addResult;

  const stagedFiles = String(stagedStatus.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t+/);
      const code = (parts[0] || '').trim();
      const file = (parts[parts.length - 1] || '').trim();
      return { code, file };
    })
    .filter((r) => r.file);

  return {
    ...addResult,
    stagedCount: stagedFiles.length,
    stagedFiles: stagedFiles.slice(0, 120),
    stagedOverflow: Math.max(0, stagedFiles.length - 120)
  };
}

async function commit(appDir, message) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const msg = String(message || '').trim();
  if (!msg) return { success: false, error: 'Commit message required.' };
  const userName = await runGit(appDir, ['config', '--get', 'user.name'], { cwd: workspaceRoot, timeout: 8000 });
  const userEmail = await runGit(appDir, ['config', '--get', 'user.email'], { cwd: workspaceRoot, timeout: 8000 });
  if (!userName.success || !String(userName.stdout || '').trim() || !userEmail.success || !String(userEmail.stdout || '').trim()) {
    return {
      success: false,
      error: 'Git identity not configured. Set user.name and user.email for this repository before committing.'
    };
  }

  const staged = await runGit(appDir, ['diff', '--cached', '--name-only'], { cwd: workspaceRoot, timeout: 10000 });
  if (!staged.success) {
    return staged;
  }
  const stagedFiles = String(staged.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (stagedFiles.length === 0) {
    return { success: false, error: 'No staged changes. Run Add All first.' };
  }

  const secretScan = await policy.scanStagedFilesForSecrets(runGit, appDir, workspaceRoot, stagedFiles);
  if (secretScan.blocked) {
    return {
      success: false,
      error: `Secrets guard blocked commit. Potential secrets detected in ${secretScan.files.length} staged file(s).`,
      secretFiles: secretScan.files
    };
  }

  return runGit(appDir, ['commit', '-m', msg], { cwd: workspaceRoot, timeout: 30000 });
}

async function listBranches(appDir) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const inside = await runGit(appDir, ['rev-parse', '--is-inside-work-tree'], { cwd: workspaceRoot, timeout: 8000 });
  if (!inside.success) {
    return { success: true, isRepo: false, current: '', branches: [] };
  }

  const result = await runGit(appDir, ['branch', '--format=%(if)%(HEAD)%(then)*%(else) %(end)|%(refname:short)'], {
    cwd: workspaceRoot,
    timeout: 10000
  });
  if (!result.success) return result;

  const branches = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [headMark, nameRaw] = line.split('|');
      const name = String(nameRaw || '').trim();
      const current = String(headMark || '').includes('*');
      return { name, current };
    })
    .filter((b) => b.name);

  const current = (branches.find((b) => b.current) || {}).name || '';
  return { success: true, isRepo: true, current, branches };
}

async function createBranch(appDir, branchName, checkout = true) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const name = String(branchName || '').trim();
  if (!name) return { success: false, error: 'Branch name required.' };
  const args = checkout ? ['checkout', '-b', name] : ['branch', name];
  return runGit(appDir, args, { cwd: workspaceRoot, timeout: 20000 });
}

async function checkoutBranch(appDir, branchName) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const name = String(branchName || '').trim();
  if (!name) return { success: false, error: 'Branch name required.' };
  return runGit(appDir, ['checkout', name], { cwd: workspaceRoot, timeout: 20000 });
}

async function mergeBranch(appDir, sourceBranch) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const source = String(sourceBranch || '').trim();
  if (!source) return { success: false, error: 'Source branch required.' };

  const currentRef = await runGit(appDir, ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspaceRoot, timeout: 8000 });
  const current = currentRef.success ? String(currentRef.stdout || '').trim() : '';
  if (current && source === current) {
    return { success: false, error: 'Cannot merge branch into itself.' };
  }

  return runGit(appDir, ['merge', source], { cwd: workspaceRoot, timeout: 45000 });
}

async function getHistory(appDir, limit = 30) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const inside = await runGit(appDir, ['rev-parse', '--is-inside-work-tree'], { cwd: workspaceRoot, timeout: 8000 });
  if (!inside.success) {
    return { success: true, isRepo: false, commits: [] };
  }
  const n = Math.max(1, Math.min(Number(limit) || 30, 100));
  const result = await runGit(appDir, ['log', '--pretty=format:%H|%h|%ad|%s', '--date=short', '-n', String(n)], {
    cwd: workspaceRoot,
    timeout: 15000
  });
  if (!result.success) {
    // Empty history is possible on brand new repo.
    if (/does not have any commits yet/i.test(String(result.stderr || ''))) {
      return { success: true, isRepo: true, commits: [] };
    }
    return result;
  }
  const commits = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, short, date, ...subjectParts] = line.split('|');
      return {
        hash: String(hash || '').trim(),
        short: String(short || '').trim(),
        date: String(date || '').trim(),
        subject: String(subjectParts.join('|') || '').trim()
      };
    })
    .filter((c) => c.hash);
  return { success: true, isRepo: true, commits };
}

async function rollback(appDir, targetRef, mode = 'hard') {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const ref = String(targetRef || '').trim();
  if (!ref) return { success: false, error: 'Rollback target required.' };
  const resetMode = mode === 'soft' ? '--soft' : '--hard';
  return runGit(appDir, ['reset', resetMode, ref], { cwd: workspaceRoot, timeout: 20000 });
}

async function rollbackWithOptions(appDir, targetRef, options = {}) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const ref = String(targetRef || '').trim();
  if (!ref) return { success: false, error: 'Rollback target required.' };

  const mode = String(options?.mode || 'hard').toLowerCase() === 'soft' ? 'soft' : 'hard';
  const createBackup = mode === 'hard' && Boolean(options?.createBackup);
  let backupBranch = '';

  if (createBackup) {
    const stamp = policy.getTimestampForBranch();
    const prefixRaw = String(options?.backupPrefix || 'backup/pre-reset').trim() || 'backup/pre-reset';
    const prefix = policy.sanitizeBranchPrefix(prefixRaw);
    backupBranch = `${prefix}-${stamp}`;
    const backupResult = await runGit(appDir, ['branch', backupBranch, 'HEAD'], { cwd: workspaceRoot, timeout: 15000 });
    if (!backupResult.success) {
      return {
        ...backupResult,
        error: `Backup branch creation failed (${backupBranch}): ${backupResult.error || backupResult.stderr || 'Unknown error'}`
      };
    }
  }

  const resetMode = mode === 'soft' ? '--soft' : '--hard';
  const resetResult = await runGit(appDir, ['reset', resetMode, ref], { cwd: workspaceRoot, timeout: 20000 });
  if (!resetResult.success) return resetResult;
  return {
    ...resetResult,
    mode,
    backupBranch: backupBranch || null
  };
}

async function toggleFileTracked(appDir, filePath, track = true) {
  const workspaceRoot = getWorkspaceRoot(appDir);
  const relPath = policy.normalizeWorkspaceRelPath(workspaceRoot, filePath);
  if (!relPath) {
    return { success: false, error: 'Invalid file path.' };
  }

  if (track) {
    return runGit(appDir, ['add', '--', relPath], { cwd: workspaceRoot, timeout: 20000 });
  }

  return runGit(appDir, ['rm', '--cached', '--ignore-unmatch', '--', relPath], { cwd: workspaceRoot, timeout: 20000 });
}

module.exports = {
  getWorkspaceRoot,
  getStatus,
  initRepo,
  addAll,
  commit,
  listBranches,
  createBranch,
  checkoutBranch,
  mergeBranch,
  getHistory,
  rollback,
  rollbackWithOptions,
  toggleFileTracked,
  getWorkspaceGitPolicy: policy.getWorkspaceGitPolicy
};
