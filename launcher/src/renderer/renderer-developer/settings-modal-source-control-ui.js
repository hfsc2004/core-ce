/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
(function() {
  'use strict';

  function appendSourceControlLog(text) {
    const log = document.getElementById('scm-log');
    if (!log) return;
    const stamp = new Date().toLocaleTimeString();
    const prior = log.textContent || '';
    const next = `[${stamp}] ${text}\n${prior}`.trim();
    log.textContent = next;
  }

  function setSourceControlBusy(busy, label = '') {
    const tab = document.getElementById('settings-tab-source-control');
    const busyEl = document.getElementById('scm-busy');
    if (!tab) return;

    tab.querySelectorAll('button').forEach((btn) => {
      btn.disabled = !!busy;
      btn.style.opacity = busy ? '0.6' : '';
      btn.style.cursor = busy ? 'not-allowed' : '';
    });

    const input = document.getElementById('scm-commit-message');
    if (input) input.disabled = !!busy;
    tab.querySelectorAll('input, select').forEach((el) => {
      if (el.id === 'scm-commit-message') return;
      el.disabled = !!busy;
    });

    if (busyEl) {
      busyEl.textContent = busy ? (label || 'Working...') : '';
    }
  }

  function escapeHtmlSM(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderScmFileRow(fileEntry) {
    const statusRaw = String(fileEntry?.status || 'tracked').toLowerCase();
    const known = new Set(['modified', 'added', 'deleted', 'renamed', 'untracked', 'tracked']);
    const status = known.has(statusRaw) ? statusRaw : 'tracked';
    const xy = String(fileEntry?.xy || '').trim();
    const statusLabel = `${status.toUpperCase()}${xy ? ` ${xy}` : ''}`;
    const fileRaw = String(fileEntry?.file || '');
    const filePath = escapeHtmlSM(fileRaw);
    const fileAttr = escapeHtmlSM(fileRaw);
    const actionLabel = status === 'untracked' ? 'Track' : 'Untrack';
    return `<div class="scm-file-row"><button type="button" class="scm-file-status scm-file-status-${status} scm-file-status-action" title="${actionLabel} file" data-file="${fileAttr}" data-status="${status}" onclick="SettingsModal.workspaceGitToggleFileTrackedFromStatusClick(this)">${escapeHtmlSM(statusLabel)}</button><span class="scm-file-path">${filePath}</span></div>`;
  }

  function setScmChangedFilesCollapsed(collapsed) {
    settingsModalState.scmChangedFilesCollapsed = !!collapsed;
    const panel = document.getElementById('scm-files');
    const toggle = document.getElementById('scm-files-toggle');
    if (panel) panel.style.display = collapsed ? 'none' : 'block';
    if (toggle) toggle.textContent = collapsed ? 'Expand' : 'Collapse';
  }

  function toggleScmChangedFilesPanel() {
    setScmChangedFilesCollapsed(!settingsModalState.scmChangedFilesCollapsed);
  }

  function setScmAllFilesCollapsed(collapsed) {
    settingsModalState.scmAllFilesCollapsed = !!collapsed;
    const panel = document.getElementById('scm-all-files');
    const toggle = document.getElementById('scm-all-files-toggle');
    if (panel) panel.style.display = collapsed ? 'none' : 'block';
    if (toggle) toggle.textContent = collapsed ? 'Expand' : 'Collapse';
  }

  function toggleScmAllFilesPanel() {
    setScmAllFilesCollapsed(!settingsModalState.scmAllFilesCollapsed);
  }

  function renderWorkspaceGitStatus(status) {
    const repoState = document.getElementById('scm-repo-state');
    const branch = document.getElementById('scm-branch');
    const changes = document.getElementById('scm-changes');
    const tracked = document.getElementById('scm-tracked');
    const root = document.getElementById('scm-root');
    const lastCommitEl = document.getElementById('scm-last-commit');
    const filesEl = document.getElementById('scm-files');
    const filesTitle = document.getElementById('scm-files-title');
    const allFilesEl = document.getElementById('scm-all-files');
    const allFilesTitle = document.getElementById('scm-all-files-title');

    if (!repoState || !branch || !changes || !tracked || !root || !filesEl) return;

    root.textContent = status?.root || '--';

    if (!status?.success) {
      repoState.textContent = 'Error';
      branch.textContent = '--';
      changes.textContent = status?.error || 'Unknown error';
      tracked.textContent = '--';
      if (lastCommitEl) lastCommitEl.textContent = '--';
      filesEl.textContent = status?.error || 'Status unavailable.';
      if (filesTitle) filesTitle.textContent = 'Changed files';
      if (allFilesEl) allFilesEl.textContent = status?.error || 'Status unavailable.';
      if (allFilesTitle) allFilesTitle.textContent = 'All files + status';
      setScmChangedFilesCollapsed(settingsModalState.scmChangedFilesCollapsed);
      setScmAllFilesCollapsed(settingsModalState.scmAllFilesCollapsed);
      return;
    }

    if (!status.isRepo) {
      repoState.textContent = 'No repo';
      branch.textContent = '--';
      changes.textContent = '0';
      tracked.textContent = '0';
      if (lastCommitEl) lastCommitEl.textContent = '--';
      filesEl.textContent = 'No repository initialized at workspace root.';
      if (filesTitle) filesTitle.textContent = 'Changed files';
      if (allFilesEl) allFilesEl.textContent = 'No repository initialized at workspace root.';
      if (allFilesTitle) allFilesTitle.textContent = 'All files + status';
      setScmChangedFilesCollapsed(settingsModalState.scmChangedFilesCollapsed);
      setScmAllFilesCollapsed(settingsModalState.scmAllFilesCollapsed);
      return;
    }

    repoState.textContent = 'Ready';
    branch.textContent = status.branch || 'detached';
    const c = status.counts || {};
    changes.textContent = `${c.total || 0} total | ${c.staged || 0} staged | ${c.modified || 0} modified | ${c.untracked || 0} untracked`;
    tracked.textContent = String(status.trackedCount ?? '--');
    if (lastCommitEl) {
      const lc = status?.lastCommit;
      lastCommitEl.textContent = lc && lc.short
        ? `${lc.short} ${lc.date || ''} ${lc.subject || ''}`.trim()
        : 'No commits yet';
    }

    const files = Array.isArray(status.files) ? status.files : [];
    if (filesTitle) {
      filesTitle.textContent = `Changed files (${files.length})`;
    }
    if (files.length === 0) {
      filesEl.textContent = 'Working tree clean.';
    } else {
      const rows = files.slice(0, 250).map((f) => renderScmFileRow(f));
      const overflow = files.length > 250
        ? `<div class="scm-file-row"><span class="scm-file-status scm-file-status-tracked">MORE</span><span class="scm-file-path">...and ${files.length - 250} more</span></div>`
        : '';
      filesEl.innerHTML = rows.join('') + overflow;
    }

    if (allFilesEl) {
      const allFiles = Array.isArray(status.allFiles) ? status.allFiles : [];
      if (allFiles.length === 0) {
        allFilesEl.textContent = 'No tracked files yet.';
      } else {
        const allRows = allFiles.map((f) => renderScmFileRow(f));
        const allOverflow = Number(status?.allFilesOverflow || 0) > 0
          ? `<div class="scm-file-row"><span class="scm-file-status scm-file-status-tracked">MORE</span><span class="scm-file-path">...and ${status.allFilesOverflow} more</span></div>`
          : '';
        allFilesEl.innerHTML = allRows.join('') + allOverflow;
      }
      if (allFilesTitle) {
        allFilesTitle.textContent = `All files + status (${allFiles.length}${status?.allFilesOverflow ? `+${status.allFilesOverflow}` : ''})`;
      }
    }

    setScmChangedFilesCollapsed(settingsModalState.scmChangedFilesCollapsed);
    setScmAllFilesCollapsed(settingsModalState.scmAllFilesCollapsed);
  }

  async function loadWorkspaceGitPolicy() {
    const el = document.getElementById('scm-policy');
    if (!el) return;
    try {
      const policy = await window.electronAPI.workspaceGitPolicy();
      const excludes = Array.isArray(policy?.addAllExcludes) ? policy.addAllExcludes : [];
      const includes = Array.isArray(policy?.addAllIncludes) ? policy.addAllIncludes : [];
      const lines = [
        'Active staging policy:',
        'Includes:',
        ...includes.map((s) => `+ ${s}`),
        'Excludes:',
        ...excludes.map((s) => `- ${s}`),
        policy?.note ? `Note: ${policy.note}` : ''
      ].filter(Boolean);
      el.textContent = lines.join('\n');
    } catch (err) {
      el.textContent = `Failed to load policy: ${err.message || String(err)}`;
    }
  }

  function updateWorkspaceGitRollbackUi() {
    const modeSelect = document.getElementById('scm-rollback-mode');
    const backupCheck = document.getElementById('scm-rollback-backup');
    const backupPrefix = document.getElementById('scm-rollback-backup-prefix');
    const isHard = String(modeSelect?.value || 'hard') === 'hard';
    if (backupCheck) backupCheck.disabled = !isHard;
    if (backupPrefix) backupPrefix.disabled = !(isHard && backupCheck?.checked);
  }

  async function loadWorkspaceGitRefs() {
    const branchSelect = document.getElementById('scm-branch-select');
    const mergeSelect = document.getElementById('scm-merge-source');
    const rollbackSelect = document.getElementById('scm-rollback-target');

    try {
      const branchResult = await window.electronAPI.workspaceGitBranches();
      if (branchSelect || mergeSelect) {
        if (!branchResult?.success || !branchResult?.isRepo) {
          if (branchSelect) branchSelect.innerHTML = '<option value="">(no repository)</option>';
          if (mergeSelect) mergeSelect.innerHTML = '<option value="">(no repository)</option>';
        } else {
          const rows = Array.isArray(branchResult.branches) ? branchResult.branches : [];
          if (rows.length === 0) {
            if (branchSelect) branchSelect.innerHTML = '<option value="">(no branches)</option>';
            if (mergeSelect) mergeSelect.innerHTML = '<option value="">(no branches)</option>';
          } else {
            const current = String(branchResult.current || '').trim();
            if (branchSelect) {
              branchSelect.innerHTML = rows.map((b) => {
                const label = `${b.current ? '* ' : ''}${b.name}`;
                return `<option value="${escapeHtmlSM(b.name)}">${escapeHtmlSM(label)}</option>`;
              }).join('');
              if (branchResult.current) branchSelect.value = branchResult.current;
            }

            if (mergeSelect) {
              const mergeCandidates = rows.filter((b) => b.name && b.name !== current);
              if (mergeCandidates.length === 0) {
                mergeSelect.innerHTML = '<option value="">(no merge candidates)</option>';
              } else {
                const options = ['<option value="">Select branch to merge...</option>']
                  .concat(mergeCandidates.map((b) => `<option value="${escapeHtmlSM(b.name)}">${escapeHtmlSM(b.name)}</option>`));
                mergeSelect.innerHTML = options.join('');
              }
            }
          }
        }
      }
    } catch (err) {
      if (branchSelect) branchSelect.innerHTML = `<option value="">(branch load failed: ${escapeHtmlSM(err.message || String(err))})</option>`;
      if (mergeSelect) mergeSelect.innerHTML = `<option value="">(branch load failed: ${escapeHtmlSM(err.message || String(err))})</option>`;
    }

    try {
      const historyResult = await window.electronAPI.workspaceGitHistory(40);
      if (rollbackSelect) {
        if (!historyResult?.success || !historyResult?.isRepo) {
          rollbackSelect.innerHTML = '<option value="">(no repository)</option>';
        } else {
          const commits = Array.isArray(historyResult.commits) ? historyResult.commits : [];
          if (commits.length === 0) {
            rollbackSelect.innerHTML = '<option value="">(no commits yet)</option>';
          } else {
            rollbackSelect.innerHTML = commits.map((c) => {
              const label = `${c.short || c.hash.slice(0, 7)} ${c.date || ''} ${c.subject || ''}`.trim();
              return `<option value="${escapeHtmlSM(c.hash)}">${escapeHtmlSM(label)}</option>`;
            }).join('');
          }
        }
      }
    } catch (err) {
      if (rollbackSelect) rollbackSelect.innerHTML = `<option value="">(history load failed: ${escapeHtmlSM(err.message || String(err))})</option>`;
    }
  }

  async function loadWorkspaceGitStatus() {
    try {
      const status = await window.electronAPI.workspaceGitStatus();
      settingsModalState.workspaceGitStatus = status;
      settingsModalState.workspaceGitLoaded = true;
      renderWorkspaceGitStatus(status);
      await loadWorkspaceGitRefs();
      updateWorkspaceGitRollbackUi();
      await loadWorkspaceGitPolicy();
    } catch (err) {
      renderWorkspaceGitStatus({ success: false, error: err.message || String(err) });
    }
  }

  window.SettingsModalSourceControlUi = {
    appendSourceControlLog,
    setSourceControlBusy,
    renderWorkspaceGitStatus,
    renderScmFileRow,
    escapeHtmlSM,
    setScmChangedFilesCollapsed,
    toggleScmChangedFilesPanel,
    setScmAllFilesCollapsed,
    toggleScmAllFilesPanel,
    loadWorkspaceGitPolicy,
    loadWorkspaceGitStatus,
    updateWorkspaceGitRollbackUi,
    loadWorkspaceGitRefs
  };
})();
