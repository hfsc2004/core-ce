/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';
function getSourceControlTabHTML() {
  return `
    <div class="settings-section">
      <h3>Workspace Source Control</h3>
      <p class="settings-description">
        Git for the overall PSF workspace root (separate from Coding Terminal project Git).
      </p>

      <div id="scm-status-box" class="scm-status-box">
        <div class="scm-status-row">
          <span class="scm-pill">Repo: <strong id="scm-repo-state">Checking...</strong></span>
          <span class="scm-pill">Branch: <strong id="scm-branch">--</strong></span>
          <span class="scm-pill">Changes: <strong id="scm-changes">--</strong></span>
          <span class="scm-pill">Tracked: <strong id="scm-tracked">--</strong></span>
        </div>
        <div class="scm-root">Root: <span id="scm-root">--</span></div>
        <div class="scm-root">Last Commit: <span id="scm-last-commit">--</span></div>
      </div>

      <div class="scm-actions">
        <button class="btn-secondary" onclick="SettingsModal.workspaceGitRefresh()">↻ Refresh</button>
        <button class="btn-secondary" onclick="SettingsModal.workspaceGitInit()">Init</button>
        <button class="btn-secondary" onclick="SettingsModal.workspaceGitAddAll()">Add All</button>
        <button class="btn-secondary" onclick="SettingsModal.openWorkspaceGitGuide()">Open Git Guide</button>
        <span id="scm-busy" style="color:#888; font-size:12px; align-self:center;"></span>
      </div>

      <div class="scm-commit-group">
        <input id="scm-commit-message" class="settings-input" placeholder="Commit message..." />
        <button class="btn-primary" onclick="SettingsModal.workspaceGitCommit()">Commit</button>
      </div>

      <div class="scm-inline-group">
        <select id="scm-branch-select" class="settings-input" title="Branches">
          <option value="">(no branches)</option>
        </select>
        <button class="btn-secondary" onclick="SettingsModal.workspaceGitCheckoutSelectedBranch()">Checkout</button>
      </div>

      <div class="scm-inline-group">
        <input id="scm-new-branch" class="settings-input" placeholder="New branch name..." />
        <button class="btn-secondary" onclick="SettingsModal.workspaceGitCreateBranch()">Create Branch</button>
      </div>

      <div class="scm-inline-group">
        <select id="scm-merge-source" class="settings-input" title="Select branch to merge into current">
          <option value="">Select branch to merge...</option>
        </select>
        <button class="btn-secondary" onclick="SettingsModal.workspaceGitMergeSelectedBranch()">Merge</button>
      </div>

      <div class="scm-inline-group">
        <select id="scm-rollback-mode" class="settings-input" title="Rollback mode" onchange="SettingsModal.updateWorkspaceGitRollbackUi()">
          <option value="hard" selected>Hard reset (destructive)</option>
          <option value="soft">Soft reset (keep working tree)</option>
        </select>
        <select id="scm-rollback-target" class="settings-input" title="Rollback target">
          <option value="">(no commits)</option>
        </select>
        <button class="btn-secondary" onclick="SettingsModal.workspaceGitRollbackToSelected()">Rollback</button>
      </div>
      <div class="scm-inline-group">
        <label class="scm-inline-check">
          <input id="scm-rollback-backup" type="checkbox" checked onchange="SettingsModal.updateWorkspaceGitRollbackUi()" />
          Auto backup branch before hard rollback
        </label>
        <input id="scm-rollback-backup-prefix" class="settings-input" placeholder="Backup branch prefix (default: backup/pre-reset)" />
      </div>

      <div id="scm-log" class="scm-log">No actions yet.</div>
      <div class="scm-panel-head">
        <div id="scm-files-title" class="scm-panel-title">Changed files</div>
        <button id="scm-files-toggle" class="btn-secondary" onclick="SettingsModal.toggleScmChangedFilesPanel()">Collapse</button>
      </div>
      <div id="scm-files" class="scm-files">Changed files will appear here after refresh.</div>
      <div class="scm-panel-head">
        <div id="scm-all-files-title" class="scm-panel-title">All files + status</div>
        <button id="scm-all-files-toggle" class="btn-secondary" onclick="SettingsModal.toggleScmAllFilesPanel()">Expand</button>
      </div>
      <div id="scm-all-files" class="scm-files" style="display:none;">All files will appear here after refresh.</div>
      <div id="scm-policy" class="scm-files">Loading exclusion policy...</div>
    </div>
  `;
}

  window.SettingsModalTemplatesSourceControl = { getSourceControlTabHTML };
})();
