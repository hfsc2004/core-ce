/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
(function() {
  'use strict';

  function createMemoryController(deps) {
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const getSessionId = typeof deps?.getSessionId === 'function' ? deps.getSessionId : () => 'terminal-default';
    const getUserInput = typeof deps?.getUserInput === 'function' ? deps.getUserInput : () => null;

    let sessionMemoryEnabled = true;
    let inputRecallHistory = [];
    let inputRecallIndex = -1;
    let inputRecallDraft = '';

    function isSessionMemoryEnabled() {
      return sessionMemoryEnabled;
    }

    function recordSessionMemory(entry = {}) {
      try {
        if (!sessionMemoryEnabled) return;
        const api = getElectronAPI();
        if (!api || typeof api.sessionMemoryAppend !== 'function') return;
        const payload = {
          surface: 'psf-terminal',
          sessionId: getSessionId(),
          role: String(entry.role || 'user'),
          channel: String(entry.channel || 'chat'),
          content: String(entry.content || ''),
          meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {}
        };
        api.sessionMemoryAppend(payload).catch(() => {});
      } catch (_) {
        // no-op
      }
    }

    async function loadSessionMemoryPreferences() {
      try {
        const api = getElectronAPI();
        if (!api || typeof api.getSettings !== 'function') {
          sessionMemoryEnabled = true;
          return;
        }
        const settings = await api.getSettings();
        sessionMemoryEnabled = settings?.session_memory_enabled !== false;
      } catch (_) {
        sessionMemoryEnabled = true;
      }
    }

    function addInputRecallEntry(text) {
      if (!sessionMemoryEnabled) return;
      const value = String(text || '').trim();
      if (!value) return;
      const last = inputRecallHistory[inputRecallHistory.length - 1];
      if (last === value) return;
      inputRecallHistory.push(value);
      if (inputRecallHistory.length > 500) {
        inputRecallHistory = inputRecallHistory.slice(-500);
      }
      inputRecallIndex = -1;
      inputRecallDraft = '';
    }

    function applyInputRecall(offset) {
      const userInput = getUserInput();
      if (!sessionMemoryEnabled || !userInput || inputRecallHistory.length === 0) return false;
      if (offset < 0) {
        if (inputRecallIndex === -1) {
          inputRecallDraft = userInput.value;
        }
        if (inputRecallIndex < inputRecallHistory.length - 1) {
          inputRecallIndex += 1;
        }
      } else {
        if (inputRecallIndex === -1) return false;
        inputRecallIndex -= 1;
      }

      if (inputRecallIndex === -1) {
        userInput.value = inputRecallDraft;
      } else {
        userInput.value = inputRecallHistory[inputRecallHistory.length - 1 - inputRecallIndex];
      }
      const cursor = userInput.value.length;
      userInput.setSelectionRange(cursor, cursor);
      return true;
    }

    async function loadInputRecallHistory() {
      if (!sessionMemoryEnabled) return;
      const api = getElectronAPI();
      if (!api || typeof api.sessionMemoryList !== 'function') return;
      try {
        const rows = await api.sessionMemoryList({
          surface: 'psf-terminal',
          sessionId: getSessionId(),
          role: 'user',
          direction: 'asc',
          limit: 500
        });
        if (!Array.isArray(rows)) return;
        inputRecallHistory = [];
        for (const row of rows) {
          const value = String(row?.content || '').trim();
          if (!value) continue;
          if (inputRecallHistory[inputRecallHistory.length - 1] === value) continue;
          inputRecallHistory.push(value);
        }
        if (inputRecallHistory.length > 500) {
          inputRecallHistory = inputRecallHistory.slice(-500);
        }
        inputRecallIndex = -1;
        inputRecallDraft = '';
      } catch (_) {
        // no-op
      }
    }

    return {
      isSessionMemoryEnabled,
      recordSessionMemory,
      loadSessionMemoryPreferences,
      addInputRecallEntry,
      applyInputRecall,
      loadInputRecallHistory
    };
  }

  window.TerminalMemory = {
    createMemoryController
  };
})();
