/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Shared text input fallback for Linux/Electron text-entry drops.
 * Installs once per window and only applies to editable text controls.
 */
(function installSharedTextInputFallback() {
  'use strict';

  if (window.installPsfTextInputFallback) return;

  function installPsfTextInputFallback() {
    if (window.__psfTextInputFallbackInstalled) return;
    window.__psfTextInputFallbackInstalled = true;

    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented) return;
      if (event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = String(event.key || '');
      if (key.length !== 1) return;

      const rawTarget = event.target;
      const target =
        rawTarget && rawTarget.nodeType === Node.TEXT_NODE
          ? rawTarget.parentElement
          : rawTarget;
      if (!target) return;

      const input =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
          ? target
          : target.closest?.('input, textarea');
      if (!input || input.readOnly || input.disabled) return;

      // MoE/IRG pipeline has its own scoped key handlers; avoid double insertion.
      const inMoeWorkspace = !!target.closest?.('#model-ordering-content, #moe-rename-modal, #moe-profile-modal, #moe-chat-section');
      if (inMoeWorkspace) return;

      const type = String(input.type || '').toLowerCase();
      const isTextLike =
        input instanceof HTMLTextAreaElement ||
        ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(type);
      if (!isTextLike) return;

      if (type === 'number' && !/[0-9eE+\-.]/.test(key)) return;

      const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
      const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : input.value.length;
      const nextValue = `${input.value.slice(0, start)}${key}${input.value.slice(end)}`;

      event.preventDefault();
      input.value = nextValue;
      const cursor = start + key.length;
      if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(cursor, cursor);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);
  }

  window.installPsfTextInputFallback = installPsfTextInputFallback;
})();

