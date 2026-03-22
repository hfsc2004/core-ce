/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * MoE Chat Renderer - Session/Theme Helpers
 */

(function initMoeChatSessionOps(global) {
  function createController() {
    let enabled = true;
    let history = [];
    let index = -1;
    let draft = '';

    function isEnabled() {
      return enabled;
    }

    function addPromptEntry(text) {
      if (!enabled) return;
      const value = String(text || '').trim();
      if (!value) return;
      const last = history[history.length - 1];
      if (last === value) return;
      history.push(value);
      if (history.length > 500) {
        history = history.slice(-500);
      }
      index = -1;
      draft = '';
    }

    function applyPromptRecall(inputEl, offset) {
      if (!enabled || !inputEl || history.length === 0) return false;

      if (offset < 0) {
        if (index === -1) {
          draft = inputEl.value;
        }
        if (index < history.length - 1) {
          index += 1;
        }
      } else {
        if (index === -1) return false;
        index -= 1;
      }

      if (index === -1) {
        inputEl.value = draft;
      } else {
        inputEl.value = history[history.length - 1 - index];
      }

      const cursor = inputEl.value.length;
      inputEl.setSelectionRange(cursor, cursor);
      return true;
    }

    async function loadState(electronAPI) {
      try {
        if (!electronAPI?.getSettings) {
          enabled = true;
        } else {
          const settings = await electronAPI.getSettings();
          enabled = settings?.session_memory_enabled !== false;
        }

        if (!enabled || !electronAPI?.sessionMemoryList) {
          history = [];
          index = -1;
          draft = '';
          return;
        }

        const rows = await electronAPI.sessionMemoryList({
          surface: 'moe-irg-window',
          sessionId: 'moe-chat-window',
          role: 'user',
          direction: 'asc',
          limit: 500
        });

        history = [];
        for (const row of Array.isArray(rows) ? rows : []) {
          const value = String(row?.content || '').trim();
          if (!value) continue;
          if (history[history.length - 1] === value) continue;
          history.push(value);
        }

        if (history.length > 500) {
          history = history.slice(-500);
        }

        index = -1;
        draft = '';
      } catch (_err) {
        enabled = true;
        history = [];
        index = -1;
        draft = '';
      }
    }

    function recordSessionMemory(electronAPI, entry = {}) {
      try {
        if (!enabled) return;
        if (!electronAPI || typeof electronAPI.sessionMemoryAppend !== 'function') return;
        electronAPI.sessionMemoryAppend({
          surface: 'moe-irg-window',
          sessionId: 'moe-chat-window',
          role: String(entry.role || 'user'),
          channel: String(entry.channel || 'chat'),
          content: String(entry.content || ''),
          meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {}
        }).catch(() => {});
      } catch (_err) {
        // no-op
      }
    }

    return {
      isEnabled,
      loadState,
      recordSessionMemory,
      addPromptEntry,
      applyPromptRecall
    };
  }

  async function applyGlobalThemeFromSettings(electronAPI) {
    try {
      if (!electronAPI?.getTheme) return;
      const theme = await electronAPI.getTheme();
      if (!theme || typeof theme !== 'object') return;

      const root = document.documentElement;
      const cssVarMap = {
        accent: '--psf-accent',
        accentLight: '--psf-accent-light',
        accentMedium: '--psf-accent-medium',
        accentDark: '--psf-accent-dark',
        success: '--psf-success',
        warning: '--psf-warning',
        error: '--psf-error',
        bgPrimary: '--psf-bg-primary',
        bgSecondary: '--psf-bg-secondary',
        border: '--psf-border',
        textPrimary: '--psf-text-primary',
        textSecondary: '--psf-text-secondary',
        textMuted: '--psf-text-muted'
      };

      for (const [key, cssVar] of Object.entries(cssVarMap)) {
        if (theme[key]) {
          root.style.setProperty(cssVar, theme[key]);
        }
      }
    } catch (err) {
      console.warn('[MoE Chat] Theme load failed:', err?.message || err);
    }
  }

  global.MoeChatSessionOps = {
    createController,
    applyGlobalThemeFromSettings
  };
})(window);
