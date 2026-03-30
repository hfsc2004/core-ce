/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Shell/Utilities Module
 */

(function() {
  'use strict';

  function createShellModule(ctx) {
    const { state, elements, api } = ctx;

    function updateStatus(type, text) {
      if (type === 'rag' && state && state.ragEnabled === false) {
        text = 'Off';
      }
      const el = type === 'rag' ? elements.statusRag :
        type === 'git' ? elements.statusGit :
          type === 'model' ? elements.statusModel :
            null;

      if (el) {
        const prefix = type === 'rag' ? 'RAG: ' :
          type === 'git' ? 'Git: ' :
            type === 'model' ? 'Model: ' : '';
        el.textContent = prefix + text;
      }

    }

    function updateRagButtons() {
      if (elements.btnIndexRag) {
        elements.btnIndexRag.disabled = state.ragIndexing;
        elements.btnIndexRag.textContent = state.ragIndexing ? '…' : '⟳';
      }
      if (elements.btnAttachRag) {
        elements.btnAttachRag.disabled = state.ragIndexing;
      }
      if (elements.btnRefreshRag) {
        elements.btnRefreshRag.disabled = state.ragIndexing;
      }
      if (elements.btnRagClear) {
        elements.btnRagClear.disabled = state.ragIndexing;
      }
      if (elements.btnRagBucketNew) {
        elements.btnRagBucketNew.disabled = state.ragIndexing;
      }
      if (elements.btnRagBucketDelete) {
        elements.btnRagBucketDelete.disabled = state.ragIndexing;
      }
      if (elements.ragBucketSelect) {
        elements.ragBucketSelect.disabled = state.ragIndexing;
      }
    }

    async function promptText(message, defaultValue = '') {
      try {
        if (typeof window.prompt === 'function') {
          return window.prompt(message, defaultValue);
        }
      } catch {}
      return await openInputModal(message, defaultValue);
    }

    async function confirmAction(message) {
      try {
        if (typeof window.confirm === 'function') {
          return !!window.confirm(message);
        }
      } catch {}
      return await openConfirmModal(message);
    }

    function openInputModal(message, defaultValue = '') {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'ct-modal';
        overlay.innerHTML = `
          <div class="ct-modal-card">
            <div class="ct-modal-header"><h3>Input Required</h3></div>
            <div class="ct-modal-body">
              <p>${api.escapeHtml(message)}</p>
              <input id="ct-modal-input" type="text" value="${api.escapeHtml(defaultValue)}" style="width:100%;margin-top:10px;padding:8px;background:var(--ct-bg-secondary);border:1px solid var(--ct-border);color:var(--ct-text-primary);border-radius:6px;" />
              <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
                <button id="ct-modal-cancel" class="ct-btn ct-btn-small">Cancel</button>
                <button id="ct-modal-ok" class="ct-btn ct-btn-small">OK</button>
              </div>
            </div>
          </div>
        `;
        const cleanup = () => overlay.remove();
        overlay.querySelector('#ct-modal-cancel')?.addEventListener('click', () => {
          cleanup();
          resolve(null);
        });
        overlay.querySelector('#ct-modal-ok')?.addEventListener('click', () => {
          const val = overlay.querySelector('#ct-modal-input')?.value ?? '';
          cleanup();
          resolve(val);
        });
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            cleanup();
            resolve(null);
          }
        });
        document.body.appendChild(overlay);
        const input = overlay.querySelector('#ct-modal-input');
        if (input) input.focus();
      });
    }

    function openConfirmModal(message) {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'ct-modal';
        overlay.innerHTML = `
          <div class="ct-modal-card">
            <div class="ct-modal-header"><h3>Confirm</h3></div>
            <div class="ct-modal-body">
              <p>${api.escapeHtml(message)}</p>
              <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
                <button id="ct-modal-no" class="ct-btn ct-btn-small">Cancel</button>
                <button id="ct-modal-yes" class="ct-btn ct-btn-small">OK</button>
              </div>
            </div>
          </div>
        `;
        const cleanup = () => overlay.remove();
        overlay.querySelector('#ct-modal-no')?.addEventListener('click', () => {
          cleanup();
          resolve(false);
        });
        overlay.querySelector('#ct-modal-yes')?.addEventListener('click', () => {
          cleanup();
          resolve(true);
        });
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            cleanup();
            resolve(false);
          }
        });
        document.body.appendChild(overlay);
      });
    }

    function updateRagProgressUi(progress) {
      const percent = typeof progress.percent === 'number' ? progress.percent : 0;
      const indexed = progress.indexed ?? 0;
      const skipped = progress.skipped ?? 0;
      const errors = progress.errors ?? 0;
      updateStatus('rag', `Indexing ${percent}% (${indexed} ok, ${skipped} skip, ${errors} err)`);
      if (progress.filePath) {
        updateRagIndexInfo(progress.filePath);
      }

      const now = Date.now();
      const done = progress.phase === 'done' || percent >= 100;
      if (done || (now - state.ragLastProgressUiAt) > 2000) {
        state.ragLastProgressUiAt = now;
        api.addSystemMessage(`RAG index ${percent}% • ${indexed} indexed • ${skipped} skipped • ${errors} errors`);
      }
    }

    function updateRagIndexInfo(text) {
      if (!elements.ragIndexInfo) return;
      const value = String(text || '').trim();
      if (!value) {
        elements.ragIndexInfo.classList.add('hidden');
        elements.ragIndexInfo.textContent = '';
        return;
      }
      if (!state.ragCollapsed) {
        elements.ragIndexInfo.classList.remove('hidden');
      }
      elements.ragIndexInfo.textContent = `Indexing: ${value}`;
      elements.ragIndexInfo.title = value;
    }

    function normalizeBucketIdForUi(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }

    function handleContextMenu(e) {
      e.preventDefault();

      const existing = document.getElementById('ct-context-menu');
      if (existing) existing.remove();

      const menu = document.createElement('div');
      menu.id = 'ct-context-menu';
      menu.style.cssText = `
        position: fixed;
        top: ${e.clientY}px;
        left: ${e.clientX}px;
        background: var(--ct-bg-secondary);
        border: 1px solid var(--ct-border);
        border-radius: 6px;
        padding: 4px 0;
        z-index: 9999;
        min-width: 100px;
      `;

      const selection = window.getSelection().toString();

      if (selection) {
        addMenuItem(menu, 'Copy', () => navigator.clipboard.writeText(selection));
      }

      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        addMenuItem(menu, 'Paste', async () => {
          const text = await navigator.clipboard.readText();
          e.target.value += text;
        });
      }

      addMenuItem(menu, 'Select All', () => {
        if (e.target.select) {
          e.target.select();
        }
      });

      document.body.appendChild(menu);

      setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
      }, 0);
    }

    function addMenuItem(menu, label, onClick) {
      const item = document.createElement('div');
      item.textContent = label;
      item.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        color: var(--ct-text-primary);
        font-size: 13px;
      `;
      item.onmouseenter = () => { item.style.background = 'var(--ct-border)'; };
      item.onmouseleave = () => { item.style.background = 'transparent'; };
      item.onclick = () => {
        onClick();
        menu.remove();
      };
      menu.appendChild(item);
    }

    return {
      updateStatus,
      updateRagButtons,
      promptText,
      confirmAction,
      updateRagProgressUi,
      updateRagIndexInfo,
      normalizeBucketIdForUi,
      handleContextMenu
    };
  }

  window.CodingTerminalRendererShell = {
    createShellModule
  };
})();
