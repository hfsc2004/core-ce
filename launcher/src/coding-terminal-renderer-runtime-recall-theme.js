/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Runtime Recall/Theme Helper
 */

(function() {
  'use strict';

  function createRuntimeRecallThemeHelper(ctx) {
    const { state, elements } = ctx;

    async function loadSessionMemoryRecallState() {
      try {
        if (!window.electronAPI?.getSettings) {
          state.sessionMemoryEnabled = true;
        } else {
          const settings = await window.electronAPI.getSettings();
          state.sessionMemoryEnabled = settings?.session_memory_enabled !== false;
        }
        if (!state.sessionMemoryEnabled || !window.electronAPI?.sessionMemoryList) {
          state.promptRecallHistory = [];
          state.promptRecallIndex = -1;
          state.promptRecallDraft = '';
          return;
        }
        const rows = await window.electronAPI.sessionMemoryList({
          surface: 'coding-terminal',
          sessionId: state.sessionMemorySessionId,
          role: 'user',
          direction: 'asc',
          limit: 500
        });
        const history = [];
        for (const row of Array.isArray(rows) ? rows : []) {
          const value = String(row?.content || '').trim();
          if (!value) continue;
          if (history[history.length - 1] === value) continue;
          history.push(value);
        }
        state.promptRecallHistory = history.slice(-500);
        state.promptRecallIndex = -1;
        state.promptRecallDraft = '';
      } catch (err) {
        console.warn('[CodingTerminal] Session memory recall load failed:', err.message);
        state.promptRecallHistory = [];
        state.promptRecallIndex = -1;
        state.promptRecallDraft = '';
      }
    }

    function addPromptRecallEntry(text) {
      if (!state.sessionMemoryEnabled) return;
      const value = String(text || '').trim();
      if (!value) return;
      const last = state.promptRecallHistory[state.promptRecallHistory.length - 1];
      if (last === value) return;
      state.promptRecallHistory.push(value);
      if (state.promptRecallHistory.length > 500) {
        state.promptRecallHistory = state.promptRecallHistory.slice(-500);
      }
      state.promptRecallIndex = -1;
      state.promptRecallDraft = '';
    }

    function applyPromptRecall(inputEl, offset) {
      if (!state.sessionMemoryEnabled || !inputEl || state.promptRecallHistory.length === 0) return false;
      if (offset < 0) {
        if (state.promptRecallIndex === -1) {
          state.promptRecallDraft = inputEl.value;
        }
        if (state.promptRecallIndex < state.promptRecallHistory.length - 1) {
          state.promptRecallIndex += 1;
        }
      } else {
        if (state.promptRecallIndex === -1) return false;
        state.promptRecallIndex -= 1;
      }
      if (state.promptRecallIndex === -1) {
        inputEl.value = state.promptRecallDraft;
      } else {
        inputEl.value = state.promptRecallHistory[state.promptRecallHistory.length - 1 - state.promptRecallIndex];
      }
      const cursor = inputEl.value.length;
      inputEl.setSelectionRange(cursor, cursor);
      return true;
    }

    function handlePromptRecallKeydown(event, inputEl, sendFn) {
      if (event.key === 'ArrowUp') {
        if (applyPromptRecall(inputEl, -1)) {
          event.preventDefault();
          return true;
        }
        return false;
      }
      if (event.key === 'ArrowDown') {
        if (applyPromptRecall(inputEl, 1)) {
          event.preventDefault();
          return true;
        }
        return false;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendFn();
        return true;
      }
      return false;
    }

    async function loadFooterCopyright() {
      let year = new Date().getFullYear();
      let version = '';
      if (window.electronAPI?.getVersionStatus) {
        try {
          const result = await window.electronAPI.getVersionStatus();
          if (result?.success && Number.isInteger(result?.copyrightYear)) {
            year = result.copyrightYear;
          }
          if (result?.success && typeof result?.truthVersion === 'string' && result.truthVersion.trim()) {
            version = result.truthVersion.trim();
          }
        } catch (err) {
          console.warn('[CodingTerminal] Version status load error:', err.message);
        }
      }
      if (!version && window.electronAPI?.getCurrentVersion) {
        try {
          const result = await window.electronAPI.getCurrentVersion();
          if (result?.success && typeof result?.version === 'string' && result.version.trim()) {
            version = result.version.trim();
          }
        } catch (err) {
          console.warn('[CodingTerminal] Current version load error:', err.message);
        }
      }
      if (elements.statusCopyright) {
        const versionTag = version ? `v${version}` : 'vUnknown';
        elements.statusCopyright.textContent = `Copyright © ${year} Pseudo Science Fiction. All rights reserved. • Core-CE ${versionTag}`;
      }
    }

    async function applyGlobalThemeFromSettings() {
      try {
        if (!window.electronAPI?.getTheme) return;
        const theme = await window.electronAPI.getTheme();
        if (!theme || typeof theme !== 'object') return;

        const root = document.documentElement;
        const cssVarMap = {
          accent: '--ct-accent',
          accentDark: '--ct-accent-hover',
          success: '--ct-success',
          warning: '--ct-warning',
          error: '--ct-error',
          bgPrimary: '--ct-bg-primary',
          bgSecondary: '--ct-bg-secondary',
          border: '--ct-border',
          textPrimary: '--ct-text-primary',
          textSecondary: '--ct-text-secondary',
          textMuted: '--ct-text-muted'
        };

        for (const [key, cssVar] of Object.entries(cssVarMap)) {
          if (theme[key]) root.style.setProperty(cssVar, theme[key]);
        }

        if (theme.border) {
          root.style.setProperty('--ct-border-light', theme.border);
        }
        if (theme.bgPrimary) {
          root.style.setProperty('--ct-bg-tertiary', theme.bgPrimary);
        }
      } catch (err) {
        console.warn('[CodingTerminal] Theme load failed:', err.message);
      }
    }

    return {
      loadSessionMemoryRecallState,
      addPromptRecallEntry,
      handlePromptRecallKeydown,
      loadFooterCopyright,
      applyGlobalThemeFromSettings
    };
  }

  window.CodingTerminalRendererRuntimeRecallTheme = {
    createRuntimeRecallThemeHelper
  };
})();
