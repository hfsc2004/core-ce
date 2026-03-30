/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createSessionController(deps) {
    const saveConversation = typeof deps?.saveConversation === 'function' ? deps.saveConversation : (() => {});
    const loadConversation = typeof deps?.loadConversation === 'function' ? deps.loadConversation : (() => {});
    const listSavedConversations = typeof deps?.listSavedConversations === 'function'
      ? deps.listSavedConversations
      : (async () => []);
    const deleteSavedConversation = typeof deps?.deleteSavedConversation === 'function'
      ? deps.deleteSavedConversation
      : (async () => false);
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});

    let modalResolve = null;
    let modalValidator = null;

    function showPrompt(title, content, defaultValue = '', options = {}) {
      return new Promise((resolve) => {
        modalResolve = resolve;
        modalValidator = options.validator || null;

        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-content').textContent = content;

        const modalDialog = document.getElementById('modal-dialog');
        if (options.danger) {
          modalDialog.classList.add('danger');
        } else {
          modalDialog.classList.remove('danger');
        }

        const warningEl = document.getElementById('modal-warning');
        if (options.warning) {
          warningEl.textContent = options.warning;
          warningEl.style.display = 'block';
        } else {
          warningEl.style.display = 'none';
        }

        const confirmBtn = document.getElementById('modal-confirm-btn');
        confirmBtn.textContent = options.confirmText || 'OK';

        const input = document.getElementById('modal-input');
        input.value = defaultValue;
        input.placeholder = options.placeholder || 'Enter value...';

        document.getElementById('prompt-modal').classList.add('active');
        input.focus();
        input.select();

        input.onkeydown = (e) => {
          if (e.key === 'Enter') {
            closeModal(true);
          } else if (e.key === 'Escape') {
            closeModal(false);
          }
        };
      });
    }

    function closeModal(confirmed) {
      if (confirmed && modalValidator) {
        const input = document.getElementById('modal-input').value;
        if (!modalValidator(input)) {
          const inputEl = document.getElementById('modal-input');
          inputEl.style.borderColor = '#ff4444';
          inputEl.style.animation = 'shake 0.3s';
          setTimeout(() => {
            inputEl.style.animation = '';
            inputEl.style.borderColor = '';
          }, 300);
          return;
        }
      }

      document.getElementById('prompt-modal').classList.remove('active');
      document.getElementById('modal-dialog').classList.remove('danger');
      modalValidator = null;

      if (modalResolve) {
        const value = confirmed ? document.getElementById('modal-input').value : null;
        modalResolve(value);
        modalResolve = null;
      }
    }

    async function getSessionList() {
      const sessions = await listSavedConversations();
      return Array.isArray(sessions) ? sessions : [];
    }

    async function promptSave() {
      const name = await showPrompt(
        '💾 Save Session',
        'Enter a name for this session:',
        `session-${new Date().toISOString().slice(0, 10)}`
      );
      if (name && name.trim()) {
        saveConversation(name.trim());
      }
    }

    async function promptLoad() {
      const sessions = await getSessionList();

      if (sessions.length === 0) {
        addSystemMessage('No saved sessions found. Use Save to create one.');
        return;
      }

      const sessionList = sessions.map(s => `• ${s}`).join('\n');
      const name = await showPrompt(
        '📂 Load Session',
        `Available sessions:\n${sessionList}\n\nEnter session name to load:`,
        sessions[0]
      );
      if (name && name.trim()) {
        await loadConversation(name.trim());
      }
    }

    async function promptDelete() {
      const sessions = await getSessionList();

      if (sessions.length === 0) {
        addSystemMessage('No saved sessions to delete.');
        return;
      }

      const sessionList = sessions.map((s, i) => `${i + 1}. ${s}`).join('\n');
      const selection = await showPrompt(
        '🗑️ Delete Session',
        `Available sessions:\n${sessionList}\n\nEnter number to delete, or "ALL" to delete all:`,
        '',
        { placeholder: 'Enter number or ALL...' }
      );

      if (!selection || !selection.trim()) return;

      const input = selection.trim().toUpperCase();

      if (input === 'ALL') {
        const confirmation = await showPrompt(
          '⚠️ Delete ALL Sessions',
          `You are about to delete ALL ${sessions.length} saved sessions.\n\nThis action cannot be undone.`,
          '',
          {
            danger: true,
            confirmText: 'Delete All',
            warning: 'Type "DELETE" to confirm',
            placeholder: 'Type DELETE to confirm...',
            validator: (val) => val.toUpperCase() === 'DELETE'
          }
        );

        if (confirmation && confirmation.toUpperCase() === 'DELETE') {
          let removed = 0;
          for (const s of sessions) {
            if (await deleteSavedConversation(s)) removed += 1;
          }
          addSystemMessage(`✅ Deleted ${removed} session${removed === 1 ? '' : 's'}.`);
        }
      } else {
        const num = parseInt(input, 10);
        if (isNaN(num) || num < 1 || num > sessions.length) {
          addSystemMessage(`Invalid selection. Enter 1-${sessions.length} or "ALL".`);
          return;
        }

        const sessionName = sessions[num - 1];
        const confirmation = await showPrompt(
          '⚠️ Confirm Deletion',
          `Delete session "${sessionName}"?\n\nThis action cannot be undone.`,
          '',
          {
            danger: true,
            confirmText: 'Delete',
            warning: 'Type "Y" or "yes" to confirm',
            placeholder: 'Type Y or yes to confirm...',
            validator: (val) => ['y', 'yes'].includes(val.toLowerCase())
          }
        );

        if (confirmation && ['y', 'yes'].includes(confirmation.toLowerCase())) {
          const removed = await deleteSavedConversation(sessionName);
          if (removed) addSystemMessage(`✅ Session "${sessionName}" deleted.`);
          else addSystemMessage(`Session "${sessionName}" not found.`);
        }
      }
    }

    return {
      showPrompt,
      closeModal,
      promptSave,
      promptLoad,
      promptDelete,
      getSessionList
    };
  }

  window.TerminalSessions = {
    createSessionController
  };
})();
