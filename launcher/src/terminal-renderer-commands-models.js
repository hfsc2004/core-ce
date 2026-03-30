/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createModelCommandHelpers(deps) {
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const getProvider = typeof deps?.getProvider === 'function' ? deps.getProvider : () => 'ollama';
    const getTerminalPort = typeof deps?.getTerminalPort === 'function' ? deps.getTerminalPort : () => 0;
    const getCurrentModel = typeof deps?.getCurrentModel === 'function' ? deps.getCurrentModel : () => null;
    const setCurrentModel = typeof deps?.setCurrentModel === 'function' ? deps.setCurrentModel : (() => {});
    const getLlamaCppModelPath = typeof deps?.getLlamaCppModelPath === 'function' ? deps.getLlamaCppModelPath : () => '';
    const setLlamaCppModelPath = typeof deps?.setLlamaCppModelPath === 'function' ? deps.setLlamaCppModelPath : (() => {});
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});
    const clearConversationHistory = typeof deps?.clearConversationHistory === 'function' ? deps.clearConversationHistory : (() => {});
    const formatBytes = typeof deps?.formatBytes === 'function' ? deps.formatBytes : ((v) => `${v || 0} B`);

    const LAST_MODEL_KEY = 'psf_terminal_last_model';
    const LAST_MODEL_PROVIDER_KEY = 'psf_terminal_last_model_provider';
    const SETTINGS_MODEL_PATH = ['uiState', 'psfTerminal', 'lastModel'];
    const SETTINGS_PROVIDER_MODELS_PATH = ['uiState', 'psfTerminal', 'lastModelByProvider'];

    function getLastModelStorageKey() {
      const port = Number(getTerminalPort());
      if (Number.isFinite(port) && port > 0) {
        return `${LAST_MODEL_KEY}_${port}`;
      }
      return LAST_MODEL_KEY;
    }

    function getProviderModelStorageKey() {
      const provider = String(getProvider() || 'ollama').trim().toLowerCase() || 'ollama';
      const port = Number(getTerminalPort());
      if (Number.isFinite(port) && port > 0) {
        return `${LAST_MODEL_PROVIDER_KEY}_${provider}_${port}`;
      }
      return `${LAST_MODEL_PROVIDER_KEY}_${provider}`;
    }

    function persistSelectedModel(modelName) {
      const value = String(modelName || '').trim();
      if (!value) return;
      try {
        localStorage.setItem(getProviderModelStorageKey(), value);
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
          const provider = String(getProvider() || 'ollama').trim().toLowerCase() || 'ollama';
          next.uiState.psfTerminal.lastModelByProvider =
            (next.uiState.psfTerminal.lastModelByProvider && typeof next.uiState.psfTerminal.lastModelByProvider === 'object')
              ? { ...next.uiState.psfTerminal.lastModelByProvider }
              : {};
          next.uiState.psfTerminal.lastModelByProvider[provider] = value;
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
      const provider = String(getProvider() || 'ollama').trim().toLowerCase() || 'ollama';
      if (api && typeof api.getSettings === 'function') {
        try {
          const settings = await api.getSettings();
          const providerSettingsModel = readStringPath(settings, [...SETTINGS_PROVIDER_MODELS_PATH, provider]);
          if (providerSettingsModel) return providerSettingsModel;
          const settingsModel = readStringPath(settings, SETTINGS_MODEL_PATH);
          if (settingsModel) return settingsModel;
        } catch (_) {}
      }
      try {
        const providerScoped = String(localStorage.getItem(getProviderModelStorageKey()) || '').trim();
        if (providerScoped) return providerScoped;
        const scoped = String(localStorage.getItem(getLastModelStorageKey()) || '').trim();
        if (scoped) return scoped;
        const global = String(localStorage.getItem(LAST_MODEL_KEY) || '').trim();
        if (global) return global;
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
        const provider = String(getProvider() || 'ollama').trim().toLowerCase();
        addSystemMessage('📋 Fetching available models...');
        const api = getElectronAPI();
        if (provider === 'llama.cpp') {
          const result = await api.terminalListLlamaCppModels();
          if (result.success && Array.isArray(result.models) && result.models.length > 0) {
            addSystemMessage(`Found ${result.models.length} GGUF model(s):`);
            result.models.forEach((model) => {
              addSystemMessage(`  • ${model.pathRel} (${formatBytes(model.sizeBytes)})`);
            });
          } else {
            addSystemMessage('No GGUF models found on disk');
          }
          return;
        }
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
        const provider = String(getProvider() || 'ollama').trim().toLowerCase();
        if (provider === 'llama.cpp') {
          const result = await api.terminalListLlamaCppModels();
          if (result?.success && Array.isArray(result.models) && result.models.length > 0) {
            select.innerHTML = '';
            const currentModel = String(getCurrentModel() || '').trim();
            const currentPath = String(getLlamaCppModelPath() || '').trim();
            const persisted = await loadPersistedModel();
            const persistedBaseName = String(persisted || '').trim().replace(/\.gguf$/i, '');
            const preferredName = persistedBaseName || currentModel;
            let foundMatch = false;
            let firstModelName = null;
            let firstModelPath = '';
            for (const model of result.models) {
              const modelName = String(model?.name || '').trim();
              const modelPath = String(model?.pathAbs || '').trim();
              if (!modelName || !modelPath) continue;
              if (!firstModelName) {
                firstModelName = modelName;
                firstModelPath = modelPath;
              }
              const option = document.createElement('option');
              option.value = modelName;
              option.textContent = String(model.pathRel || model.filename || modelName);
              option.dataset.llamaPath = modelPath;
              if (
                (persistedBaseName && modelName === persistedBaseName) ||
                (!persistedBaseName && currentPath && (modelPath === currentPath)) ||
                (!persistedBaseName && !currentPath && preferredName && modelName === preferredName)
              ) {
                option.selected = true;
                foundMatch = true;
                setCurrentModel(modelName);
                setLlamaCppModelPath(modelPath);
                persistSelectedModel(modelName);
              }
              select.appendChild(option);
            }
            if (!foundMatch && firstModelName) {
              setCurrentModel(firstModelName);
              setLlamaCppModelPath(firstModelPath);
              select.value = firstModelName;
              persistSelectedModel(firstModelName);
              addSystemMessage(`No llama.cpp model selected - auto-selected: ${firstModelName}`);
            }
            return;
          }
          select.innerHTML = '<option value="">No GGUF models available</option>';
          return;
        }

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
      const provider = String(getProvider() || 'ollama').trim().toLowerCase();
      if (provider === 'llama.cpp') {
        const optionEl = event?.target?.selectedOptions?.[0];
        const newPath = String(optionEl?.dataset?.llamaPath || '').trim();
        if (newPath) setLlamaCppModelPath(newPath);
      }
      setCurrentModel(newModel);
      persistSelectedModel(newModel);
      if (provider === 'llama.cpp') {
        addSystemMessage(`🔄 Selected GGUF model: ${newModel}`);
        if (String(getLlamaCppModelPath() || '').trim()) {
          addSystemMessage(`   Path: ${String(getLlamaCppModelPath() || '').trim()}`);
        }
      } else {
        addSystemMessage(`🔄 Switched to model: ${newModel}`);
        prewarmSelectedModel(newModel);
      }
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
