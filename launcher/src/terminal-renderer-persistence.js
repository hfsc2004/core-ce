/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
(function() {
  'use strict';

  function createPersistenceController(deps) {
    const getCurrentModel = typeof deps?.getCurrentModel === 'function' ? deps.getCurrentModel : () => null;
    const setCurrentModel = typeof deps?.setCurrentModel === 'function' ? deps.setCurrentModel : (() => {});
    const getTerminalPort = typeof deps?.getTerminalPort === 'function' ? deps.getTerminalPort : () => 0;
    const getSystemPrompt = typeof deps?.getSystemPrompt === 'function' ? deps.getSystemPrompt : () => null;
    const setSystemPrompt = typeof deps?.setSystemPrompt === 'function' ? deps.setSystemPrompt : (() => {});
    const getTemperature = typeof deps?.getTemperature === 'function' ? deps.getTemperature : () => 0.7;
    const setTemperature = typeof deps?.setTemperature === 'function' ? deps.setTemperature : (() => {});
    const getTopP = typeof deps?.getTopP === 'function' ? deps.getTopP : () => null;
    const setTopP = typeof deps?.setTopP === 'function' ? deps.setTopP : (() => {});
    const getTopK = typeof deps?.getTopK === 'function' ? deps.getTopK : () => null;
    const setTopK = typeof deps?.setTopK === 'function' ? deps.setTopK : (() => {});
    const getNumCtx = typeof deps?.getNumCtx === 'function' ? deps.getNumCtx : () => null;
    const setNumCtx = typeof deps?.setNumCtx === 'function' ? deps.setNumCtx : (() => {});
    const getNumPredict = typeof deps?.getNumPredict === 'function' ? deps.getNumPredict : () => null;
    const setNumPredict = typeof deps?.setNumPredict === 'function' ? deps.setNumPredict : (() => {});
    const getRepeatPenalty = typeof deps?.getRepeatPenalty === 'function' ? deps.getRepeatPenalty : () => null;
    const setRepeatPenalty = typeof deps?.setRepeatPenalty === 'function' ? deps.setRepeatPenalty : (() => {});
    const getSeed = typeof deps?.getSeed === 'function' ? deps.getSeed : () => null;
    const setSeed = typeof deps?.setSeed === 'function' ? deps.setSeed : (() => {});
    const getStopSequences = typeof deps?.getStopSequences === 'function' ? deps.getStopSequences : () => null;
    const setStopSequences = typeof deps?.setStopSequences === 'function' ? deps.setStopSequences : (() => {});
    const getConversationHistory = typeof deps?.getConversationHistory === 'function' ? deps.getConversationHistory : () => [];
    const setConversationHistory = typeof deps?.setConversationHistory === 'function' ? deps.setConversationHistory : (() => {});
    const clearChatDisplay = typeof deps?.clearChatDisplay === 'function' ? deps.clearChatDisplay : (() => {});
    const addMessage = typeof deps?.addMessage === 'function' ? deps.addMessage : (() => {});
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);

    const SETTINGS_PATH = ['uiState', 'psfTerminal', 'savedSessions'];
    const STORAGE_PREFIX = 'ollama_conv_';

    function getByPath(root, pathParts) {
      let current = root;
      for (const part of pathParts) {
        if (!current || typeof current !== 'object') return undefined;
        current = current[part];
      }
      return current;
    }

    function setByPath(root, pathParts, value) {
      if (!root || typeof root !== 'object') return;
      let current = root;
      for (let i = 0; i < pathParts.length - 1; i += 1) {
        const part = pathParts[i];
        if (!current[part] || typeof current[part] !== 'object') current[part] = {};
        current = current[part];
      }
      current[pathParts[pathParts.length - 1]] = value;
    }

    async function loadSettingsSessions() {
      const api = getElectronAPI();
      if (!api || typeof api.getSettings !== 'function') return {};
      try {
        const settings = await api.getSettings();
        const sessions = getByPath(settings, SETTINGS_PATH);
        return (sessions && typeof sessions === 'object') ? sessions : {};
      } catch (_) {
        return {};
      }
    }

    async function saveSettingsSessions(updater) {
      const api = getElectronAPI();
      if (!api || typeof api.getSettings !== 'function' || typeof api.saveSettings !== 'function') return;
      try {
        const settings = await api.getSettings();
        const next = (settings && typeof settings === 'object') ? { ...settings } : {};
        const currentSessions = getByPath(next, SETTINGS_PATH);
        const sessionsObj = (currentSessions && typeof currentSessions === 'object') ? { ...currentSessions } : {};
        const updated = updater(sessionsObj) || sessionsObj;
        setByPath(next, SETTINGS_PATH, updated);
        await api.saveSettings(next);
      } catch (_) {
        // best effort mirror; localStorage remains source-compatible fallback
      }
    }

    function saveConversation(name) {
      if (!name) {
        addErrorMessage('Usage: /save <filename>');
        return;
      }

      try {
        const data = {
          model: getCurrentModel(),
          port: getTerminalPort(),
          systemPrompt: getSystemPrompt(),
          temperature: getTemperature(),
          top_p: getTopP(),
          top_k: getTopK(),
          num_ctx: getNumCtx(),
          num_predict: getNumPredict(),
          repeat_penalty: getRepeatPenalty(),
          seed: getSeed(),
          stop: getStopSequences(),
          history: getConversationHistory(),
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(`${STORAGE_PREFIX}${name}`, JSON.stringify(data));
        saveSettingsSessions((sessions) => {
          sessions[String(name)] = data;
          return sessions;
        });
        addSystemMessage(`✅ Conversation saved as "${name}"`);
      } catch (error) {
        addErrorMessage(`Failed to save: ${error.message}`);
      }
    }

    async function loadConversation(name) {
      if (!name) {
        addErrorMessage('Usage: /load <filename>');
        return;
      }

      try {
        let data = null;
        const localSaved = localStorage.getItem(`${STORAGE_PREFIX}${name}`);
        if (localSaved) {
          data = JSON.parse(localSaved);
        } else {
          const sessions = await loadSettingsSessions();
          const settingsSaved = sessions[String(name)];
          if (settingsSaved && typeof settingsSaved === 'object') {
            data = settingsSaved;
          }
        }
        if (!data || typeof data !== 'object') {
          addErrorMessage(`Conversation "${name}" not found`);
          return;
        }
        setCurrentModel(data.model || getCurrentModel());
        setSystemPrompt(data.systemPrompt || null);
        setTemperature(data.temperature || 0.7);
        setTopP(data.top_p !== undefined ? data.top_p : null);
        setTopK(data.top_k !== undefined ? data.top_k : null);
        setNumCtx(data.num_ctx !== undefined ? data.num_ctx : null);
        setNumPredict(data.num_predict !== undefined ? data.num_predict : null);
        setRepeatPenalty(data.repeat_penalty !== undefined ? data.repeat_penalty : null);
        setSeed(data.seed !== undefined ? data.seed : null);
        setStopSequences(data.stop !== undefined ? data.stop : null);

        const history = Array.isArray(data.history) ? data.history : [];
        setConversationHistory(history);

        clearChatDisplay();
        addSystemMessage(`✅ Loaded conversation "${name}"`);
        addSystemMessage(`Model: ${getCurrentModel()}, Temp: ${getTemperature()}, Port: ${getTerminalPort()}`);
        if (getSystemPrompt()) {
          const sp = getSystemPrompt();
          addSystemMessage(`System: ${sp.substring(0, 50)}${sp.length > 50 ? '...' : ''}`);
        }

        history.forEach(msg => {
          addMessage(msg.role, msg.content);
        });
      } catch (error) {
        addErrorMessage(`Failed to load: ${error.message}`);
      }
    }

    async function listSavedConversations() {
      const names = new Set();
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key && key.startsWith(STORAGE_PREFIX)) {
            names.add(key.replace(STORAGE_PREFIX, ''));
          }
        }
      } catch (_) {}
      const sessions = await loadSettingsSessions();
      Object.keys(sessions || {}).forEach((k) => {
        const name = String(k || '').trim();
        if (name) names.add(name);
      });
      return Array.from(names);
    }

    async function deleteSavedConversation(name) {
      const sessionName = String(name || '').trim();
      if (!sessionName) return false;
      let removed = false;
      try {
        const key = `${STORAGE_PREFIX}${sessionName}`;
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          removed = true;
        }
      } catch (_) {}
      await saveSettingsSessions((sessions) => {
        if (Object.prototype.hasOwnProperty.call(sessions, sessionName)) {
          delete sessions[sessionName];
          removed = true;
        }
        return sessions;
      });
      return removed;
    }

    return {
      saveConversation,
      loadConversation,
      listSavedConversations,
      deleteSavedConversation
    };
  }

  window.TerminalPersistence = {
    createPersistenceController
  };
})();
