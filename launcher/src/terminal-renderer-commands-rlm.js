/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createRlmCommandHelpers(deps) {
    const getRlmProfile = typeof deps?.getRlmProfile === 'function' ? deps.getRlmProfile : () => 'balanced';
    const setRlmProfile = typeof deps?.setRlmProfile === 'function' ? deps.setRlmProfile : (() => {});
    const getRlmProvider = typeof deps?.getRlmProvider === 'function' ? deps.getRlmProvider : () => 'legacy';
    const setRlmProvider = typeof deps?.setRlmProvider === 'function' ? deps.setRlmProvider : (() => {});
    const getRlmQuality = typeof deps?.getRlmQuality === 'function' ? deps.getRlmQuality : () => 'balanced';
    const setRlmQuality = typeof deps?.setRlmQuality === 'function' ? deps.setRlmQuality : (() => {});
    const getRlmAssisted = typeof deps?.getRlmAssisted === 'function' ? deps.getRlmAssisted : () => false;
    const setRlmAssisted = typeof deps?.setRlmAssisted === 'function' ? deps.setRlmAssisted : (() => {});
    const getRlmVerboseTrace = typeof deps?.getRlmVerboseTrace === 'function' ? deps.getRlmVerboseTrace : () => false;
    const setRlmVerboseTrace = typeof deps?.setRlmVerboseTrace === 'function' ? deps.setRlmVerboseTrace : (() => {});
    const getRlmIncludeSharedAttachments = typeof deps?.getRlmIncludeSharedAttachments === 'function'
      ? deps.getRlmIncludeSharedAttachments
      : () => false;
    const setRlmIncludeSharedAttachments = typeof deps?.setRlmIncludeSharedAttachments === 'function'
      ? deps.setRlmIncludeSharedAttachments
      : (() => {});
    const getRlmAdvancedBudgets = typeof deps?.getRlmAdvancedBudgets === 'function' ? deps.getRlmAdvancedBudgets : () => false;
    const setRlmAdvancedBudgets = typeof deps?.setRlmAdvancedBudgets === 'function' ? deps.setRlmAdvancedBudgets : (() => {});
    const getRlmBudgets = typeof deps?.getRlmBudgets === 'function' ? deps.getRlmBudgets : () => ({});
    const setRlmBudgets = typeof deps?.setRlmBudgets === 'function' ? deps.setRlmBudgets : (() => {});
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});

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

    function normalizeProfile(value) {
      const key = String(value || '').trim().toLowerCase();
      if (key === 'fast' || key === 'balanced' || key === 'deep' || key === 'industrial-safe' || key === 'custom') return key;
      return 'balanced';
    }

    function applyRlmProfile(profileName, announce = true) {
      const profile = normalizeProfile(profileName);
      if (profile === 'custom') {
        setRlmProfile('custom');
        if (announce) addSystemMessage('RLM profile: custom');
        return;
      }
      const preset = RLM_PROFILE_PRESETS[profile] || RLM_PROFILE_PRESETS.balanced;
      setRlmQuality(preset.quality);
      setRlmBudgets(preset.budgets);
      setRlmProfile(profile);
      if (announce) {
        const b = getRlmBudgets() || {};
        addSystemMessage(
          `RLM profile: ${profile} (quality=${preset.quality}, tools=${b.maxToolCalls}, depth=${b.maxRecursionDepth}, chunks=${b.maxChunksProcessed}, runtime_ms=${b.maxRuntimeMs}, evidence=${b.maxEvidenceHits})`
        );
      }
    }

    function updateAdvancedBudgetVisibility() {
      const advancedInput = document.getElementById('cfg-rlm-advanced');
      const wrap = document.getElementById('cfg-rlm-budgets-wrap');
      if (!wrap) return;
      const enabled = !!(advancedInput && advancedInput.checked);
      wrap.style.display = enabled ? 'grid' : 'none';
    }

    function handleRlmCommand(mode) {
      if (!mode || mode === 'status') {
        addSystemMessage(`RLM assisted mode: ${getRlmAssisted() ? 'ON' : 'OFF'}`);
        addSystemMessage(`RLM profile: ${normalizeProfile(getRlmProfile())}`);
        addSystemMessage(`RLM provider: ${String(getRlmProvider() || 'legacy')}`);
        addSystemMessage(`RLM quality: ${String(getRlmQuality() || 'balanced')}`);
        addSystemMessage(`RLM verbose trace: ${getRlmVerboseTrace() ? 'ON' : 'OFF'}`);
        addSystemMessage(`RLM include shared attachments: ${getRlmIncludeSharedAttachments() ? 'ON' : 'OFF'}`);
        const budgets = getRlmBudgets() || {};
        addSystemMessage(`RLM budgets: tools=${budgets.maxToolCalls}, depth=${budgets.maxRecursionDepth}, chunks=${budgets.maxChunksProcessed}, runtime_ms=${budgets.maxRuntimeMs}, evidence=${budgets.maxEvidenceHits}`);
      } else if (mode === 'on') {
        setRlmAssisted(true);
        addSystemMessage('RLM assisted mode: ON');
      } else if (mode === 'off') {
        setRlmAssisted(false);
        addSystemMessage('RLM assisted mode: OFF');
      } else if (mode === 'verbose on') {
        setRlmVerboseTrace(true);
        addSystemMessage('RLM verbose trace: ON');
      } else if (mode === 'verbose off') {
        setRlmVerboseTrace(false);
        addSystemMessage('RLM verbose trace: OFF');
      } else if (mode === 'quality fast' || mode === 'quality balanced' || mode === 'quality deep') {
        const quality = mode.replace('quality ', '').trim();
        setRlmQuality(quality);
        setRlmProfile('custom');
        addSystemMessage(`RLM quality: ${quality}`);
      } else if (mode === 'profile fast' || mode === 'profile balanced' || mode === 'profile deep' || mode === 'profile industrial-safe' || mode === 'profile custom') {
        const profile = mode.replace('profile ', '').trim();
        applyRlmProfile(profile, true);
      } else if (mode === 'provider legacy') {
        setRlmProvider('legacy');
        addSystemMessage('RLM provider: legacy');
      } else if (mode === 'provider engine') {
        setRlmProvider('engine');
        addSystemMessage('RLM provider: engine');
      } else if (mode === 'shared on') {
        setRlmIncludeSharedAttachments(true);
        addSystemMessage('RLM include shared attachments: ON');
      } else if (mode === 'shared off') {
        setRlmIncludeSharedAttachments(false);
        addSystemMessage('RLM include shared attachments: OFF');
      } else if (mode.startsWith('budget ')) {
        const segments = mode.split(/\s+/).filter(Boolean);
        if (segments.length === 3) {
          const key = segments[1];
          const value = parseInt(segments[2], 10);
          const current = getRlmBudgets() || {};
          const next = { ...current };
          if (key === 'tools' || key === 'max_tool_calls') next.maxToolCalls = value;
          else if (key === 'depth' || key === 'max_recursion_depth') next.maxRecursionDepth = value;
          else if (key === 'chunks' || key === 'max_chunks_processed') next.maxChunksProcessed = value;
          else if (key === 'runtime' || key === 'runtime_ms' || key === 'max_runtime_ms') next.maxRuntimeMs = value;
          else if (key === 'evidence' || key === 'max_evidence_hits') next.maxEvidenceHits = value;
          else {
            addErrorMessage('Unknown RLM budget key. Use tools|depth|chunks|runtime|evidence');
            return;
          }
          setRlmBudgets(next);
          setRlmProfile('custom');
          const out = getRlmBudgets() || {};
          addSystemMessage(`RLM budgets updated: tools=${out.maxToolCalls}, depth=${out.maxRecursionDepth}, chunks=${out.maxChunksProcessed}, runtime_ms=${out.maxRuntimeMs}, evidence=${out.maxEvidenceHits}`);
        } else {
          addErrorMessage('Usage: /rlm budget <tools|depth|chunks|runtime|evidence> <value>');
        }
      } else {
        addErrorMessage('Usage: /rlm [on|off|status|provider legacy|provider engine|profile fast|profile balanced|profile deep|profile industrial-safe|profile custom|verbose on|verbose off|quality fast|quality balanced|quality deep|shared on|shared off|budget <name> <value>]');
      }
    }

    return {
      normalizeProfile,
      applyRlmProfile,
      updateAdvancedBudgetVisibility,
      handleRlmCommand
    };
  }

  window.TerminalCommandsRlm = {
    createRlmCommandHelpers
  };
})();
