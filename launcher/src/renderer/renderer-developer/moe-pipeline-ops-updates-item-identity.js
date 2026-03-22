/**
 * MoE Pipeline Ops Updates - Item Identity
 * Extracted from moe-pipeline-ops-updates.js
 */
function updateMoeItemName(itemId, name) {
  const item = window.modelOrderingState.moeItems.find(i => i.id === itemId);
  if (item) {
    item.name = name;
    console.log('[MoE] Updated name:', itemId, name);
  }
}

function promptRenameMoeItem(itemId) {
  const item = window.modelOrderingState.moeItems.find(i => i.id === itemId);
  if (!item) return;
  const currentName = String(item.name || '').trim() || 'Untitled';

  const existing = document.getElementById('moe-rename-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'moe-rename-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:10050;';
  overlay.innerHTML = `
    <div style="width:min(520px,92vw);background:#111827;border:1px solid rgba(255,255,255,0.16);border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.12);background:#0f172a;">
        <strong style="color:#e5e7eb;font-size:13px;">Rename ${item.type}</strong>
        <button id="moe-rename-close" style="background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:18px;line-height:1;">×</button>
      </div>
      <div style="padding:14px;">
        <input id="moe-rename-input" type="text" value="${String(currentName).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"
               style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.08);border:1px solid #374151;border-radius:8px;color:#fff;outline:none;">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 14px;border-top:1px solid rgba(255,255,255,0.12);">
        <button id="moe-rename-cancel" style="padding:8px 12px;background:transparent;border:1px solid #4b5563;border-radius:6px;color:#d1d5db;cursor:pointer;">Cancel</button>
        <button id="moe-rename-save" style="padding:8px 14px;background:rgba(0,212,255,0.2);border:1px solid #00d4ff;border-radius:6px;color:#00d4ff;cursor:pointer;">Save</button>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  const commit = () => {
    const input = overlay.querySelector('#moe-rename-input');
    const nextName = String(input?.value || '').replace(/\s+/g, ' ').trim();
    if (nextName && nextName !== currentName) {
      item.name = nextName;
      console.log('[MoE] Renamed item:', itemId, nextName);
      renderModelOrdering();
    }
    close();
  };

  document.body.appendChild(overlay);
  const input = overlay.querySelector('#moe-rename-input');
  if (input) {
    input.focus();
    input.select();
    input.addEventListener('keydown', (event) => {
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
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
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
  }
  overlay.querySelector('#moe-rename-close')?.addEventListener('click', close);
  overlay.querySelector('#moe-rename-cancel')?.addEventListener('click', close);
  overlay.querySelector('#moe-rename-save')?.addEventListener('click', commit);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
}

function updateMoeItemLabel(itemId, label) {
  const item = window.modelOrderingState.moeItems.find(i => i.id === itemId);
  if (item) {
    item.label = label;
    console.log('[MoE] Updated label:', itemId, label);
  }
}


window.updateMoeItemName = updateMoeItemName;
window.promptRenameMoeItem = promptRenameMoeItem;
window.updateMoeItemLabel = updateMoeItemLabel;
