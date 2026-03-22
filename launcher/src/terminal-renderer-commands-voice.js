/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createVoiceCommandHelper(deps) {
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => null;
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});

    async function handleVoiceCommand(args) {
      const api = getElectronAPI();
      if (!api || typeof api.voiceToTextGetConfig !== 'function' || typeof api.voiceToTextSetConfig !== 'function') {
        addErrorMessage('Voice APIs unavailable in this build.');
        return;
      }
      const raw = String(args || '').trim();
      const lower = raw.toLowerCase();
      const surfaceId = 'psf-terminal';
      const readSurfaceOverride = (cfg) => {
        const map = (cfg?.surfaceOverrides && typeof cfg.surfaceOverrides === 'object') ? cfg.surfaceOverrides : {};
        const hit = map[surfaceId];
        if (!hit || typeof hit !== 'object') {
          return {
            sttEnabled: cfg?.sttEnabled === true,
            ttsEnabled: cfg?.ttsEnabled === true
          };
        }
        return {
          sttEnabled: (typeof hit.sttEnabled === 'boolean') ? hit.sttEnabled : cfg?.sttEnabled === true,
          ttsEnabled: (typeof hit.ttsEnabled === 'boolean') ? hit.ttsEnabled : cfg?.ttsEnabled === true
        };
      };
      const buildSurfacePatch = (cfg, type, enabled) => {
        const map = (cfg?.surfaceOverrides && typeof cfg.surfaceOverrides === 'object') ? cfg.surfaceOverrides : {};
        const current = (map[surfaceId] && typeof map[surfaceId] === 'object') ? map[surfaceId] : {};
        const next = {
          sttEnabled: (typeof current.sttEnabled === 'boolean') ? current.sttEnabled : cfg?.sttEnabled === true,
          ttsEnabled: (typeof current.ttsEnabled === 'boolean') ? current.ttsEnabled : cfg?.ttsEnabled === true
        };
        if (type === 'stt') next.sttEnabled = enabled === true;
        if (type === 'tts') next.ttsEnabled = enabled === true;
        return {
          surfaceOverrides: {
            ...map,
            [surfaceId]: next
          }
        };
      };
      if (!raw || lower === 'status') {
        const result = await api.voiceToTextGetConfig();
        if (!result?.success || !result?.config) {
          addErrorMessage(result?.error || 'Unable to read voice config.');
          return;
        }
        const cfg = result.config;
        const local = readSurfaceOverride(cfg);
        addSystemMessage(`Voice Input (STT): ${cfg.sttEnabled ? 'ON' : 'OFF'}`);
        addSystemMessage(`Text to Speech (TTS): ${cfg.ttsEnabled ? 'ON' : 'OFF'}`);
        addSystemMessage(`This Window STT: ${local.sttEnabled ? 'ON' : 'OFF'}`);
        addSystemMessage(`This Window TTS: ${local.ttsEnabled ? 'ON' : 'OFF'}`);
        return;
      }
      const parseCatalogRef = (value) => {
        const rawRef = String(value || '').trim();
        if (!rawRef || rawRef.toLowerCase() === 'none' || rawRef.toLowerCase() === 'off') {
          return { collectionId: '', modelId: '' };
        }
        const slashIdx = rawRef.indexOf('/');
        if (slashIdx <= 0 || slashIdx === rawRef.length - 1) return null;
        return {
          collectionId: rawRef.slice(0, slashIdx).trim(),
          modelId: rawRef.slice(slashIdx + 1).trim()
        };
      };
      let patch = null;
      let currentConfig = null;
      const loadCurrentConfig = async () => {
        if (currentConfig) return currentConfig;
        const result = await api.voiceToTextGetConfig();
        if (!result?.success || !result?.config) {
          throw new Error(result?.error || 'Unable to read voice config.');
        }
        currentConfig = result.config;
        return currentConfig;
      };
      if (lower === 'on') patch = { enabled: true };
      else if (lower === 'off') patch = { enabled: false };
      else if (lower === 'stt-on') patch = { sttEnabled: true };
      else if (lower === 'stt-off') patch = { sttEnabled: false };
      else if (lower === 'tts-on') patch = { ttsEnabled: true };
      else if (lower === 'tts-off') patch = { ttsEnabled: false };
      else if (lower === 'stt-local-on') {
        const cfg = await loadCurrentConfig();
        patch = buildSurfacePatch(cfg, 'stt', true);
      } else if (lower === 'stt-local-off') {
        const cfg = await loadCurrentConfig();
        patch = buildSurfacePatch(cfg, 'stt', false);
      } else if (lower === 'tts-local-on') {
        const cfg = await loadCurrentConfig();
        patch = buildSurfacePatch(cfg, 'tts', true);
      } else if (lower === 'tts-local-off') {
        const cfg = await loadCurrentConfig();
        patch = buildSurfacePatch(cfg, 'tts', false);
      } else if (lower.startsWith('provider ')) {
        const provider = String(raw.slice('provider '.length)).trim().toLowerCase();
        if (provider !== 'huggingface') {
          addErrorMessage('STT provider must be huggingface.');
          return;
        }
        patch = { provider };
      } else if (lower.startsWith('tts-provider ')) {
        const ttsProvider = String(raw.slice('tts-provider '.length)).trim().toLowerCase();
        if (ttsProvider !== 'huggingface' && ttsProvider !== 'local-transformers') {
          addErrorMessage('TTS provider must be huggingface or local-transformers.');
          return;
        }
        patch = { ttsProvider };
      } else if (lower.startsWith('language ')) {
        patch = { language: String(raw.slice('language '.length)).trim() || 'en-US' };
      } else if (lower.startsWith('stt-model ')) {
        patch = { hf: { sttModel: String(raw.slice('stt-model '.length)).trim() } };
      } else if (lower.startsWith('tts-model ')) {
        patch = { hf: { ttsModel: String(raw.slice('tts-model '.length)).trim() } };
      } else if (lower.startsWith('local-model ')) {
        patch = { localTransformers: { model: String(raw.slice('local-model '.length)).trim() } };
      } else if (lower.startsWith('local-device ')) {
        patch = { localTransformers: { device: String(raw.slice('local-device '.length)).trim().toLowerCase() } };
      } else if (lower.startsWith('local-python ')) {
        const value = String(raw.slice('local-python '.length)).trim();
        patch = { localTransformers: { pythonBin: value.toLowerCase() === 'default' ? '' : value } };
      } else if (lower.startsWith('stt-catalog ')) {
        const ref = parseCatalogRef(raw.slice('stt-catalog '.length));
        if (!ref) {
          addErrorMessage('Expected stt-catalog format: <collection/model> or off');
          return;
        }
        patch = { catalogRefs: { stt: ref } };
      } else if (lower.startsWith('tts-catalog ')) {
        const ref = parseCatalogRef(raw.slice('tts-catalog '.length));
        if (!ref) {
          addErrorMessage('Expected tts-catalog format: <collection/model> or off');
          return;
        }
        patch = { catalogRefs: { tts: ref } };
      } else if (lower.startsWith('local-catalog ')) {
        const ref = parseCatalogRef(raw.slice('local-catalog '.length));
        if (!ref) {
          addErrorMessage('Expected local-catalog format: <collection/model> or off');
          return;
        }
        patch = { catalogRefs: { localTransformersTts: ref } };
      } else {
        addErrorMessage('Unknown /voice mode. Use: /voice on|off|stt-on|stt-off|tts-on|tts-off|stt-local-on|stt-local-off|tts-local-on|tts-local-off|status');
        return;
      }
      const saved = await api.voiceToTextSetConfig(patch);
      if (!saved?.success) {
        addErrorMessage(saved?.error || 'Failed to update voice config.');
        return;
      }
      addSystemMessage('Voice config updated.');
      await handleVoiceCommand('status');
    }

    return {
      handleVoiceCommand
    };
  }

  window.TerminalCommandsVoice = {
    createVoiceCommandHelper
  };
})();
