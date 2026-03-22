/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
(function() {
  'use strict';

  function createAttachmentManager(deps) {
    const getSessionId = typeof deps?.getSessionId === 'function' ? deps.getSessionId : () => 'terminal-default';
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});
    const escapeHtml = typeof deps?.escapeHtml === 'function' ? deps.escapeHtml : ((v) => String(v || ''));
    const formatBytes = typeof deps?.formatBytes === 'function' ? deps.formatBytes : ((v) => `${v || 0} B`);
    const clearAttachments = typeof deps?.clearAttachments === 'function' ? deps.clearAttachments : (async () => {});
    const getAttachmentTarget = typeof deps?.getAttachmentTarget === 'function'
      ? deps.getAttachmentTarget
      : (() => ({ sessionId: getSessionId() }));
    const getAttachmentBucketId = typeof deps?.getAttachmentBucketId === 'function'
      ? deps.getAttachmentBucketId
      : (() => '');
    const setAttachmentBucketId = typeof deps?.setAttachmentBucketId === 'function'
      ? deps.setAttachmentBucketId
      : (() => '');
    const normalizeBucketId = typeof deps?.normalizeBucketId === 'function'
      ? deps.normalizeBucketId
      : ((v) => String(v || '').trim().toLowerCase());
    const BUCKET_PRINCIPAL = 'terminal-user';

    async function promptBucketDetails(panelEl, defaultValue = 'terminal-files') {
      if (!panelEl) return null;
      return new Promise((resolve) => {
        const blocker = document.createElement('div');
        blocker.style.cssText = [
          'position:absolute',
          'inset:0',
          'background:rgba(0,0,0,0.65)',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'z-index:5'
        ].join(';');
        blocker.innerHTML = `
          <div style="width:min(460px,92%);background:#0b1220;border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:12px;box-shadow:0 12px 30px rgba(0,0,0,0.5);">
            <div style="color:#e5e7eb;font-size:13px;font-weight:600;margin-bottom:8px;">New Bucket</div>
            <div style="color:#9ca3af;font-size:12px;margin-bottom:8px;">Enter bucket name:</div>
            <input id="term-bucket-name-input" type="text"
                   value="${escapeHtml(String(defaultValue || ''))}"
                   style="width:100%;padding:8px 10px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#fff;outline:none;">
            <label style="display:flex;align-items:center;gap:8px;color:#9ca3af;font-size:12px;margin-top:10px;cursor:pointer;">
              <input id="term-bucket-global" type="checkbox" />
              <span>Global Shared (visible across Relay, Terminal, Coding Terminal)</span>
            </label>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
              <button id="term-bucket-cancel" style="padding:6px 10px;background:transparent;border:1px solid #4b5563;border-radius:6px;color:#d1d5db;cursor:pointer;">Cancel</button>
              <button id="term-bucket-create" style="padding:6px 10px;background:rgba(0,212,255,0.16);border:1px solid #00d4ff;border-radius:6px;color:#9fe8ff;cursor:pointer;">Create</button>
            </div>
          </div>
        `;
        const cleanup = (value) => {
          blocker.remove();
          resolve(value);
        };
        panelEl.appendChild(blocker);
        const input = blocker.querySelector('#term-bucket-name-input');
        const cancelBtn = blocker.querySelector('#term-bucket-cancel');
        const createBtn = blocker.querySelector('#term-bucket-create');
        const submit = () => {
          const raw = String(input?.value || '').trim();
          const slug = normalizeBucketId(raw);
          if (!slug) {
            if (input) {
              input.style.borderColor = '#ef4444';
              input.focus();
            }
            return;
          }
          const globalShared = blocker.querySelector('#term-bucket-global')?.checked === true;
          cleanup({
            name: raw,
            globalShared
          });
        };
        cancelBtn?.addEventListener('click', () => cleanup(null));
        createBtn?.addEventListener('click', submit);
        blocker.addEventListener('click', (event) => {
          if (event.target === blocker) cleanup(null);
        });
        input?.addEventListener('keydown', (event) => {
          event.stopPropagation();
          if (event.defaultPrevented) return;
          const target = event.currentTarget;
          const isTextInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
          const hasRange = isTextInput
            && Number.isInteger(target.selectionStart)
            && Number.isInteger(target.selectionEnd);
          const insertText = (text) => {
            if (!isTextInput || !hasRange) return;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            target.value = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
            const cursor = start + text.length;
            target.setSelectionRange(cursor, cursor);
          };
          const deleteBackward = () => {
            if (!isTextInput || !hasRange) return;
            let start = target.selectionStart;
            const end = target.selectionEnd;
            if (start !== end) {
              target.value = `${target.value.slice(0, start)}${target.value.slice(end)}`;
              target.setSelectionRange(start, start);
              return;
            }
            if (start <= 0) return;
            target.value = `${target.value.slice(0, start - 1)}${target.value.slice(end)}`;
            start -= 1;
            target.setSelectionRange(start, start);
          };
          const deleteForward = () => {
            if (!isTextInput || !hasRange) return;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            if (start !== end) {
              target.value = `${target.value.slice(0, start)}${target.value.slice(end)}`;
              target.setSelectionRange(start, start);
              return;
            }
            if (end >= target.value.length) return;
            target.value = `${target.value.slice(0, start)}${target.value.slice(end + 1)}`;
            target.setSelectionRange(start, start);
          };
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cleanup(null);
          } else if (event.key === 'Backspace') {
            event.preventDefault();
            deleteBackward();
          } else if (event.key === 'Delete') {
            event.preventDefault();
            deleteForward();
          } else if (event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            insertText(event.key);
          }
        });
        input?.focus();
        input?.select();
      });
    }

    function closeAttachmentManager() {
      const existing = document.getElementById('terminal-attachments-overlay');
      if (existing) existing.remove();
    }

    async function openAttachmentManager() {
      try {
        const api = getElectronAPI();
        const target = getAttachmentTarget();
        const result = await api.terminalAttachmentsList(target);
        const attachments = Array.isArray(result?.attachments) ? result.attachments : [];

        closeAttachmentManager();

        const overlay = document.createElement('div');
        overlay.id = 'terminal-attachments-overlay';
        overlay.style.cssText = [
          'position:fixed',
          'inset:0',
          'background:rgba(0,0,0,0.72)',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'z-index:30050'
        ].join(';');

        const panel = document.createElement('div');
        panel.style.cssText = [
          'position:relative',
          'width:min(920px,92vw)',
          'height:min(74vh,700px)',
          'background:#111827',
          'border:1px solid rgba(255,255,255,0.2)',
          'border-radius:10px',
          'display:flex',
          'flex-direction:column',
          'overflow:hidden'
        ].join(';');

        const totalBytes = attachments.reduce((sum, item) => sum + (Number(item?.sizeBytes) || 0), 0);
        panel.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.15);background:#0f172a;">
            <div style="display:grid;gap:6px;">
              <strong style="color:#e5e7eb;font-size:13px;">Attached Files (${attachments.length})</strong>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="color:#9ca3af;font-size:11px;">Bucket:</span>
                <select id="terminal-attachments-bucket-select"
                        style="padding:5px 8px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#fff;font-size:11px;min-width:220px;"></select>
                <button id="terminal-attachments-bucket-new"
                        style="padding:5px 8px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#ddd;cursor:pointer;font-size:11px;">+ Bucket</button>
                <button id="terminal-attachments-bucket-access"
                        style="padding:5px 8px;background:rgba(0,212,255,0.12);border:1px solid #00d4ff;border-radius:6px;color:#9fe8ff;cursor:pointer;font-size:11px;">Access</button>
                <button id="terminal-attachments-bucket-delete"
                        style="padding:5px 8px;background:rgba(255,107,107,0.12);border:1px solid #ff6b6b;border-radius:6px;color:#ff9b9b;cursor:pointer;font-size:11px;">Delete Bucket</button>
              </div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
              <span style="color:#9ca3af;font-size:12px;">${escapeHtml(formatBytes(totalBytes))}</span>
              <button id="terminal-attachments-close" style="background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:18px;line-height:1;">×</button>
            </div>
          </div>
          <div id="terminal-attachments-list" style="padding:12px;overflow:auto;flex:1;background:#0b1220;"></div>
          <div style="display:flex;justify-content:flex-end;gap:10px;padding:12px;border-top:1px solid rgba(255,255,255,0.12);background:#0f172a;">
            <button id="terminal-attachments-clear" style="padding:8px 12px;background:rgba(255,107,107,0.15);border:1px solid #ff6b6b;border-radius:6px;color:#ff6b6b;cursor:pointer;">Clear All</button>
            <button id="terminal-attachments-done" style="padding:8px 12px;background:rgba(0,212,255,0.15);border:1px solid #00d4ff;border-radius:6px;color:#00d4ff;cursor:pointer;">Done</button>
          </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        const bucketSelect = panel.querySelector('#terminal-attachments-bucket-select');
        let buckets = [];
        let activeBucketId = String(getAttachmentBucketId() || '').trim();

        const refreshBucketOptions = () => {
          if (!bucketSelect) return;
          const options = ['<option value="" style="color:#111;background:#fff;">(Session Default)</option>'];
          for (const bucket of buckets) {
            const id = String(bucket?.id || '').trim();
            if (!id) continue;
            const label = String(bucket?.label || id).trim();
            const selected = id === activeBucketId ? 'selected' : '';
            const scope = String(bucket?.scope || '').trim().toLowerCase();
            const scopeTag = scope === 'global-shared' ? '[Global]' : '[Local]';
            options.push(`<option value="${escapeHtml(id)}" ${selected} style="color:#111;background:#fff;">${escapeHtml(scopeTag)} ${escapeHtml(label)} (${escapeHtml(id)})</option>`);
          }
          bucketSelect.innerHTML = options.join('');
        };

        if (api?.terminalBucketsList) {
          const listed = await api.terminalBucketsList({ userId: BUCKET_PRINCIPAL });
          buckets = Array.isArray(listed?.buckets) ? listed.buckets.filter((bucket) => {
            const scope = String(bucket?.scope || '').trim().toLowerCase();
            return scope === 'terminal' || scope === 'global-shared';
          }) : [];
          refreshBucketOptions();
        }

        const listDiv = panel.querySelector('#terminal-attachments-list');
        if (listDiv) {
          if (attachments.length === 0) {
            listDiv.innerHTML = '<div style="color:#9ca3af;font-size:13px;">No attachments for this terminal session.</div>';
          } else {
            listDiv.innerHTML = attachments.map((item) => {
              const id = String(item?.id || '');
              const displayName = escapeHtml(String(item?.displayName || 'unnamed'));
              const size = formatBytes(Number(item?.sizeBytes) || 0);
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,0.03);">
                  <div style="min-width:0;">
                    <div style="color:#e5e7eb;font-size:13px;word-break:break-word;">${displayName}</div>
                    <div style="color:#9ca3af;font-size:11px;">${escapeHtml(id)} • ${escapeHtml(size)}</div>
                  </div>
                  <button data-attachment-id="${escapeHtml(id)}" style="padding:6px 10px;background:rgba(255,107,107,0.15);border:1px solid #ff6b6b;border-radius:6px;color:#ff6b6b;cursor:pointer;font-size:12px;">
                    🗑️ Delete
                  </button>
                </div>
              `;
            }).join('');

            listDiv.querySelectorAll('button[data-attachment-id]').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const attachmentId = btn.getAttribute('data-attachment-id') || '';
                if (!attachmentId) return;
                try {
                  const res = await api.terminalAttachmentsRemove({
                    ...getAttachmentTarget(),
                    attachmentId
                  });
                  if (!res || res.success === false) {
                    addErrorMessage(`Detach failed: ${res?.error || res?.message || 'unknown error'}`);
                    return;
                  }
                  await openAttachmentManager();
                } catch (err) {
                  addErrorMessage(`Detach failed: ${err.message || err}`);
                }
              });
            });
          }
        }

        panel.querySelector('#terminal-attachments-close')?.addEventListener('click', closeAttachmentManager);
        panel.querySelector('#terminal-attachments-done')?.addEventListener('click', closeAttachmentManager);
        panel.querySelector('#terminal-attachments-bucket-select')?.addEventListener('change', async (event) => {
          const next = normalizeBucketId(event?.target?.value || '');
          activeBucketId = setAttachmentBucketId(next);
          await openAttachmentManager();
        });
        panel.querySelector('#terminal-attachments-bucket-new')?.addEventListener('click', async () => {
          if (!api?.terminalBucketsCreate) return;
          const details = await promptBucketDetails(panel, 'terminal-files');
          const raw = String(details?.name || '').trim();
          const slug = normalizeBucketId(raw);
          if (!slug) return;
          const globalShared = details?.globalShared === true;
          const scope = globalShared ? 'global-shared' : 'terminal';
          const bucketId = globalShared ? `global-shared-${slug}` : `terminal-${slug}`;
          const sessionId = globalShared
            ? `psf-shared-${slug}`
            : `${String(getSessionId() || 'terminal-default')}-bucket-${slug}`;
          const created = await api.terminalBucketsCreate({
            bucketId,
            label: String(raw || bucketId).trim(),
            scope,
            sessionId,
            userId: BUCKET_PRINCIPAL
          });
          if (!created?.success) {
            addErrorMessage(`Bucket create failed: ${created?.error || 'unknown error'}`);
            return;
          }
          setAttachmentBucketId(bucketId);
          await openAttachmentManager();
        });
        panel.querySelector('#terminal-attachments-bucket-access')?.addEventListener('click', async () => {
          if (!api?.terminalBucketsGrant || !api?.terminalBucketsRevoke) return;
          const bucketId = normalizeBucketId(getAttachmentBucketId());
          if (!bucketId) {
            addErrorMessage('Select a bucket first.');
            return;
          }
          const bucket = buckets.find((b) => String(b?.id || '').trim() === bucketId) || null;
          const blocker = document.createElement('div');
          blocker.style.cssText = [
            'position:absolute',
            'inset:0',
            'background:rgba(0,0,0,0.65)',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'z-index:6'
          ].join(';');
          blocker.innerHTML = `
            <div style="width:min(560px,94%);background:#0b1220;border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="color:#e5e7eb;font-size:13px;font-weight:600;">Bucket Access</div>
                <button id="term-access-close" style="padding:4px 8px;background:transparent;border:1px solid #4b5563;border-radius:6px;color:#d1d5db;cursor:pointer;">Close</button>
              </div>
              <div style="color:#9ca3af;font-size:11px;margin-top:6px;">Bucket: <code>${escapeHtml(bucketId)}</code></div>
              <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
                <input id="term-access-principal" type="text" placeholder="principal (e.g. relay-system)"
                       style="flex:1;min-width:220px;padding:7px 9px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#fff;">
                <select id="term-access-level" style="padding:7px 9px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#fff;">
                  <option value="read" style="color:#111;background:#fff;">read</option>
                  <option value="read-write" style="color:#111;background:#fff;">read-write</option>
                </select>
                <button id="term-access-grant" style="padding:7px 10px;background:rgba(0,212,255,0.16);border:1px solid #00d4ff;border-radius:6px;color:#9fe8ff;cursor:pointer;">Grant</button>
              </div>
              <div id="term-access-list" style="margin-top:10px;max-height:34vh;overflow:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px;"></div>
            </div>
          `;
          const refresh = async () => {
            const relisted = await api.terminalBucketsList({ userId: BUCKET_PRINCIPAL });
            buckets = Array.isArray(relisted?.buckets) ? relisted.buckets.filter((b) => {
              const scope = String(b?.scope || '').trim().toLowerCase();
              return scope === 'terminal' || scope === 'global-shared';
            }) : buckets;
            const current = buckets.find((b) => String(b?.id || '').trim() === bucketId) || {};
            const grants = Array.isArray(current?.grants) ? current.grants : [];
            const listEl = blocker.querySelector('#term-access-list');
            if (!listEl) return;
            if (grants.length === 0) {
              listEl.innerHTML = '<div style="color:#9ca3af;font-size:12px;">No explicit grants (stub-open default).</div>';
              return;
            }
            listEl.innerHTML = grants.map((g) => {
              const principal = String(g?.principal || '').trim();
              const access = String(g?.access || 'read').trim();
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
                  <div style="color:#e5e7eb;font-size:12px;"><code>${escapeHtml(principal)}</code> • ${escapeHtml(access)}</div>
                  <button data-principal="${escapeHtml(principal)}" class="term-access-revoke"
                          style="padding:5px 8px;background:rgba(255,107,107,0.12);border:1px solid #ff6b6b;border-radius:6px;color:#ff9b9b;cursor:pointer;font-size:11px;">Revoke</button>
                </div>
              `;
            }).join('');
            listEl.querySelectorAll('.term-access-revoke').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const principal = String(btn.getAttribute('data-principal') || '').trim();
                if (!principal) return;
                await api.terminalBucketsRevoke({ bucketId, principal, userId: BUCKET_PRINCIPAL });
                await refresh();
              });
            });
          };
          panel.appendChild(blocker);
          blocker.querySelector('#term-access-close')?.addEventListener('click', () => blocker.remove());
          blocker.addEventListener('click', (event) => {
            if (event.target === blocker) blocker.remove();
          });
          blocker.querySelector('#term-access-grant')?.addEventListener('click', async () => {
            const principal = String(blocker.querySelector('#term-access-principal')?.value || '').trim();
            const access = String(blocker.querySelector('#term-access-level')?.value || 'read').trim();
            if (!principal) return;
            await api.terminalBucketsGrant({ bucketId, principal, access, userId: BUCKET_PRINCIPAL });
            blocker.querySelector('#term-access-principal').value = '';
            await refresh();
          });
          await refresh();
        });
        panel.querySelector('#terminal-attachments-bucket-delete')?.addEventListener('click', async () => {
          if (!api?.terminalBucketsDelete) return;
          const bucketId = normalizeBucketId(getAttachmentBucketId());
          if (!bucketId) {
            addErrorMessage('Select a bucket to delete.');
            return;
          }
          const listed = await api.terminalAttachmentsList({ bucketId, userId: BUCKET_PRINCIPAL });
          const attachments = Array.isArray(listed?.attachments) ? listed.attachments : [];
          if (attachments.length > 0) {
            addErrorMessage('Bucket must be empty before deletion. Clear files first.');
            return;
          }
          const ok = window.confirm(`Delete bucket "${bucketId}"?`);
          if (!ok) return;
          const deleted = await api.terminalBucketsDelete({ bucketId, userId: BUCKET_PRINCIPAL });
          if (!deleted?.success || deleted?.removed !== true) {
            addErrorMessage(`Delete bucket failed: ${deleted?.error || 'permission denied or unknown error'}`);
            return;
          }
          setAttachmentBucketId('');
          await openAttachmentManager();
        });
        panel.querySelector('#terminal-attachments-clear')?.addEventListener('click', async () => {
          const yes = window.confirm('Clear all attached files for this terminal session?');
          if (!yes) return;
          await clearAttachments();
          await openAttachmentManager();
        });
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) closeAttachmentManager();
        });
      } catch (err) {
        addErrorMessage(`Failed to list attachments: ${err.message || err}`);
      }
    }

    return {
      closeAttachmentManager,
      openAttachmentManager
    };
  }

  window.TerminalAttachmentManager = {
    createAttachmentManager
  };
})();
