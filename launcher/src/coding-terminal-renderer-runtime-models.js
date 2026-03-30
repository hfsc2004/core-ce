/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Runtime Models Helper
 */

(function() {
  'use strict';

  function createRuntimeModelsHelper(ctx) {
    const { state, elements } = ctx;

    async function loadModelSelector() {
      if (!window.electronAPI?.listCodingModels || !elements.modelSelect) return;
      try {
        const result = await window.electronAPI.listCodingModels();
        if (!result?.success) {
          elements.modelSelect.innerHTML = '<option value="">Coder unavailable</option>';
          return;
        }

        state.models = result.models || [];
        if (state.models.length === 0) {
          elements.modelSelect.innerHTML = '<option value="">No coder models found</option>';
          return;
        }

        const preferredValue = state.selectedModelValue || elements.modelSelect.value || '';
        elements.modelSelect.innerHTML = '';
        for (const m of state.models) {
          const option = document.createElement('option');
          option.value = `${m.collectionKey}::${m.modelId}`;
          option.textContent = `Coder: ${m.displayName}`;
          if (m.selected) option.selected = true;
          elements.modelSelect.appendChild(option);
        }

        if (preferredValue && state.models.some((m) => `${m.collectionKey}::${m.modelId}` === preferredValue)) {
          elements.modelSelect.value = preferredValue;
        }

        const selected = state.models.find((m) => m.selected) || state.models[0];
        if (selected) {
          state.modelName = selected.ollamaName || selected.displayName;
          state.selectedModelValue = `${selected.collectionKey}::${selected.modelId}`;
          if (elements.modelSelect.value !== state.selectedModelValue) {
            elements.modelSelect.value = state.selectedModelValue;
          }
        }
      } catch (err) {
        console.error('[CodingTerminal] Model list error:', err);
        elements.modelSelect.innerHTML = '<option value="">Coder list error</option>';
      }
    }

    async function loadRouterModelSelector() {
      const listFn = window.electronAPI?.listCodingRouterModels || window.electronAPI?.listCodingDispatcherModels;
      if (!listFn || !elements.routerModelSelect) return;
      try {
        const result = await listFn();
        if (!result?.success) {
          elements.routerModelSelect.innerHTML = '<option value="">Router unavailable</option>';
          return;
        }

        state.routerModels = result.models || [];
        if (state.routerModels.length === 0) {
          elements.routerModelSelect.innerHTML = '<option value="">No router models found</option>';
          return;
        }

        elements.routerModelSelect.innerHTML = '';
        for (const m of state.routerModels) {
          const option = document.createElement('option');
          option.value = m.name;
          option.textContent = `Router: ${m.displayName || m.name}`;
          if (m.selected) option.selected = true;
          elements.routerModelSelect.appendChild(option);
        }

        const selected = state.routerModels.find((m) => m.selected) || state.routerModels[0];
        if (selected) {
          state.routerModelName = selected.name;
        }
      } catch (err) {
        console.error('[CodingTerminal] Router model list error:', err);
        elements.routerModelSelect.innerHTML = '<option value="">Router list error</option>';
      }
    }

    return {
      loadModelSelector,
      loadRouterModelSelector
    };
  }

  window.CodingTerminalRendererRuntimeModels = {
    createRuntimeModelsHelper
  };
})();
