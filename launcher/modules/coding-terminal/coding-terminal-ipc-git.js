/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Git IPC Handlers
 */

function registerGitHandlers({
  register,
  codingTerminalCommon,
  gitIntegration,
  ensureGitReady,
  checkPermission,
  withTimeout,
  buildGitArgs,
  runGitCli
}) {
  function parseLineList(stdout) {
    return String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function parseStatusLine(line) {
    const raw = String(line || '');
    if (!raw.trim()) return null;
    if (raw.startsWith('## ')) {
      const branchText = raw.slice(3).trim();
      const branch = branchText.split('...')[0].trim() || 'unknown';
      return { type: 'branch', branch };
    }

    const x = raw[0] || ' ';
    const y = raw[1] || ' ';
    const body = raw.slice(3).trim();
    if (!body) return null;
    const filepath = body.includes(' -> ') ? body.split(' -> ').pop().trim() : body;

    if (x === '?' && y === '?') {
      return { type: 'untracked', path: filepath };
    }
    if (x === '!' && y === '!') {
      return { type: 'ignored', path: filepath };
    }
    const entries = [];
    if (x !== ' ' && x !== '?') {
      entries.push({ type: 'staged', file: { path: filepath, status: mapCliStatus(x) } });
    }
    if (y !== ' ' && y !== '?') {
      entries.push({ type: 'unstaged', file: { path: filepath, status: mapCliStatus(y) } });
    }
    return entries.length > 0 ? { type: 'changes', entries } : null;
  }

  function mapCliStatus(ch) {
    switch (ch) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      case 'U': return 'unmerged';
      default: return 'changed';
    }
  }

  function parseGitStatusShort(stdout, projectPath) {
    const files = {
      staged: [],
      unstaged: [],
      untracked: [],
      ignored: []
    };
    let branch = 'unknown';

    const lines = String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    for (const line of lines) {
      const parsed = parseStatusLine(line);
      if (!parsed) continue;
      if (parsed.type === 'branch') {
        branch = parsed.branch;
        continue;
      }
      if (parsed.type === 'untracked') {
        files.untracked.push(parsed.path);
        continue;
      }
      if (parsed.type === 'ignored') {
        files.ignored.push(parsed.path);
        continue;
      }
      if (parsed.type === 'changes') {
        for (const entry of parsed.entries) {
          if (entry.type === 'staged') files.staged.push(entry.file);
          if (entry.type === 'unstaged') files.unstaged.push(entry.file);
        }
      }
    }

    return {
      branch,
      files,
      clean: files.staged.length === 0 && files.unstaged.length === 0 && files.untracked.length === 0,
      projectPath,
      source: 'git-cli'
    };
  }

  register('coding-terminal:git-status', async () => {
    try {
      const init = await ensureGitReady();
      if (!init.success) {
        return { error: init.error };
      }
      const allowed = await checkPermission('git:read');
      if (!allowed) {
        return { error: 'Permission denied: git:read' };
      }
      const projectPath = codingTerminalCommon.getProject();
      if (!projectPath) {
        return { error: 'No project set' };
      }
      const isRepo = await gitIntegration.isRepo(projectPath);
      if (!isRepo) {
        return { error: `Not a git repository: ${projectPath}` };
      }

      const cli = await runGitCli(
        projectPath,
        ['status', '--short', '--branch', '--untracked-files=all', '--ignored'],
        5000
      );
      if (cli?.success) {
        const trackedListCli = await runGitCli(projectPath, ['ls-files', '--cached'], 5000);
        const untrackedListCli = await runGitCli(projectPath, ['ls-files', '--others', '--exclude-standard'], 5000);
        const tracked = trackedListCli?.success ? parseLineList(trackedListCli.stdout) : [];
        const untrackedAll = untrackedListCli?.success ? parseLineList(untrackedListCli.stdout) : [];
        const parsed = parseGitStatusShort(cli.stdout || '', projectPath);
        parsed.files = parsed.files || {};
        parsed.files.tracked = tracked;
        if (untrackedAll.length > 0) {
          parsed.files.untracked = untrackedAll;
          parsed.clean = false;
        }
        return {
          ...parsed,
          cwd: cli.cwd || projectPath,
          command: cli.command || ''
        };
      }

      const fallback = await withTimeout(gitIntegration.status(projectPath), 4000, 'Git status timeout');
      return {
        ...fallback,
        projectPath,
        cwd: cli?.cwd || projectPath,
        source: 'isomorphic-git',
        cliError: cli?.error || ''
      };
    } catch (err) {
      console.error('[CodingTerminal:IPC:Git] Git status error:', err);
      return { error: err.message };
    }
  });

  register('coding-terminal:git-diff', async (event, options = {}) => {
    try {
      const init = await ensureGitReady();
      if (!init.success) {
        return { error: init.error };
      }
      const allowed = await checkPermission('git:read');
      if (!allowed) {
        return { error: 'Permission denied: git:read' };
      }
      const projectPath = codingTerminalCommon.getProject();
      if (!projectPath) {
        return { error: 'No project set' };
      }
      const isRepo = await gitIntegration.isRepo(projectPath);
      if (!isRepo) {
        return { error: `Not a git repository: ${projectPath}` };
      }
      return await withTimeout(gitIntegration.diff(projectPath, options), 6000, 'Git diff timeout');
    } catch (err) {
      console.error('[CodingTerminal:IPC:Git] Git diff error:', err);
      return { error: err.message };
    }
  });

  register('coding-terminal:git-commit', async (event, message, options = {}) => {
    try {
      const init = await ensureGitReady();
      if (!init.success) {
        return { error: init.error };
      }
      const projectPath = codingTerminalCommon.getProject();
      if (!projectPath) {
        return { error: 'No project set' };
      }
      const allowed = await checkPermission('git:commit');
      if (!allowed) {
        return { error: 'Permission denied: git:commit' };
      }
      return await gitIntegration.commit(projectPath, message, options);
    } catch (err) {
      console.error('[CodingTerminal:IPC:Git] Git commit error:', err);
      return { error: err.message };
    }
  });

  register('coding-terminal:git-run', async (event, action, payload = {}) => {
    try {
      const op = String(action || '').toLowerCase();
      const projectPath = codingTerminalCommon.getProject();
      if (!projectPath) {
        return { success: false, error: 'No project set' };
      }

      const readOps = new Set(['status', 'blame', 'diff', 'reflog', 'log', 'show']);
      const writeOps = new Set([
        'init', 'add', 'bisect', 'checkout', 'commit', 'amend',
        'pull', 'push', 'remote-add', 'rebase', 'reset'
      ]);

      if (!readOps.has(op) && !writeOps.has(op)) {
        return { success: false, error: `Unsupported git action: ${op}` };
      }

      if (readOps.has(op)) {
        const allowed = await checkPermission('git:read');
        if (!allowed) return { success: false, error: 'Permission denied: git:read' };
      } else {
        const allowed = await checkPermission('git:commit');
        if (!allowed) return { success: false, error: 'Permission denied: git:commit' };
      }

      if (op !== 'init') {
        const isRepo = await gitIntegration.isRepo(projectPath);
        if (!isRepo) {
          return { success: false, error: `Not a git repository: ${projectPath}` };
        }
      }

      const args = buildGitArgs(op, payload);
      if (!args || args.length === 0) {
        return { success: false, error: `Invalid arguments for git action: ${op}` };
      }

      const risky = (op === 'reset' || op === 'rebase' || op === 'bisect');
      if (risky && payload.confirmToken !== 'I_UNDERSTAND') {
        return {
          success: false,
          error: `Action "${op}" requires confirmation token I_UNDERSTAND.`
        };
      }

      const timeoutMs = Math.max(4000, Math.min(Number(payload.timeoutMs) || 30000, 120000));
      return await runGitCli(projectPath, args, timeoutMs);
    } catch (err) {
      console.error('[CodingTerminal:IPC:Git] Git run error:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  registerGitHandlers
};
