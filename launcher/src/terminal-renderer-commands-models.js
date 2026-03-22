/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createModelCommandHelpers(deps) {
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const getTerminalPort = typeof deps?.getTerminalPort === 'function' ? deps.getTerminalPort : () => 0;
    const getCurrentModel = typeof deps?.getCurrentModel === 'function' ? deps.getCurrentModel : () => null;
    const setCurrentModel = typeof deps?.setCurrentModel === 'function' ? deps.setCurrentModel : (() => {});
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});
    const clearConversationHistory = typeof deps?.clearConversationHistory === 'function' ? deps.clearConversationHistory : (() => {});
    const formatBytes = typeof deps?.formatBytes === 'function' ? deps.formatBytes : ((v) => `${v || 0} B`);

    const LAST_MODEL_KEY = 'psf_terminal_last_model';
    const SETTINGS_MODEL_PATH = ['uiState', 'psfTerminal', 'lastModel'];

    function getLastModelStorageKey() {
      const port = Number(getTerminalPort());
      if (Number.isFinite(port) && port > 0) {
        return `${LAST_MODEL_KEY}_${port}`;
      }
      return LAST_MODEL_KEY;
    }

    function persistSelectedModel(modelName) {
      const value = String(modelName || '').trim();
      if (!value) return;
      try {
        localStorage.setItem(getLastModelStorageKey(), value);
        localStorage.setItem(LAST_MODEL_KEY, value);
      } catch (_) {}
      persistSelectedModelToSettings(value);
    }

    function persistSelectedModelToSettings(value) {
      const api = getElectronAPI();
      if (!api || typeof api.getSettings !== 'function' || typeof api.saveSettings !== 'function') return;
      Promise.resolve()
        .then(() => api.getSettings())
        .then((settings) => {
          const next = (settings && typeof settings === 'object') ? { ...settings } : {};
          next.uiState = (next.uiState && typeof next.uiState === 'object') ? { ...next.uiState } : {};
          next.uiState.psfTerminal = (next.uiState.psfTerminal && typeof next.uiState.psfTerminal === 'object')
            ? { ...next.uiState.psfTerminal }
            : {};
          next.uiState.psfTerminal.lastModel = value;
          return api.saveSettings(next);
        })
        .catch(() => {});
    }

    function readStringPath(root, pathParts) {
      let current = root;
      for (const part of pathParts) {
        if (!current || typeof current !== 'object') return '';
        current = current[part];
      }
      return String(current || '').trim();
    }

    async function loadPersistedModel() {
      const api = getElectronAPI();
      if (api && typeof api.getSettings === 'function') {
        try {
          const settings = await api.getSettings();
          const settingsModel = readStringPath(settings, SETTINGS_MODEL_PATH);
          if (settingsModel) return settingsModel;
        } catch (_) {}
      }
      try {
        const global = String(localStorage.getItem(LAST_MODEL_KEY) || '').trim();
        if (global) return global;
        const scoped = String(localStorage.getItem(getLastModelStorageKey()) || '').trim();
        if (scoped) return scoped;
      } catch (_) {}
      return '';
    }

    function prewarmSelectedModel(modelName) {
      const api = getElectronAPI();
      if (!api || typeof api.ollamaSendMessage !== 'function') return;
      const target = String(modelName || '').trim();
      if (!target) return;
      const port = Number(getTerminalPort()) || 0;
      const startedAt = Date.now();
      Promise.resolve()
        .then(() => api.ollamaSendMessage(
          target,
          [{ role: 'user', content: 'ping' }],
          {
            port,
            keep_alive: '30m',
            temperature: 0,
            num_predict: 1
          }
        ))
        .then((result) => {
          if (result?.success !== false) {
            addSystemMessage(`🔥 Model prewarmed: ${target} (${Math.max(0, Date.now() - startedAt)}ms)`);
          }
        })
        .catch(() => {
          // Best effort only; first normal turn will still warm-load if needed.
        });
    }

    async function listModels() {
      try {
        addSystemMessage('📋 Fetching available models...');
        const api = getElectronAPI();
        const result = await api.getDownloadedModelsWithBlobs();
        if (result.success && result.models && result.models.length > 0) {
          addSystemMessage(`Found ${result.models.length} models:`);
          result.models.forEach((model) => {
            addSystemMessage(`  • ${model.name} (${formatBytes(model.size)})`);
          });
        } else {
          addSystemMessage('No models found or failed to fetch models');
        }
      } catch (error) {
        addErrorMessage(`Failed to list models: ${error.message}`);
      }
    }

    async function populateModelDropdown(port) {
      const select = document.getElementById('model-select');
      if (!select) return;

      try {
        const api = getElectronAPI();
        const result = await api.ollamaListModels({ port: port || getTerminalPort() });
        if (result.success && result.models && result.models.length > 0) {
          select.innerHTML = '';

          let foundMatch = false;
          let firstModelName = null;
          const current = String(getCurrentModel() || '').trim();
          const persisted = await loadPersistedModel();
          // Explicit launch model (URL/session) must win over remembered model.
          const preferred = current || persisted;

          result.models.forEach((model) => {
            const modelName = model.ollamaName || model.name;
            const modelBase = String(modelName || '').split(':')[0];
            if (!firstModelName) firstModelName = modelName;
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            const preferredBase = String(preferred || '').split(':')[0];
            if (preferred && (modelName === preferred || modelBase === preferred || modelName === preferredBase || modelBase === preferredBase)) {
              option.selected = true;
              foundMatch = true;
              setCurrentModel(modelName);
              persistSelectedModel(modelName);
            }
            select.appendChild(option);
          });

          if (!foundMatch && firstModelName) {
            setCurrentModel(firstModelName);
            select.value = firstModelName;
            addSystemMessage(`No model specified - auto-selected: ${firstModelName}`);
          }
        } else {
          select.innerHTML = '<option value="">No models available</option>';
        }
      } catch (error) {
        console.error('[Terminal] Failed to load models:', error);
        select.innerHTML = '<option value="">Failed to load models</option>';
      }
    }

    function handleModelChange(event) {
      const newModel = event?.target?.value;
      if (!newModel) return;
      setCurrentModel(newModel);
      persistSelectedModel(newModel);
      addSystemMessage(`🔄 Switched to model: ${newModel}`);
      prewarmSelectedModel(newModel);
      clearConversationHistory();
    }

    function switchModel(modelName) {
      if (modelName) {
        setCurrentModel(modelName);
        persistSelectedModel(modelName);
        prewarmSelectedModel(modelName);
        clearConversationHistory();
        addSystemMessage(`✅ Switched to model: ${modelName}`);
        addSystemMessage('⚠️  Conversation history cleared');
      } else {
        addErrorMessage('Usage: /switch <model-name>');
      }
    }

    return {
      handleModelChange,
      listModels,
      populateModelDropdown,
      switchModel
    };
  }

  window.TerminalCommandsModels = {
    createModelCommandHelpers
  };
})();
