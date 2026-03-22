/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - Renderer Git Module
 */

(function() {
  'use strict';

  function createGitModule(ctx) {
    const { state, elements, api } = ctx;

    async function refreshGitStatus() {
      state.gitStatusLabel = 'Checking...';
      api.updateStatus('git', state.gitStatusLabel);

      try {
        if (window.electronAPI?.gitStatus) {
          const result = await window.electronAPI.gitStatus();
          if (result?.error) {
            state.gitStatus = null;
            if (/not a git repository/i.test(result.error)) {
              state.gitStatusLabel = 'No repo';
            } else if (/no project set/i.test(result.error)) {
              state.gitStatusLabel = 'No project';
            } else {
              state.gitStatusLabel = 'Error';
            }
            if (elements.gitStatus) {
              const project = state.projectPath ? api.escapeHtml(state.projectPath) : '';
              const projectLine = project
                ? `<p class="ct-placeholder"><strong>Project Root:</strong> ${project}</p>`
                : '<p class="ct-placeholder"><strong>Project Root:</strong> (not set)</p>';
              const hintLine = /not a git repository/i.test(result.error)
                ? '<p class="ct-placeholder">Click <code>init</code> to initialize Git in this folder.</p>'
                : '';
              elements.gitStatus.innerHTML = `${projectLine}<p class="ct-placeholder">${api.escapeHtml(result.error)}</p>${hintLine}`;
            }
          } else {
            state.gitStatus = result;
            if (result?.projectPath && result.projectPath !== state.projectPath) {
              state.projectPath = result.projectPath;
            }
            state.gitStatusLabel = result?.branch || 'Repo';
          }
          renderGitStatus();
        }
      } catch (err) {
        console.error('[CodingTerminal] Git refresh error:', err);
        state.gitStatus = null;
        state.gitStatusLabel = 'Error';
      } finally {
        api.updateStatus('git', state.gitStatusLabel || 'N/A');
      }
    }

    function renderGitStatus() {
      if (!elements.gitStatus) return;
      if (!state.gitStatus) {
        elements.gitStatus.innerHTML = '<p class="ct-placeholder">No repository detected.</p>';
        return;
      }

      const { branch, files, clean } = state.gitStatus;
      const safeFiles = files || { staged: [], unstaged: [], untracked: [], tracked: [], ignored: [] };
      let html = `
        <div class="ct-git-branch">
          <span>⎇</span>
          <span class="ct-git-branch-name">${branch || 'unknown'}</span>
        </div>
      `;
      if (state.projectPath) {
        html += `<p class="ct-placeholder"><strong>Project Root:</strong> ${api.escapeHtml(state.projectPath)}</p>`;
      }
      if (state.gitStatus?.cwd) {
        html += `<p class="ct-placeholder"><strong>Git CWD:</strong> ${api.escapeHtml(state.gitStatus.cwd)}</p>`;
      }

      if (clean) {
        html += '<p class="ct-placeholder">Working directory clean</p>';
      } else {
        html += '<div class="ct-git-files">';
        const allFiles = [
          ...(safeFiles.staged || []).map(f => ({ ...f, staged: true })),
          ...(safeFiles.unstaged || []).map(f => ({ ...f, staged: false })),
          ...(safeFiles.untracked || []).map(path => ({ path, status: 'untracked' }))
        ];
        allFiles.slice(0, 10).forEach(file => {
          const path = file.path || file;
          const status = file.status || 'modified';
          html += `
            <div class="ct-git-file">
              <span>${path}</span>
              <span class="ct-git-file-status ${status}">${status}</span>
            </div>
          `;
        });
        if (allFiles.length > 10) {
          html += `<p class="ct-placeholder">...and ${allFiles.length - 10} more</p>`;
        }
        html += '</div>';
      }

      const trackedFiles = Array.isArray(safeFiles.tracked) ? safeFiles.tracked : [];
      const untrackedFiles = Array.isArray(safeFiles.untracked) ? safeFiles.untracked : [];
      if (trackedFiles.length > 0 || untrackedFiles.length > 0) {
        html += '<div class="ct-git-files">';
        html += `<p class="ct-placeholder"><strong>Tracked:</strong> ${trackedFiles.length} | <strong>Untracked:</strong> ${untrackedFiles.length}</p>`;
        trackedFiles.slice(0, 10).forEach((p) => {
          html += `
            <div class="ct-git-file">
              <span>${api.escapeHtml(p)}</span>
              <span class="ct-git-file-status unchanged">tracked</span>
            </div>
          `;
        });
        if (trackedFiles.length > 10) {
          html += `<p class="ct-placeholder">...and ${trackedFiles.length - 10} more tracked files</p>`;
        }
        untrackedFiles.slice(0, 10).forEach((p) => {
          html += `
            <div class="ct-git-file">
              <span>${api.escapeHtml(p)}</span>
              <span class="ct-git-file-status untracked">untracked</span>
            </div>
          `;
        });
        if (untrackedFiles.length > 10) {
          html += `<p class="ct-placeholder">...and ${untrackedFiles.length - 10} more untracked files</p>`;
        }
        html += '</div>';
      }

      const ignoredCount = Array.isArray(safeFiles.ignored) ? safeFiles.ignored.length : 0;
      if (ignoredCount > 0) {
        html += `<p class="ct-placeholder">Ignored files: ${ignoredCount}</p>`;
      }

      elements.gitStatus.innerHTML = html;
    }

    return {
      refreshGitStatus,
      renderGitStatus
    };
  }

  window.CodingTerminalRendererGit = {
    createGitModule
  };
})();
