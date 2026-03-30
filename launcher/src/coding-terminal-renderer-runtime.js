/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Runtime Module
 */

(function() {
  'use strict';

  function createRuntimeModule(ctx) {
    const { state, elements, api } = ctx;
    const modelHelpers = (window.CodingTerminalRendererRuntimeModels?.createRuntimeModelsHelper)
      ? window.CodingTerminalRendererRuntimeModels.createRuntimeModelsHelper({ state, elements })
      : null;
    const recallThemeHelpers = (window.CodingTerminalRendererRuntimeRecallTheme?.createRuntimeRecallThemeHelper)
      ? window.CodingTerminalRendererRuntimeRecallTheme.createRuntimeRecallThemeHelper({ state, elements })
      : null;

    async function loadModelSelector() {
      return modelHelpers?.loadModelSelector?.();
    }

    async function loadRouterModelSelector() {
      return modelHelpers?.loadRouterModelSelector?.();
    }

    async function loadRuntimeConfig() {
      if (!window.electronAPI?.getCodingConfig) return;
      try {
        const cfg = await window.electronAPI.getCodingConfig();
        state.routerMode = normalizeRouterMode(cfg?.routerMode, cfg?.routerEnabled);
        state.routerEnabled = state.routerMode !== 'off';
        state.routerUseGpu = cfg?.llamaCppRouterForceCpu === true ? false : true;
        state.ragEnabled = cfg?.ragEnabled !== false;
        state.ragDebug = !!cfg?.ragDebug;
        state.deterministicFileRead = !!cfg?.deterministicFileRead;
        state.cliAgentEnabled = !!cfg?.cliAgentEnabled;
        state.cliAgentPolicy = normalizeCliAgentPolicy(cfg?.cliAgentPolicy);
        state.cliAgentStepBudget = normalizeCliAgentStepBudget(cfg?.cliAgentStepBudget);
        state.testMode = !!cfg?.testMode;
        state.diffLegendEnabled = !!cfg?.diffLegendEnabled;
        state.diffDisplayMode = normalizeDiffDisplayMode(cfg?.diffDisplayMode);
        state.chatMode = normalizeChatMode(cfg?.chatMode);
        state.sessionMemorySessionId = String(cfg?.terminalId || 'coding-terminal');
        applyRouterToggleUi();
        applyRagToggleUi();
        applyChatModeUi();
        applyCliInlineUi();
        api.updateStatus('rag', state.ragEnabled ? 'Idle' : 'Off');
        await loadSessionMemoryRecallState();
      } catch (err) {
        console.warn('[CodingTerminal] Runtime config load error:', err.message);
      }
    }

    async function loadSessionMemoryRecallState() {
      return recallThemeHelpers?.loadSessionMemoryRecallState?.();
    }

    function addPromptRecallEntry(text) {
      return recallThemeHelpers?.addPromptRecallEntry?.(text);
    }

    function handlePromptRecallKeydown(event, inputEl, sendFn) {
      return !!recallThemeHelpers?.handlePromptRecallKeydown?.(event, inputEl, sendFn);
    }

    async function handleModelSelection() {
      if (!window.electronAPI?.selectCodingModel || !elements.modelSelect) return;
      const value = elements.modelSelect.value;
      if (!value || !value.includes('::')) return;
      state.selectedModelValue = value;

      const delim = value.indexOf('::');
      if (delim < 0) return;
      const collectionKey = value.slice(0, delim);
      const modelId = value.slice(delim + 2);
      api.updateStatus('model', 'Preparing model...');
      try {
        const result = await window.electronAPI.selectCodingModel({ collectionKey, modelId });
        if (!result?.success) {
          api.addSystemMessage(`Model select failed: ${result?.message || 'Unknown error'}`);
          api.updateStatus('model', 'Select failed');
          return;
        }

        state.modelName = result.modelName || state.modelName;
        api.addSystemMessage(`Model ready: ${state.modelName}`);
        api.updateStatus('model', state.modelName);
        await loadModelSelector();
      } catch (err) {
        console.error('[CodingTerminal] Model select error:', err);
        api.addSystemMessage(`Model select error: ${err.message}`);
        api.updateStatus('model', 'Select error');
      }
    }

    function normalizeInferenceBackend(value) {
      return String(value || '').toLowerCase().trim() === 'llama-cpp' ? 'llama-cpp' : 'ollama';
    }

    function applyInferenceBackendUi() {
      // Backend selector is exposed in Quick Settings only.
    }

    async function loadInferenceBackend() {
      const getFn = window.electronAPI?.getCodingInferenceBackend;
      if (!getFn) {
        state.inferenceBackend = 'ollama';
        applyInferenceBackendUi();
        return;
      }
      try {
        const result = await getFn();
        if (result?.success) {
          state.inferenceBackend = normalizeInferenceBackend(result.backend);
        }
        applyInferenceBackendUi();
      } catch (err) {
        console.warn('[CodingTerminal] Inference backend load error:', err.message);
        state.inferenceBackend = 'ollama';
        applyInferenceBackendUi();
      }
    }

    async function loadFooterCopyright() {
      return recallThemeHelpers?.loadFooterCopyright?.();
    }

    async function applyGlobalThemeFromSettings() {
      return recallThemeHelpers?.applyGlobalThemeFromSettings?.();
    }

    async function setInferenceBackend(desiredBackend) {
      const setFn = window.electronAPI?.setCodingInferenceBackend;
      if (!setFn) return;
      const desired = normalizeInferenceBackend(desiredBackend);
      if (desired === normalizeInferenceBackend(state.inferenceBackend)) return;
      try {
        const result = await setFn(desired);
        if (!result?.success) {
          api.addSystemMessage(`Backend switch failed: ${result?.message || 'Unknown error'}`);
          applyInferenceBackendUi();
          return;
        }
        state.inferenceBackend = normalizeInferenceBackend(result.backend);
        applyInferenceBackendUi();
        api.addSystemMessage(`Inference backend set: ${state.inferenceBackend}`);
        api.updateStatus('model', `Backend: ${state.inferenceBackend}`);
        await loadModelSelector();
        await loadRouterModelSelector();
      } catch (err) {
        console.error('[CodingTerminal] Inference backend switch error:', err);
        api.addSystemMessage(`Backend switch error: ${err.message}`);
        applyInferenceBackendUi();
      }
    }

    async function handleInferenceBackendCycle() {
      const next = normalizeInferenceBackend(state.inferenceBackend) === 'llama-cpp' ? 'ollama' : 'llama-cpp';
      await setInferenceBackend(next);
    }

    async function handleRouterModelSelection() {
      const selectFn = window.electronAPI?.selectCodingRouterModel || window.electronAPI?.selectCodingDispatcherModel;
      if (!selectFn || !elements.routerModelSelect) return;
      const modelName = (elements.routerModelSelect.value || '').trim();
      if (!modelName) return;

      try {
        const result = await selectFn({ modelName });
        if (!result?.success) {
          api.addSystemMessage(`Router select failed: ${result?.message || 'Unknown error'}`);
          return;
        }
        state.routerModelName = result.modelName || modelName;
        api.addSystemMessage(`Router ready: ${state.routerModelName}`);
        await api.loadRouterModelSelector();
      } catch (err) {
        console.error('[CodingTerminal] Router model select error:', err);
        api.addSystemMessage(`Router select error: ${err.message}`);
      }
    }

    function applyRouterToggleUi() {
      // Header toggle removed; state is reflected in Quick Settings modal/system messages.
    }

    function applyRagToggleUi() {
      // Header toggle removed; state is reflected in Quick Settings modal/status bar.
    }

    function normalizeChatMode(mode) {
      const value = String(mode || '').trim().toLowerCase();
      if (value === 'inspect') return 'inspect';
      if (value === 'generate') return 'generate';
      return 'auto';
    }

    function normalizeCliAgentPolicy(value) {
      return String(value || '').trim().toLowerCase() === 'read-only' ? 'read-only' : 'workspace-write';
    }

    function normalizeCliAgentStepBudget(value) {
      const num = Number(value);
      if (!Number.isFinite(num)) return 2;
      return Math.max(1, Math.min(Math.trunc(num), 8));
    }

    function normalizeRouterMode(mode, enabled = false) {
      const value = String(mode || '').trim().toLowerCase();
      if (value === 'on' || value === 'off') return value;
      return enabled ? 'on' : 'off';
    }

    function applyChatModeUi() {
      if (!elements.chatModeSelect) return;
      elements.chatModeSelect.value = normalizeChatMode(state.chatMode);
    }

    function applyCliInlineUi() {
      if (elements.btnCliAgentInline) {
        elements.btnCliAgentInline.textContent = `CLI: ${state.cliAgentEnabled ? 'On' : 'Off'}`;
      }
      if (elements.btnCliPolicyInline) {
        elements.btnCliPolicyInline.textContent = `Policy: ${String(state.cliAgentPolicy || 'workspace-write')}`;
      }
      if (elements.btnCliBudgetInline) {
        elements.btnCliBudgetInline.textContent = `Budget: ${Number(state.cliAgentStepBudget || 2)}`;
      }
    }

    async function handleChatModeSelection() {
      if (!elements.chatModeSelect) return;
      state.chatMode = normalizeChatMode(elements.chatModeSelect.value);
      applyChatModeUi();
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({ chatMode: state.chatMode });
        } catch (err) {
          console.warn('[CodingTerminal] Chat mode save error:', err.message);
        }
      }
      api.addSystemMessage(`Dispatch mode set: ${state.chatMode}.`);
    }

    async function handleRouterToggle() {
      const order = ['off', 'on'];
      const idx = order.indexOf(normalizeRouterMode(state.routerMode, state.routerEnabled));
      state.routerMode = order[(idx + 1) % order.length];
      state.routerEnabled = state.routerMode !== 'off';
      applyRouterToggleUi();
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({
            routerMode: state.routerMode,
            routerEnabled: state.routerEnabled
          });
        } catch (err) {
          console.warn('[CodingTerminal] Router config save error:', err.message);
        }
      }
      api.addSystemMessage(`Router ${state.routerMode === 'on' ? 'enabled (On)' : 'disabled (Off)'}.`);
    }

    async function handleRagToggle() {
      state.ragEnabled = !state.ragEnabled;
      applyRagToggleUi();
      api.updateStatus('rag', state.ragEnabled ? 'Idle' : 'Off');
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({ ragEnabled: state.ragEnabled });
        } catch (err) {
          console.warn('[CodingTerminal] RAG config save error:', err.message);
        }
      }
      api.addSystemMessage(`RAG retrieval ${state.ragEnabled ? 'enabled' : 'disabled'}.`);
    }

    async function handleRouterGpuToggle() {
      state.routerUseGpu = !state.routerUseGpu;
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({ llamaCppRouterForceCpu: !state.routerUseGpu });
        } catch (err) {
          console.warn('[CodingTerminal] Router GPU config save error:', err.message);
        }
      }
      api.addSystemMessage(`Router GPU ${state.routerUseGpu ? 'enabled' : 'disabled'} (applies on next router start).`);
    }

    async function handleRagDebugToggle() {
      state.ragDebug = !state.ragDebug;
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({ ragDebug: state.ragDebug });
        } catch (err) {
          console.warn('[CodingTerminal] RAG debug config save error:', err.message);
        }
      }
      api.addSystemMessage(`RAG debug ${state.ragDebug ? 'enabled' : 'disabled'}.`);
    }

    async function handleDeterministicToggle() {
      state.deterministicFileRead = !state.deterministicFileRead;
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({ deterministicFileRead: state.deterministicFileRead });
        } catch (err) {
          console.warn('[CodingTerminal] Deterministic config save error:', err.message);
        }
      }
      api.addSystemMessage(`Deterministic mode ${state.deterministicFileRead ? 'enabled' : 'disabled'}.`);
    }

    async function handleCliAgentToggle() {
      state.cliAgentEnabled = !state.cliAgentEnabled;
      applyCliInlineUi();
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({
            cliAgentEnabled: state.cliAgentEnabled
          });
        } catch (err) {
          console.warn('[CodingTerminal] CLI Agent config save error:', err.message);
        }
      }
      api.addSystemMessage(`CLI Agent ${state.cliAgentEnabled ? 'enabled' : 'disabled'}.`);
    }

    async function handleCliAgentPolicyCycle() {
      const next = normalizeCliAgentPolicy(state.cliAgentPolicy) === 'workspace-write'
        ? 'read-only'
        : 'workspace-write';
      state.cliAgentPolicy = next;
      applyCliInlineUi();
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({
            cliAgentPolicy: state.cliAgentPolicy
          });
        } catch (err) {
          console.warn('[CodingTerminal] CLI Agent policy save error:', err.message);
        }
      }
      api.addSystemMessage(`CLI Agent policy: ${state.cliAgentPolicy}.`);
    }

    async function handleCliAgentStepBudgetCycle() {
      const current = normalizeCliAgentStepBudget(state.cliAgentStepBudget);
      const next = current >= 8 ? 1 : (current + 1);
      state.cliAgentStepBudget = next;
      applyCliInlineUi();
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({
            cliAgentStepBudget: state.cliAgentStepBudget
          });
        } catch (err) {
          console.warn('[CodingTerminal] CLI Agent step budget save error:', err.message);
        }
      }
      api.addSystemMessage(`CLI Agent step budget: ${state.cliAgentStepBudget}.`);
    }

    async function handleTestModeToggle() {
      state.testMode = !state.testMode;
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({ testMode: state.testMode });
        } catch (err) {
          console.warn('[CodingTerminal] Test mode config save error:', err.message);
        }
      }
      api.addSystemMessage(`Test Mode ${state.testMode ? 'enabled' : 'disabled'}.`);
    }

    async function handleDiffLegendToggle() {
      state.diffLegendEnabled = !state.diffLegendEnabled;
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({ diffLegendEnabled: state.diffLegendEnabled });
        } catch (err) {
          console.warn('[CodingTerminal] Diff legend config save error:', err.message);
        }
      }
      api.addSystemMessage(`Diff Legend ${state.diffLegendEnabled ? 'enabled' : 'disabled'}.`);
    }

    function normalizeDiffDisplayMode(value) {
      const mode = String(value || '').trim().toLowerCase();
      if (mode === 'simplified' || mode === 'hidden') return mode;
      return 'raw';
    }

    function toTitleCaseDiffMode(mode) {
      const normalized = normalizeDiffDisplayMode(mode);
      if (normalized === 'simplified') return 'Simplified';
      if (normalized === 'hidden') return 'Hidden';
      return 'Raw';
    }

    async function handleDiffDisplayModeCycle() {
      const order = ['raw', 'simplified', 'hidden'];
      const current = normalizeDiffDisplayMode(state.diffDisplayMode);
      const idx = order.indexOf(current);
      const next = order[(idx + 1) % order.length];
      state.diffDisplayMode = next;
      if (window.electronAPI?.updateCodingConfig) {
        try {
          await window.electronAPI.updateCodingConfig({ diffDisplayMode: next });
        } catch (err) {
          console.warn('[CodingTerminal] Diff display config save error:', err.message);
        }
      }
      api.addSystemMessage(`Diff Display set: ${toTitleCaseDiffMode(next)}.`);
    }

    return {
      loadRuntimeConfig,
      loadModelSelector,
      loadRouterModelSelector,
      loadSessionMemoryRecallState,
      addPromptRecallEntry,
      handlePromptRecallKeydown,
      handleModelSelection,
      normalizeInferenceBackend,
      loadInferenceBackend,
      loadFooterCopyright,
      applyGlobalThemeFromSettings,
      handleInferenceBackendCycle,
      handleRouterModelSelection,
      normalizeChatMode,
      normalizeRouterMode,
      applyChatModeUi,
      handleChatModeSelection,
      handleRouterToggle,
      handleRagToggle,
      handleRouterGpuToggle,
      handleRagDebugToggle,
      handleDeterministicToggle,
      handleCliAgentToggle,
      handleCliAgentPolicyCycle,
      handleCliAgentStepBudgetCycle,
      handleTestModeToggle,
      handleDiffLegendToggle,
      normalizeDiffDisplayMode,
      toTitleCaseDiffMode,
      handleDiffDisplayModeCycle
    };
  }

  window.CodingTerminalRendererRuntime = {
    createRuntimeModule
  };
})();
