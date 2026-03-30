/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer UI Module
 */

(function() {
  'use strict';

  function createUiModule(ctx) {
    const { state, elements, api } = ctx;
    const agentSettingsUi = window.CodingTerminalRendererUiAgentSettings?.createAgentSettingsUi?.({ api });
    const quickSettingsUi = window.CodingTerminalRendererUiQuickSettings?.createQuickSettingsUi?.({
      state,
      elements,
      api,
      openAgentSettingsModal: () => agentSettingsUi?.openAgentSettingsModal?.()
    });

    function switchView(viewName) {
      state.currentView = viewName;

      document.querySelectorAll('.ct-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.panel === viewName);
      });

      elements.chatView?.classList.toggle('hidden', viewName !== 'chat');
      elements.editorView?.classList.toggle('hidden', viewName !== 'editor');
      if (viewName === 'editor') {
        api.refreshEditorFiles?.();
      }
    }

    function handleHeaderRagClick() {
      ensureContextVisible();
      if (state.ragCollapsed) {
        state.ragCollapsed = false;
        saveUiPreferences();
        applyRagCollapseUi();
        focusContextSection('rag');
        return;
      }
      state.ragCollapsed = true;
      saveUiPreferences();
      applyRagCollapseUi();
    }

    function handleHeaderGitClick() {
      ensureContextVisible();
      const gitFullyCollapsed = state.gitControlsCollapsed && state.gitStatusCollapsed;
      if (gitFullyCollapsed) {
        state.gitControlsCollapsed = false;
        state.gitStatusCollapsed = false;
        saveUiPreferences();
        applyGitCollapseUi();
        focusContextSection('git');
        return;
      }
      state.gitControlsCollapsed = true;
      state.gitStatusCollapsed = true;
      saveUiPreferences();
      applyGitCollapseUi();
    }

    function handleHeaderSettingsClick() {
      if (quickSettingsUi?.openQuickSettingsModal) {
        quickSettingsUi.openQuickSettingsModal();
        return;
      }
      handleContextRailToggle();
    }

    function ensureContextVisible() {
      elements.panelContext?.classList.remove('hidden');
    }

    function focusContextSection(kind) {
      const target = kind === 'git'
        ? elements.sectionGit
        : kind === 'plan'
          ? document.getElementById('section-plan-run')
          : kind === 'trace'
            ? document.getElementById('section-model-trace')
            : elements.sectionRag;
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('focus-pulse');
      setTimeout(() => target.classList.remove('focus-pulse'), 1000);
    }

    function handleContextRailToggle() {
      state.contextRailCollapsed = !state.contextRailCollapsed;
      saveUiPreferences();
      applyContextRailUi();
    }

    function handleContextRailSelect(kind) {
      state.contextRailCollapsed = false;
      saveUiPreferences();
      applyContextRailUi();
      ensureContextVisible();
      if (kind === 'rag') {
        state.ragCollapsed = false;
        saveUiPreferences();
        applyRagCollapseUi();
      } else if (kind === 'git') {
        state.gitControlsCollapsed = false;
        state.gitStatusCollapsed = false;
        saveUiPreferences();
        applyGitCollapseUi();
      }
      focusContextSection(kind);
    }

    function applyRouterDebugToggleUi() {
      if (elements.routerDebugPanel) {
        elements.routerDebugPanel.classList.toggle('hidden', !state.showRouterDebug);
      }
    }

    function addRouterDebugEntry(entry = {}) {
      state.routerDebugEntries.unshift({
        at: new Date().toISOString(),
        ...entry
      });
      if (state.routerDebugEntries.length > 10) {
        state.routerDebugEntries = state.routerDebugEntries.slice(0, 10);
      }
      renderRouterDebugPanel();
    }

    function renderRouterDebugPanel() {
      if (!elements.routerDebugList) return;
      if (!state.showRouterDebug) {
        elements.routerDebugList.innerHTML = '';
        return;
      }
      if (!state.routerDebugEntries.length) {
        elements.routerDebugList.innerHTML = '<div class="ct-router-debug-item">No router events yet.</div>';
        return;
      }
      elements.routerDebugList.innerHTML = state.routerDebugEntries.map((r) => {
        const t = String(r.at || '').split('T')[1]?.replace('Z', '') || '';
        const text =
          `${t} model=${r.model || 'n/a'} reason=${r.reason || 'n/a'} parse=${r.parse || 'n/a'}\n` +
          `raw=${r.rawHash || 'n/a'}/${r.rawLen || 0} rewrite=${r.rewriteHash || 'n/a'}/${r.rewriteLen || 0}\n` +
          `src=${r.rewriteSource || 'n/a'}`;
        return `<div class="ct-router-debug-item">${api.escapeHtml(text)}</div>`;
      }).join('');
    }

    function applyRagCollapseUi() {
      const collapsed = !!state.ragCollapsed;
      if (elements.ragSources) {
        elements.ragSources.classList.toggle('hidden', collapsed);
      }
      if (elements.ragIndexInfo) {
        const hasText = !!(elements.ragIndexInfo.textContent || '').trim();
        elements.ragIndexInfo.classList.toggle('hidden', collapsed || !hasText);
      }
      if (elements.sectionRag) {
        elements.sectionRag.classList.toggle('collapsed', collapsed);
      }
    }

    function applyGitCollapseUi() {
      const controlsCollapsed = !!state.gitControlsCollapsed;
      const statusCollapsed = !!state.gitStatusCollapsed;
      if (elements.gitControls) {
        elements.gitControls.classList.toggle('hidden', controlsCollapsed);
      }
      if (elements.gitStatusWrap) {
        elements.gitStatusWrap.classList.toggle('hidden', statusCollapsed);
      }
      if (elements.sectionGit) {
        elements.sectionGit.classList.toggle('collapsed', controlsCollapsed && statusCollapsed);
      }
    }

    function applyContextRailUi() {
      if (elements.panelContext) {
        elements.panelContext.classList.toggle('collapsed', !!state.contextRailCollapsed);
      }
      document.body.classList.toggle('ct-context-collapsed', !!state.contextRailCollapsed);
    }

    function loadUiPreferences() {
      try {
        const raw = localStorage.getItem('coding-terminal-ui');
        if (!raw) return;
        const prefs = JSON.parse(raw);
        if (typeof prefs.showThinking === 'boolean') {
          state.showThinking = prefs.showThinking;
        }
        if (typeof prefs.autoScroll === 'boolean') {
          state.autoScroll = prefs.autoScroll;
        }
        if (typeof prefs.showRouterDebug === 'boolean') {
          state.showRouterDebug = prefs.showRouterDebug;
        }
        if (typeof prefs.ragCollapsed === 'boolean') {
          state.ragCollapsed = prefs.ragCollapsed;
        }
        if (typeof prefs.gitControlsCollapsed === 'boolean') {
          state.gitControlsCollapsed = prefs.gitControlsCollapsed;
        }
        if (typeof prefs.gitStatusCollapsed === 'boolean') {
          state.gitStatusCollapsed = prefs.gitStatusCollapsed;
        }
        if (typeof prefs.contextRailCollapsed === 'boolean') {
          state.contextRailCollapsed = prefs.contextRailCollapsed;
        }
        if (typeof prefs.rlmAssisted === 'boolean') {
          state.rlmAssisted = prefs.rlmAssisted;
        }
        if (typeof prefs.rlmIncludeSharedAttachments === 'boolean') {
          state.rlmIncludeSharedAttachments = prefs.rlmIncludeSharedAttachments;
        }
        if (typeof prefs.rlmProfile === 'string') {
          state.rlmProfile = prefs.rlmProfile;
        }
        if (typeof prefs.rlmAdvancedBudgets === 'boolean') {
          state.rlmAdvancedBudgets = prefs.rlmAdvancedBudgets;
        }
        if (prefs.rlmBudgets && typeof prefs.rlmBudgets === 'object') {
          const src = prefs.rlmBudgets;
          const intInRange = (v, fallback, min, max) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(min, Math.min(max, Math.floor(n)));
          };
          state.rlmBudgets = {
            maxToolCalls: intInRange(src.maxToolCalls, 40, 4, 400),
            maxRecursionDepth: intInRange(src.maxRecursionDepth, 3, 1, 12),
            maxChunksProcessed: intInRange(src.maxChunksProcessed, 48, 4, 500),
            maxRuntimeMs: intInRange(src.maxRuntimeMs, 45000, 2000, 300000),
            maxEvidenceHits: intInRange(src.maxEvidenceHits, 28, 4, 400)
          };
        }
      } catch (err) {
        console.warn('[CodingTerminal] UI prefs load failed:', err.message);
      }
    }

    function saveUiPreferences() {
      try {
        localStorage.setItem('coding-terminal-ui', JSON.stringify({
          showThinking: state.showThinking,
          autoScroll: state.autoScroll,
          showRouterDebug: state.showRouterDebug,
          ragCollapsed: state.ragCollapsed,
          gitControlsCollapsed: state.gitControlsCollapsed,
          gitStatusCollapsed: state.gitStatusCollapsed,
          contextRailCollapsed: state.contextRailCollapsed,
          rlmAssisted: state.rlmAssisted,
          rlmIncludeSharedAttachments: state.rlmIncludeSharedAttachments,
          rlmProfile: state.rlmProfile,
          rlmAdvancedBudgets: state.rlmAdvancedBudgets,
          rlmBudgets: state.rlmBudgets
        }));
      } catch (err) {
        console.warn('[CodingTerminal] UI prefs save failed:', err.message);
      }
    }

    return {
      switchView,
      handleHeaderRagClick,
      handleHeaderGitClick,
      handleHeaderSettingsClick,
      handleContextRailToggle,
      handleContextRailSelect,
      applyRouterDebugToggleUi,
      addRouterDebugEntry,
      renderRouterDebugPanel,
      applyRagCollapseUi,
      applyGitCollapseUi,
      applyContextRailUi,
      loadUiPreferences,
      saveUiPreferences
    };
  }

  window.CodingTerminalRendererUi = {
    createUiModule
  };
})();
