/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer RLM Module
 */

(function() {
  'use strict';

  function createRlmModule(ctx) {
    const { state, api } = ctx;

    const RLM_PROFILE_PRESETS = {
      fast: {
        quality: 'fast',
        budgets: { maxToolCalls: 20, maxRecursionDepth: 2, maxChunksProcessed: 24, maxRuntimeMs: 20000, maxEvidenceHits: 16 }
      },
      balanced: {
        quality: 'balanced',
        budgets: { maxToolCalls: 40, maxRecursionDepth: 3, maxChunksProcessed: 48, maxRuntimeMs: 45000, maxEvidenceHits: 28 }
      },
      deep: {
        quality: 'deep',
        budgets: { maxToolCalls: 80, maxRecursionDepth: 5, maxChunksProcessed: 120, maxRuntimeMs: 90000, maxEvidenceHits: 64 }
      },
      'industrial-safe': {
        quality: 'balanced',
        budgets: { maxToolCalls: 24, maxRecursionDepth: 2, maxChunksProcessed: 24, maxRuntimeMs: 30000, maxEvidenceHits: 16 }
      }
    };

    function normalizeRlmProfile(value) {
      const v = String(value || '').trim().toLowerCase();
      if (v === 'fast' || v === 'balanced' || v === 'deep' || v === 'industrial-safe' || v === 'custom') return v;
      return 'balanced';
    }

    function normalizeRlmBudgets(value) {
      const src = (value && typeof value === 'object') ? value : {};
      const intInRange = (v, fallback, min, max) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.floor(n)));
      };
      return {
        maxToolCalls: intInRange(src.maxToolCalls, 40, 4, 400),
        maxRecursionDepth: intInRange(src.maxRecursionDepth, 3, 1, 12),
        maxChunksProcessed: intInRange(src.maxChunksProcessed, 48, 4, 500),
        maxRuntimeMs: intInRange(src.maxRuntimeMs, 45000, 2000, 300000),
        maxEvidenceHits: intInRange(src.maxEvidenceHits, 28, 4, 400)
      };
    }

    function applyRlmProfile(profileName) {
      const profile = normalizeRlmProfile(profileName);
      if (profile === 'custom') {
        state.rlmProfile = 'custom';
        return;
      }
      const preset = RLM_PROFILE_PRESETS[profile] || RLM_PROFILE_PRESETS.balanced;
      state.rlmProfile = profile;
      state.rlmBudgets = normalizeRlmBudgets(preset.budgets);
    }

    function handleRlmToggle() {
      state.rlmAssisted = !state.rlmAssisted;
      api.saveUiPreferences?.();
      api.addSystemMessage?.(`RLM assisted mode: ${state.rlmAssisted ? 'ON' : 'OFF'}`);
    }

    function handleRlmSharedAttachmentsToggle() {
      state.rlmIncludeSharedAttachments = !state.rlmIncludeSharedAttachments;
      api.saveUiPreferences?.();
      api.addSystemMessage?.(`RLM shared attachments: ${state.rlmIncludeSharedAttachments ? 'ON' : 'OFF'}`);
    }

    function handleRlmProfileCycle() {
      const order = ['fast', 'balanced', 'deep', 'industrial-safe', 'custom'];
      const current = normalizeRlmProfile(state.rlmProfile);
      const idx = order.indexOf(current);
      const next = order[(idx + 1) % order.length];
      applyRlmProfile(next);
      api.saveUiPreferences?.();
      api.addSystemMessage?.(
        `RLM profile: ${state.rlmProfile} (tools=${state.rlmBudgets.maxToolCalls}, depth=${state.rlmBudgets.maxRecursionDepth}, chunks=${state.rlmBudgets.maxChunksProcessed}, runtime_ms=${state.rlmBudgets.maxRuntimeMs}, evidence=${state.rlmBudgets.maxEvidenceHits})`
      );
    }

    function handleRlmAdvancedBudgetsToggle() {
      state.rlmAdvancedBudgets = !state.rlmAdvancedBudgets;
      api.saveUiPreferences?.();
      api.addSystemMessage?.(`RLM advanced budgets: ${state.rlmAdvancedBudgets ? 'ON' : 'OFF'}`);
    }

    async function handleRlmBudgetEdit(budgetKey) {
      const key = String(budgetKey || '').trim();
      const map = {
        maxToolCalls: { label: 'Max tool calls', min: 4, max: 400 },
        maxRecursionDepth: { label: 'Max recursion depth', min: 1, max: 12 },
        maxChunksProcessed: { label: 'Max chunks processed', min: 4, max: 500 },
        maxRuntimeMs: { label: 'Max runtime ms', min: 2000, max: 300000 },
        maxEvidenceHits: { label: 'Max evidence hits', min: 4, max: 400 }
      };
      if (!map[key]) return;
      const current = normalizeRlmBudgets(state.rlmBudgets || {});
      const choice = await api.promptText?.(`${map[key].label} (${map[key].min}-${map[key].max})`, String(current[key]));
      if (choice === null || choice === undefined) return;
      const raw = parseInt(String(choice).trim(), 10);
      if (!Number.isFinite(raw)) {
        api.addSystemMessage?.(`Invalid number for ${map[key].label}.`);
        return;
      }
      const next = { ...current, [key]: raw };
      state.rlmBudgets = normalizeRlmBudgets(next);
      state.rlmProfile = 'custom';
      api.saveUiPreferences?.();
      api.addSystemMessage?.(
        `RLM budgets: tools=${state.rlmBudgets.maxToolCalls}, depth=${state.rlmBudgets.maxRecursionDepth}, ` +
        `chunks=${state.rlmBudgets.maxChunksProcessed}, runtime_ms=${state.rlmBudgets.maxRuntimeMs}, evidence=${state.rlmBudgets.maxEvidenceHits}`
      );
    }

    return {
      handleRlmToggle,
      handleRlmSharedAttachmentsToggle,
      handleRlmProfileCycle,
      handleRlmAdvancedBudgetsToggle,
      handleRlmBudgetEdit
    };
  }

  window.CodingTerminalRendererRlm = {
    createRlmModule
  };
})();

