/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - Renderer Project Module
 */

(function() {
  'use strict';

  function createProjectModule(ctx) {
    const { state, elements, api } = ctx;

    async function handleSelectProjectRoot() {
      if (!window.electronAPI?.selectCodingProjectFolder || !window.electronAPI?.setCodingProject) {
        api.addSystemMessage('Project folder APIs are unavailable.');
        return;
      }
      try {
        const picked = await window.electronAPI.selectCodingProjectFolder();
        if (!picked?.success || !picked?.path) {
          return;
        }

        const setResult = await window.electronAPI.setCodingProject(picked.path);
        if (!setResult?.success) {
          api.addSystemMessage(`Project root set failed: ${setResult?.error || setResult?.message || 'Unknown error'}`);
          return;
        }

        state.projectPath = picked.path;
        updateProjectRootButton();
        api.addSystemMessage(`Project root set: ${picked.path}`);
        await api.refreshEditorFiles();
        await api.refreshRagBuckets();
        await api.refreshRagSources();
        await api.refreshGitStatus();
      } catch (err) {
        console.error('[CodingTerminal] Project root select error:', err);
        api.addSystemMessage(`Project root select error: ${err.message}`);
      }
    }

    function updateProjectRootButton() {
      if (!elements.btnProjectRootTop) return;
      const pathValue = String(state.projectPath || '').trim();
      if (!pathValue) {
        elements.btnProjectRootTop.textContent = 'Project Root';
        elements.btnProjectRootTop.title = 'Set Project Root (required for authoritative file access)';
        elements.btnProjectRootTop.classList.add('project-root-required');
        return;
      }
      elements.btnProjectRootTop.classList.remove('project-root-required');

      const normalized = pathValue.replace(/\\/g, '/');
      const parts = normalized.split('/').filter(Boolean);
      const name = parts.length > 0 ? parts[parts.length - 1] : normalized;
      elements.btnProjectRootTop.textContent = `Project Root: ${name}`;
      elements.btnProjectRootTop.title = `Project Root: ${pathValue}`;
    }

    function getRlmAttachmentSessionId() {
      return String(state.sessionMemorySessionId || 'coding-terminal');
    }

    function normalizeBucketId(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }

    function getRlmAttachmentTarget() {
      const bucketId = String(state.rlmAttachmentBucketId || '').trim();
      if (bucketId) return { bucketId, userId: 'coding-terminal-user' };
      return { sessionId: getRlmAttachmentSessionId() };
    }

    function formatBytes(value) {
      const size = Number(value) || 0;
      if (size < 1024) return `${size} B`;
      const kb = size / 1024;
      if (kb < 1024) return `${kb.toFixed(2)} KB`;
      const mb = kb / 1024;
      return `${mb.toFixed(2)} MB`;
    }

    async function openRlmAttachmentManager() {
      if (state.attachmentController?.openAttachmentManager) {
        await state.attachmentController.openAttachmentManager();
        return;
      }
      const existing = document.getElementById('coding-rlm-attachments-overlay');
      if (existing) {
        existing.remove();
        return;
      }
      if (!window.electronAPI?.terminalAttachmentsList) {
        api.addSystemMessage('RLM attachments API unavailable.');
        return;
      }

      const sessionId = getRlmAttachmentSessionId();
      const overlay = document.createElement('div');
      overlay.className = 'ct-modal';
      overlay.id = 'coding-rlm-attachments-overlay';
      overlay.innerHTML = `
        <div class="ct-modal-card" style="max-width: 860px; width: min(92vw, 860px);">
          <div class="ct-modal-header">
            <h3>RLM Folder</h3>
            <button class="ct-btn ct-btn-tiny" id="ct-rlm-close">Close</button>
          </div>
          <div class="ct-modal-body">
            <div style="margin-bottom:8px;color:#9ca3af;font-size:12px;">
              Session: <code>${api.escapeHtml(sessionId)}</code>
              ${state.rlmIncludeSharedAttachments ? ' | Shared pool: enabled' : ' | Shared pool: disabled'}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
              <span style="color:#9ca3af;font-size:12px;">Bucket:</span>
              <select id="ct-rlm-bucket-select"
                      style="padding:6px 8px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#fff;min-width:260px;font-size:12px;"></select>
              <button class="ct-btn ct-btn-small" id="ct-rlm-bucket-new">+ Bucket</button>
              <button class="ct-btn ct-btn-small" id="ct-rlm-bucket-access" style="border-color:#00d4ff;color:#9fe8ff;">Access</button>
              <button class="ct-btn ct-btn-small" id="ct-rlm-bucket-delete" style="border-color:#ff6b6b;color:#ff9b9b;">Delete Bucket</button>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:10px;">
              <button class="ct-btn ct-btn-small" id="ct-rlm-attach">Attach File</button>
              <button class="ct-btn ct-btn-small" id="ct-rlm-refresh">Refresh</button>
              <button class="ct-btn ct-btn-small" id="ct-rlm-clear">Clear All</button>
            </div>
            <div id="ct-rlm-list" style="max-height:50vh;overflow:auto;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px;"></div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = () => overlay.remove();
      overlay.querySelector('#ct-rlm-close')?.addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
      const bucketSelect = overlay.querySelector('#ct-rlm-bucket-select');
      let buckets = [];
      let activeBucketId = String(state.rlmAttachmentBucketId || '').trim();

      const refreshBucketOptions = () => {
        if (!bucketSelect) return;
        const options = ['<option value="" style="color:#111;background:#fff;">(Session Default)</option>'];
        for (const bucket of buckets) {
          const id = String(bucket?.id || '').trim();
          if (!id) continue;
          const label = String(bucket?.label || id);
          const selected = id === activeBucketId ? 'selected' : '';
          const scope = String(bucket?.scope || '').trim().toLowerCase();
          const scopeTag = scope === 'global-shared' ? '[Global]' : '[Local]';
          options.push(`<option value="${api.escapeHtml(id)}" ${selected} style="color:#111;background:#fff;">${api.escapeHtml(scopeTag)} ${api.escapeHtml(label)} (${api.escapeHtml(id)})</option>`);
        }
        bucketSelect.innerHTML = options.join('');
      };

      if (window.electronAPI?.terminalBucketsList) {
        const listed = await window.electronAPI.terminalBucketsList({ userId: 'coding-terminal-user' });
        buckets = Array.isArray(listed?.buckets) ? listed.buckets.filter((bucket) => {
          const scope = String(bucket?.scope || '').trim().toLowerCase();
          return scope === 'coding-terminal' || scope === 'global-shared';
        }) : [];
      }
      refreshBucketOptions();

      const renderList = async () => {
        const listEl = overlay.querySelector('#ct-rlm-list');
        if (!listEl) return;
        try {
          const result = await window.electronAPI.terminalAttachmentsList(getRlmAttachmentTarget());
          if (!result?.success) {
            listEl.innerHTML = `<div class="ct-placeholder">Failed: ${api.escapeHtml(result?.error || 'Unknown error')}</div>`;
            return;
          }
          const files = Array.isArray(result.attachments) ? result.attachments : [];
          if (files.length === 0) {
            listEl.innerHTML = '<div class="ct-placeholder">No files in this RLM folder.</div>';
            return;
          }
          listEl.innerHTML = files.map((item) => {
            const id = String(item?.id || '');
            const name = String(item?.displayName || id || 'unnamed');
            const size = Number(item?.sizeBytes || 0);
            const textFlag = item?.textExtractable ? 'text' : 'binary';
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px;border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="min-width:0;">
                  <div style="font-size:13px;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${api.escapeHtml(name)}</div>
                  <div style="font-size:11px;color:#9ca3af;">${api.escapeHtml(id)} | ${api.escapeHtml(formatBytes(size))} | ${textFlag}</div>
                </div>
                <button class="ct-btn ct-btn-tiny ct-rlm-delete" data-att-id="${encodeURIComponent(id)}">Delete</button>
              </div>
            `;
          }).join('');

          listEl.querySelectorAll('.ct-rlm-delete').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const raw = btn.getAttribute('data-att-id') || '';
              const attachmentId = decodeURIComponent(raw);
              if (!attachmentId) return;
              const yes = window.confirm(`Delete attachment?\n${attachmentId}`);
              if (!yes) return;
              const res = await window.electronAPI.terminalAttachmentsRemove({ ...getRlmAttachmentTarget(), attachmentId });
              if (!res?.success) {
                api.addSystemMessage(`RLM delete failed: ${res?.error || 'Unknown error'}`);
                return;
              }
              await renderList();
            });
          });
        } catch (err) {
          listEl.innerHTML = `<div class="ct-placeholder">Error: ${api.escapeHtml(err.message || String(err))}</div>`;
        }
      };

      overlay.querySelector('#ct-rlm-bucket-select')?.addEventListener('change', async (event) => {
        const next = normalizeBucketId(event?.target?.value || '');
        activeBucketId = next;
        state.rlmAttachmentBucketId = next;
        await renderList();
      });
      overlay.querySelector('#ct-rlm-bucket-new')?.addEventListener('click', async () => {
        if (!window.electronAPI?.terminalBucketsCreate) return;
        const raw = await api.promptText?.('New coding-terminal bucket name:', 'coding-files');
        const slug = normalizeBucketId(raw);
        if (!slug) return;
        const globalShared = window.confirm('Create as Global Shared bucket?\n\nOK = Global Shared (all three surfaces)\nCancel = Local (Coding Terminal only)');
        const bucketId = globalShared ? `global-shared-${slug}` : `coding-${slug}`;
        const scope = globalShared ? 'global-shared' : 'coding-terminal';
        const bucketSessionId = globalShared
          ? `psf-shared-${slug}`
          : `${sessionId}-bucket-${slug}`;
        const created = await window.electronAPI.terminalBucketsCreate({
          bucketId,
          label: String(raw || bucketId).trim(),
          scope,
          sessionId: bucketSessionId,
          userId: 'coding-terminal-user'
        });
        if (!created?.success) {
          api.addSystemMessage(`Create bucket failed: ${created?.error || 'Unknown error'}`);
          return;
        }
        state.rlmAttachmentBucketId = bucketId;
        activeBucketId = bucketId;
        const listed = await window.electronAPI.terminalBucketsList({ userId: 'coding-terminal-user' });
        buckets = Array.isArray(listed?.buckets) ? listed.buckets.filter((bucket) => {
          const scope = String(bucket?.scope || '').trim().toLowerCase();
          return scope === 'coding-terminal' || scope === 'global-shared';
        }) : buckets;
        refreshBucketOptions();
        await renderList();
      });
      overlay.querySelector('#ct-rlm-bucket-delete')?.addEventListener('click', async () => {
        if (!window.electronAPI?.terminalBucketsDelete) return;
        const bucketId = normalizeBucketId(activeBucketId || state.rlmAttachmentBucketId || '');
        if (!bucketId) {
          api.addSystemMessage('Select a bucket to delete.');
          return;
        }
        const listed = await window.electronAPI.terminalAttachmentsList({ bucketId, userId: 'coding-terminal-user' });
        const attachments = Array.isArray(listed?.attachments) ? listed.attachments : [];
        if (attachments.length > 0) {
          api.addSystemMessage('Bucket must be empty before deletion. Clear files first.');
          return;
        }
        const confirmed = await api.confirmAction?.(`Delete bucket "${bucketId}"?`);
        if (!confirmed) return;
        const deleted = await window.electronAPI.terminalBucketsDelete({ bucketId, userId: 'coding-terminal-user' });
        if (!deleted?.success || deleted?.removed !== true) {
          api.addSystemMessage(`Delete bucket failed: ${deleted?.error || 'permission denied or unknown error'}`);
          return;
        }
        state.rlmAttachmentBucketId = '';
        activeBucketId = '';
        const relisted = await window.electronAPI.terminalBucketsList({ userId: 'coding-terminal-user' });
        buckets = Array.isArray(relisted?.buckets) ? relisted.buckets.filter((bucket) => {
          const scope = String(bucket?.scope || '').trim().toLowerCase();
          return scope === 'coding-terminal' || scope === 'global-shared';
        }) : [];
        refreshBucketOptions();
        await renderList();
      });
      overlay.querySelector('#ct-rlm-bucket-access')?.addEventListener('click', async () => {
        if (!window.electronAPI?.terminalBucketsGrant || !window.electronAPI?.terminalBucketsRevoke) return;
        const bucketId = normalizeBucketId(activeBucketId || state.rlmAttachmentBucketId || '');
        if (!bucketId) {
          api.addSystemMessage('Select a bucket first.');
          return;
        }
        const modal = document.createElement('div');
        modal.className = 'ct-modal';
        modal.innerHTML = `
          <div class="ct-modal-card" style="max-width:620px;">
            <div class="ct-modal-header">
              <h3>Bucket Access</h3>
              <button class="ct-btn ct-btn-tiny" id="ct-access-close">Close</button>
            </div>
            <div class="ct-modal-body">
              <div style="color:#9ca3af;font-size:12px;margin-bottom:8px;">Bucket: <code>${api.escapeHtml(bucketId)}</code></div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <input id="ct-access-principal" type="text" placeholder="principal (e.g. relay-system)"
                       style="flex:1;min-width:220px;padding:8px;background:var(--ct-bg-secondary);border:1px solid var(--ct-border);color:var(--ct-text-primary);border-radius:6px;">
                <select id="ct-access-level" style="padding:8px;background:var(--ct-bg-secondary);border:1px solid var(--ct-border);color:var(--ct-text-primary);border-radius:6px;">
                  <option value="read">read</option>
                  <option value="read-write">read-write</option>
                </select>
                <button class="ct-btn ct-btn-small" id="ct-access-grant">Grant</button>
              </div>
              <div id="ct-access-list" style="margin-top:10px;max-height:36vh;overflow:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px;"></div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelector('#ct-access-close')?.addEventListener('click', close);
        modal.addEventListener('click', (e) => {
          if (e.target === modal) close();
        });
        const refreshAccess = async () => {
          const relisted = await window.electronAPI.terminalBucketsList({ userId: 'coding-terminal-user' });
          const allBuckets = Array.isArray(relisted?.buckets) ? relisted.buckets : [];
          const bucket = allBuckets.find((b) => String(b?.id || '').trim() === bucketId) || {};
          const grants = Array.isArray(bucket?.grants) ? bucket.grants : [];
          const listEl = modal.querySelector('#ct-access-list');
          if (!listEl) return;
          if (grants.length === 0) {
            listEl.innerHTML = '<div class="ct-placeholder">No explicit grants (stub-open default).</div>';
            return;
          }
          listEl.innerHTML = grants.map((g) => {
            const principal = String(g?.principal || '').trim();
            const access = String(g?.access || 'read').trim();
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:12px;"><code>${api.escapeHtml(principal)}</code> • ${api.escapeHtml(access)}</div>
                <button class="ct-btn ct-btn-tiny ct-access-revoke" data-principal="${encodeURIComponent(principal)}">Revoke</button>
              </div>
            `;
          }).join('');
          listEl.querySelectorAll('.ct-access-revoke').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const principal = decodeURIComponent(btn.getAttribute('data-principal') || '');
              if (!principal) return;
              await window.electronAPI.terminalBucketsRevoke({ bucketId, principal, userId: 'coding-terminal-user' });
              await refreshAccess();
            });
          });
        };
        modal.querySelector('#ct-access-grant')?.addEventListener('click', async () => {
          const principal = String(modal.querySelector('#ct-access-principal')?.value || '').trim();
          const access = String(modal.querySelector('#ct-access-level')?.value || 'read').trim();
          if (!principal) return;
          await window.electronAPI.terminalBucketsGrant({ bucketId, principal, access, userId: 'coding-terminal-user' });
          modal.querySelector('#ct-access-principal').value = '';
          await refreshAccess();
        });
        await refreshAccess();
      });
      overlay.querySelector('#ct-rlm-refresh')?.addEventListener('click', renderList);
      overlay.querySelector('#ct-rlm-clear')?.addEventListener('click', async () => {
        const yes = window.confirm('Clear all files from this RLM folder?');
        if (!yes) return;
        const res = await window.electronAPI.terminalAttachmentsClear(getRlmAttachmentTarget());
        if (!res?.success) {
          api.addSystemMessage(`RLM clear failed: ${res?.error || 'Unknown error'}`);
          return;
        }
        await renderList();
      });
      overlay.querySelector('#ct-rlm-attach')?.addEventListener('click', async () => {
        if (!window.electronAPI?.selectImportFile || !window.electronAPI?.terminalAttachmentsAttachFile) {
          api.addSystemMessage('Attach-file API unavailable.');
          return;
        }
        const picked = await window.electronAPI.selectImportFile({
          mode: 'attachment',
          title: 'Attach File to RLM Folder'
        });
        if (!picked?.success || !picked?.filePath) return;
        const res = await window.electronAPI.terminalAttachmentsAttachFile({
          ...getRlmAttachmentTarget(),
          sourcePath: picked.filePath
        });
        if (!res?.success) {
          api.addSystemMessage(`RLM attach failed: ${res?.error || 'Unknown error'}`);
          return;
        }
        await renderList();
      });

      await renderList();
    }

    return {
      handleSelectProjectRoot,
      updateProjectRootButton,
      openRlmAttachmentManager
    };
  }

  window.CodingTerminalRendererProject = {
    createProjectModule
  };
})();
