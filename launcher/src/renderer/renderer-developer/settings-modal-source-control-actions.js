/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function ui() {
    return window.SettingsModalSourceControlUi || {};
  }

  async function openWorkspaceGitGuide() {
    try {
      const result = await window.electronAPI.workspaceGitOpenGuide();
      if (!result?.success) {
        ui().appendSourceControlLog?.(`Open guide failed: ${result?.error || 'Unknown error'}`);
        return;
      }
      ui().appendSourceControlLog?.(`Opened guide: ${result.path || 'WorkspaceGitControls.md'}`);
    } catch (err) {
      ui().appendSourceControlLog?.(`Open guide failed: ${err.message || String(err)}`);
    }
  }

  async function workspaceGitToggleFileTrackedFromStatusClick(statusButtonEl) {
    const filePath = String(statusButtonEl?.dataset?.file || '').trim();
    const currentStatus = String(statusButtonEl?.dataset?.status || '').trim().toLowerCase();
    if (!filePath) return;
    if (currentStatus === 'renamed') {
      ui().appendSourceControlLog?.(`Toggle skipped for renamed entry: ${filePath}`);
      return;
    }

    const track = currentStatus === 'untracked';
    const busyLabel = track ? `Tracking ${filePath}...` : `Untracking ${filePath}...`;
    ui().setSourceControlBusy?.(true, busyLabel);
    try {
      const result = await window.electronAPI.workspaceGitToggleFileTracked(filePath, track);
      if (!result?.success) {
        ui().appendSourceControlLog?.(`${track ? 'Track' : 'Untrack'} failed: ${result?.error || result?.stderr || 'Unknown error'}`);
      } else {
        ui().appendSourceControlLog?.(`${track ? 'Tracked' : 'Untracked'}: ${filePath}`);
      }
    } catch (err) {
      ui().appendSourceControlLog?.(`${track ? 'Track' : 'Untrack'} failed: ${err.message || String(err)}`);
    } finally {
      ui().setSourceControlBusy?.(false);
    }
    await ui().loadWorkspaceGitStatus?.();
  }

  async function workspaceGitRefresh() {
    ui().setSourceControlBusy?.(true, 'Refreshing...');
    try {
      await ui().loadWorkspaceGitStatus?.();
      ui().appendSourceControlLog?.('Refreshed workspace git status.');
    } finally {
      ui().setSourceControlBusy?.(false);
    }
  }

  async function workspaceGitInit() {
    ui().setSourceControlBusy?.(true, 'Initializing repository...');
    try {
      const result = await window.electronAPI.workspaceGitInit();
      if (!result?.success) {
        ui().appendSourceControlLog?.(`Init failed: ${result?.error || result?.stderr || 'Unknown error'}`);
      } else {
        ui().appendSourceControlLog?.(`Initialized git repository.${result?.lockRecovered ? ' (Recovered stale index.lock)' : ''}`);
      }
    } catch (err) {
      ui().appendSourceControlLog?.(`Init failed: ${err.message || String(err)}`);
    } finally {
      ui().setSourceControlBusy?.(false);
    }
    await ui().loadWorkspaceGitStatus?.();
  }

  async function workspaceGitAddAll() {
    ui().setSourceControlBusy?.(true, 'Staging files...');
    ui().appendSourceControlLog?.('Running add: excludes /binaries + /models subdirs; includes root /models/*.json and /models/*.js ...');
    try {
      const result = await window.electronAPI.workspaceGitAddAll();
      if (!result?.success) {
        ui().appendSourceControlLog?.(`Add failed: ${result?.error || result?.stderr || 'Unknown error'}`);
      } else {
        const stagedCount = Number(result?.stagedCount || 0);
        ui().appendSourceControlLog?.(`Staged ${stagedCount} file(s).${result?.lockRecovered ? ' (Recovered stale index.lock)' : ''}`);
        if (Array.isArray(result?.stagedFiles) && result.stagedFiles.length > 0) {
          const preview = result.stagedFiles.slice(0, 25).map((r) => `${r.code || '?'} ${r.file}`).join('\n');
          const extra = result.stagedOverflow ? `\n...and ${result.stagedOverflow} more` : '';
          ui().appendSourceControlLog?.(`Staged files:\n${preview}${extra}`);
        }
      }
    } catch (err) {
      ui().appendSourceControlLog?.(`Add failed: ${err.message || String(err)}`);
    } finally {
      ui().setSourceControlBusy?.(false);
    }
    await ui().loadWorkspaceGitStatus?.();
  }

  async function workspaceGitCommit() {
    const input = document.getElementById('scm-commit-message');
    const message = String(input?.value || '').trim();
    if (!message) {
      ui().appendSourceControlLog?.('Commit skipped: message required.');
      return;
    }

    ui().setSourceControlBusy?.(true, 'Committing...');
    try {
      const result = await window.electronAPI.workspaceGitCommit(message);
      if (!result?.success) {
        ui().appendSourceControlLog?.(`Commit failed: ${result?.error || result?.stderr || 'Unknown error'}`);
        if (Array.isArray(result?.secretFiles) && result.secretFiles.length > 0) {
          ui().appendSourceControlLog?.(`Secrets guard files:\n- ${result.secretFiles.join('\n- ')}`);
        }
      } else {
        ui().appendSourceControlLog?.(`Commit completed.${result?.lockRecovered ? ' (Recovered stale index.lock)' : ''}`);
        if (input) input.value = '';
      }
    } catch (err) {
      ui().appendSourceControlLog?.(`Commit failed: ${err.message || String(err)}`);
    } finally {
      ui().setSourceControlBusy?.(false);
    }
    await ui().loadWorkspaceGitStatus?.();
  }

  async function workspaceGitCheckoutSelectedBranch() {
    const select = document.getElementById('scm-branch-select');
    const branchName = String(select?.value || '').trim();
    if (!branchName) {
      ui().appendSourceControlLog?.('Checkout skipped: branch required.');
      return;
    }
    ui().setSourceControlBusy?.(true, `Checking out ${branchName}...`);
    try {
      const result = await window.electronAPI.workspaceGitCheckoutBranch(branchName);
      if (!result?.success) {
        ui().appendSourceControlLog?.(`Checkout failed: ${result?.error || result?.stderr || 'Unknown error'}`);
      } else {
        ui().appendSourceControlLog?.(`Checked out branch: ${branchName}`);
      }
    } catch (err) {
      ui().appendSourceControlLog?.(`Checkout failed: ${err.message || String(err)}`);
    } finally {
      ui().setSourceControlBusy?.(false);
    }
    await ui().loadWorkspaceGitStatus?.();
  }

  async function workspaceGitCreateBranch() {
    const input = document.getElementById('scm-new-branch');
    const branchName = String(input?.value || '').trim();
    if (!branchName) {
      ui().appendSourceControlLog?.('Create branch skipped: name required.');
      return;
    }
    ui().setSourceControlBusy?.(true, `Creating branch ${branchName}...`);
    try {
      const result = await window.electronAPI.workspaceGitCreateBranch(branchName, true);
      if (!result?.success) {
        ui().appendSourceControlLog?.(`Create branch failed: ${result?.error || result?.stderr || 'Unknown error'}`);
      } else {
        ui().appendSourceControlLog?.(`Branch created and checked out: ${branchName}`);
        if (input) input.value = '';
      }
    } catch (err) {
      ui().appendSourceControlLog?.(`Create branch failed: ${err.message || String(err)}`);
    } finally {
      ui().setSourceControlBusy?.(false);
    }
    await ui().loadWorkspaceGitStatus?.();
  }

  async function workspaceGitMergeSelectedBranch() {
    const select = document.getElementById('scm-merge-source');
    const sourceBranch = String(select?.value || '').trim();
    if (!sourceBranch) {
      ui().appendSourceControlLog?.('Merge skipped: choose a source branch first.');
      return;
    }

    const currentBranch = String(settingsModalState.workspaceGitStatus?.branch || '').trim();
    const ok = window.confirm(`Merge "${sourceBranch}" into current branch "${currentBranch || 'current'}"?`);
    if (!ok) {
      ui().appendSourceControlLog?.('Merge canceled.');
      return;
    }

    ui().setSourceControlBusy?.(true, `Merging ${sourceBranch}...`);
    try {
      const result = await window.electronAPI.workspaceGitMerge(sourceBranch);
      if (!result?.success) {
        ui().appendSourceControlLog?.(`Merge failed: ${result?.error || result?.stderr || 'Unknown error'}`);
      } else {
        ui().appendSourceControlLog?.(`Merge completed: ${sourceBranch} -> ${currentBranch || 'current'}`);
      }
    } catch (err) {
      ui().appendSourceControlLog?.(`Merge failed: ${err.message || String(err)}`);
    } finally {
      ui().setSourceControlBusy?.(false);
    }
    await ui().loadWorkspaceGitStatus?.();
  }

  async function workspaceGitRollbackToSelected() {
    const select = document.getElementById('scm-rollback-target');
    const modeSelect = document.getElementById('scm-rollback-mode');
    const backupCheckbox = document.getElementById('scm-rollback-backup');
    const backupPrefixInput = document.getElementById('scm-rollback-backup-prefix');
    const target = String(select?.value || '').trim();
    const mode = String(modeSelect?.value || 'hard').toLowerCase() === 'soft' ? 'soft' : 'hard';
    const createBackup = mode === 'hard' && Boolean(backupCheckbox?.checked);
    const backupPrefix = String(backupPrefixInput?.value || '').trim();
    if (!target) {
      ui().appendSourceControlLog?.('Rollback skipped: target commit required.');
      return;
    }

    const confirmText = mode === 'soft'
      ? `Rollback with SOFT reset to ${target.slice(0, 8)}?\n\nIndex/history moves, working tree is preserved.`
      : `Rollback with HARD reset to ${target.slice(0, 8)}?\n\nThis discards uncommitted changes.${createBackup ? '\nA backup branch will be created first.' : ''}`;
    const confirmed = window.confirm(confirmText);
    if (!confirmed) {
      ui().appendSourceControlLog?.('Rollback canceled.');
      return;
    }

    ui().setSourceControlBusy?.(true, `Rolling back (${mode}) to ${target.slice(0, 8)}...`);
    try {
      const result = await window.electronAPI.workspaceGitRollback(target, mode, {
        createBackup,
        backupPrefix
      });
      if (!result?.success) {
        ui().appendSourceControlLog?.(`Rollback failed: ${result?.error || result?.stderr || 'Unknown error'}`);
      } else {
        ui().appendSourceControlLog?.(`Rollback complete (${mode}): HEAD -> ${target.slice(0, 8)}`);
        if (result?.backupBranch) {
          ui().appendSourceControlLog?.(`Backup branch created: ${result.backupBranch}`);
        }
      }
    } catch (err) {
      ui().appendSourceControlLog?.(`Rollback failed: ${err.message || String(err)}`);
    } finally {
      ui().setSourceControlBusy?.(false);
    }
    await ui().loadWorkspaceGitStatus?.();
  }

  window.SettingsModalSourceControlActions = {
    openWorkspaceGitGuide,
    workspaceGitToggleFileTrackedFromStatusClick,
    workspaceGitRefresh,
    workspaceGitInit,
    workspaceGitAddAll,
    workspaceGitCommit,
    workspaceGitCheckoutSelectedBranch,
    workspaceGitCreateBranch,
    workspaceGitMergeSelectedBranch,
    workspaceGitRollbackToSelected
  };
})();
