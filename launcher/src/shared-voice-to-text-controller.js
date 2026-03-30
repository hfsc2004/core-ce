/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function initPsfVoiceToTextController(global) {
  'use strict';

  const adapters = global.PsfVoiceToTextAdapters || {};
  const createWebSpeechAdapter = adapters.createWebSpeechAdapter;
  const createHuggingFaceAdapter = adapters.createHuggingFaceAdapter;

  function createVoiceController(options = {}) {
    const opts = options || {};
    const surface = String(opts.surface || 'unknown');
    const getElectronAPI = typeof opts.getElectronAPI === 'function' ? opts.getElectronAPI : () => global.electronAPI;
    const getInputElement = typeof opts.getInputElement === 'function' ? opts.getInputElement : () => null;
    const getButtonElement = typeof opts.getButtonElement === 'function' ? opts.getButtonElement : () => null;
    const getModeButtonElement = typeof opts.getModeButtonElement === 'function' ? opts.getModeButtonElement : () => null;
    const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : (() => {});
    const onError = typeof opts.onError === 'function' ? opts.onError : (() => {});
    const onTranscription = typeof opts.onTranscription === 'function' ? opts.onTranscription : (() => {});

    let config = {
      enabled: false,
      sttEnabled: false,
      ttsEnabled: false,
      surfaceOverrides: {},
      provider: 'huggingface',
      ttsProvider: 'local-transformers',
      sttInputMode: 'ptt',
      language: 'en-US',
      autoSend: false,
      voxAutoSendDelayMs: 900,
      hf: { sttEndpoint: '', sttModel: 'openai/whisper-small', ttsEndpoint: '', ttsModel: 'microsoft/speecht5_tts', ttsVoice: '' },
      hardware: { inputDeviceId: '' },
      localTransformers: {
        pythonBin: '',
        model: 'facebook/mms-tts-eng',
        device: 'cpu',
        maxNewTokens: 180,
        terminalChunkChars: 360,
        terminalTimeoutSec: 180,
        terminalDebugTrace: false
      }
    };
    let listening = false;
    let adapter = null;
    let prewarmInFlight = null;
    let activeAudio = null;
    let activeAudioStop = null;
    let voxAutoSendTimer = null;
    let manualStopRequested = false;

    const normalizeSurfaceId = (value) => String(value || '').trim().toLowerCase();
    function getSurfaceOverride() {
      const surfaceId = normalizeSurfaceId(surface);
      if (!surfaceId) return null;
      const map = (config?.surfaceOverrides && typeof config.surfaceOverrides === 'object') ? config.surfaceOverrides : {};
      const hit = map[surfaceId];
      return hit && typeof hit === 'object' ? hit : null;
    }
    function isSurfaceSttEnabled() {
      if (config?.sttEnabled !== true) return false;
      const hit = getSurfaceOverride();
      return hit ? hit.sttEnabled === true : true;
    }
    function isSurfaceTtsEnabled() {
      if (config?.ttsEnabled !== true) return false;
      const hit = getSurfaceOverride();
      return hit ? hit.ttsEnabled === true : true;
    }

    function buildSurfaceTogglePatch(kind, enabled) {
      const surfaceId = normalizeSurfaceId(surface);
      if (!surfaceId) return {};
      const currentMap = (config?.surfaceOverrides && typeof config.surfaceOverrides === 'object') ? config.surfaceOverrides : {};
      const current = (currentMap[surfaceId] && typeof currentMap[surfaceId] === 'object') ? currentMap[surfaceId] : {};
      const next = {
        sttEnabled: (typeof current.sttEnabled === 'boolean') ? current.sttEnabled : config.sttEnabled === true,
        ttsEnabled: (typeof current.ttsEnabled === 'boolean') ? current.ttsEnabled : config.ttsEnabled === true
      };
      if (kind === 'stt') next.sttEnabled = enabled === true;
      if (kind === 'tts') next.ttsEnabled = enabled === true;
      return { surfaceOverrides: { ...currentMap, [surfaceId]: next } };
    }

    function clearVoxAutoSendTimer() {
      if (!voxAutoSendTimer) return;
      clearTimeout(voxAutoSendTimer);
      voxAutoSendTimer = null;
    }

    async function playBase64Audio(audioBase64, mimeType = 'audio/wav') {
      const src = `data:${String(mimeType || 'audio/wav')};base64,${String(audioBase64 || '')}`;
      const audio = new Audio(src);
      audio.preload = 'auto';
      await new Promise((resolve, reject) => {
        let done = false;
        const finish = (err) => {
          if (done) return;
          done = true;
          if (activeAudio === audio) activeAudio = null;
          if (activeAudioStop) activeAudioStop = null;
          if (err) reject(err); else resolve();
        };
        const timeoutId = setTimeout(() => finish(new Error('Audio playback timeout.')), 120000);
        const clear = () => clearTimeout(timeoutId);
        audio.onended = () => { clear(); finish(); };
        audio.onerror = () => { clear(); finish(new Error('Audio playback failed.')); };
        activeAudio = audio;
        activeAudioStop = () => {
          try { audio.pause(); audio.currentTime = 0; } catch (_) {}
          clear();
          finish(new Error('Audio playback interrupted.'));
        };
        audio.play().catch((err) => { clear(); finish(err); });
      });
    }

    function stopSpeech() {
      if (typeof activeAudioStop === 'function') {
        try { activeAudioStop(); return { success: true }; }
        catch (err) { return { success: false, error: err?.message || String(err) }; }
      }
      if (activeAudio) {
        try {
          activeAudio.pause();
          activeAudio.currentTime = 0;
          activeAudio = null;
          return { success: true };
        } catch (err) {
          return { success: false, error: err?.message || String(err) };
        }
      }
      return { success: true };
    }

    async function synthesize(text) {
      const value = String(text || '').trim();
      if (!value) return { success: false, error: 'Empty text.' };
      try { await loadConfig(); } catch (_) {}
      if (!isSurfaceTtsEnabled()) return { success: false, error: 'Text-to-speech is off.' };

      const ttsProvider = String(config.ttsProvider || config.provider || 'local-transformers').toLowerCase();
      const api = getElectronAPI();

      if (ttsProvider === 'local-transformers') {
        if (!api || typeof api.voiceToTextSynthesizeLocalTransformers !== 'function') {
          return { success: false, error: 'Local Transformers TTS API unavailable.' };
        }
        const result = await api.voiceToTextSynthesizeLocalTransformers({ text: value, language: config.language, surface });
        if (!result?.success || !result?.audioBase64) return result || { success: false, error: 'Local Transformers TTS failed.' };
        return { success: true, provider: 'local-transformers', audioBase64: result.audioBase64, mimeType: result.mimeType || 'audio/wav' };
      }
      if (ttsProvider === 'huggingface') {
        if (!api || typeof api.voiceToTextSynthesizeHf !== 'function') {
          return { success: false, error: 'HF TTS API unavailable.' };
        }
        const result = await api.voiceToTextSynthesizeHf({ text: value, language: config.language, surface });
        if (!result?.success || !result?.audioBase64) return result || { success: false, error: 'HF TTS failed.' };
        return { success: true, provider: 'huggingface', audioBase64: result.audioBase64, mimeType: result.mimeType || 'audio/wav' };
      }
      return { success: false, error: 'Web TTS is disabled. Use tts-provider local-transformers or huggingface.' };
    }

    async function playAudio(audioBase64, mimeType = 'audio/wav') {
      const value = String(audioBase64 || '').trim();
      if (!value) return { success: false, error: 'Missing audio payload.' };
      await playBase64Audio(value, mimeType || 'audio/wav');
      return { success: true };
    }

    function setInputValue(text) {
      const inputEl = getInputElement();
      if (!inputEl) return;
      const current = String(inputEl.value || '');
      const spacer = current && !/\s$/.test(current) ? ' ' : '';
      inputEl.value = `${current}${spacer}${String(text || '').trim()}`.trim();
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function isLikelyNoiseTranscript(text) {
      const value = String(text || '').trim();
      if (!value) return true;
      const compact = value.replace(/\s+/g, '');
      if (compact.length < 10) return false;
      const chars = Array.from(compact);
      if (chars.length < 10) return false;
      const counts = new Map();
      for (const ch of chars) counts.set(ch, (counts.get(ch) || 0) + 1);
      const uniqueCount = counts.size;
      let topCount = 0;
      for (const count of counts.values()) if (count > topCount) topCount = count;
      return (topCount / chars.length) >= 0.85 && uniqueCount <= 2;
    }

    function refreshButton() {
      const btn = getButtonElement();
      if (!btn) return;
      if (!config.sttEnabled || !isSurfaceSttEnabled()) {
        btn.textContent = '🎤 Voice Off';
        btn.title = config.sttEnabled ? 'Enable voice input for this window' : 'Turn voice input on';
        btn.classList.remove('recording');
        return;
      }
      if (listening) {
        btn.textContent = '⏺️ Voice On';
        btn.title = 'Stop listening';
        btn.classList.add('recording');
        return;
      }
      btn.textContent = '🎤 Voice Off';
      btn.title = 'Start listening';
      btn.classList.remove('recording');
    }

    function refreshModeButton() {
      const btn = getModeButtonElement();
      if (!btn) return;
      const mode = String(config.sttInputMode || 'ptt').toLowerCase() === 'vox' ? 'vox' : 'ptt';
      const isVox = mode === 'vox';
      btn.textContent = isVox ? 'VOX' : 'PTT';
      btn.title = isVox ? 'Voice mode: VOX (auto-send after pause)' : 'Voice mode: PTT (manual Send)';
      btn.classList.toggle('vox', isVox);
    }

    function buildAdapter() {
      const buildStateCallbacks = {
        onError,
        onTranscript: (text) => onTranscription(String(text || '')),
        onStateChange: (isActive) => {
          listening = isActive === true;
          refreshButton();
          const mode = String(config.sttInputMode || 'ptt').toLowerCase() === 'vox' ? 'vox' : 'ptt';
          if (!listening && mode === 'vox' && isSurfaceSttEnabled() && manualStopRequested !== true) {
            setTimeout(() => {
              if (listening || manualStopRequested || !isSurfaceSttEnabled()) return;
              start();
            }, 120);
          }
        }
      };
      if (config.provider === 'huggingface') return createHuggingFaceAdapter({ surface, getElectronAPI, ...buildStateCallbacks });
      if (config.provider === 'local-transformers') return null;
      return createWebSpeechAdapter(buildStateCallbacks);
    }

    async function loadConfig() {
      const api = getElectronAPI();
      if (api && typeof api.voiceToTextGetConfig === 'function') {
        const result = await api.voiceToTextGetConfig();
        if (result?.success && result?.config) config = { ...config, ...result.config };
      }
      adapter = buildAdapter();
      refreshButton();
      refreshModeButton();
      return config;
    }

    async function saveConfig(patch = {}) {
      const safePatch = (patch && typeof patch === 'object') ? { ...patch } : {};
      if (typeof safePatch.sttEnabled !== 'boolean') safePatch.sttEnabled = config.sttEnabled === true;
      if (typeof safePatch.ttsEnabled !== 'boolean') safePatch.ttsEnabled = config.ttsEnabled === true;
      const api = getElectronAPI();
      if (!api || typeof api.voiceToTextSetConfig !== 'function') {
        config = { ...config, ...safePatch };
        adapter = buildAdapter();
        refreshButton();
        refreshModeButton();
        return { success: true, config };
      }
      const result = await api.voiceToTextSetConfig(safePatch);
      if (result?.success && result?.config) {
        config = { ...config, ...result.config };
        adapter = buildAdapter();
      }
      refreshButton();
      refreshModeButton();
      return result;
    }

    async function toggleInputMode() {
      const currentMode = String(config.sttInputMode || 'ptt').toLowerCase() === 'vox' ? 'vox' : 'ptt';
      const nextMode = currentMode === 'vox' ? 'ptt' : 'vox';
      const result = await saveConfig({ sttInputMode: nextMode });
      if (!result?.success) {
        onError(result?.error || 'Unable to update voice mode.');
        return result;
      }
      clearVoxAutoSendTimer();
      onStatus(`Voice input mode: ${nextMode.toUpperCase()}`);
      return result;
    }

    async function enableIfNeeded() {
      if (isSurfaceSttEnabled()) return true;
      const surfacePatch = buildSurfaceTogglePatch('stt', true);
      const patch = config.sttEnabled === true ? surfacePatch : { sttEnabled: true, ...surfacePatch };
      const result = await saveConfig(patch);
      if (!result?.success) {
        onError(result?.error || 'Unable to enable speech-to-text.');
        return false;
      }
      onStatus('Speech-to-text enabled for this window.');
      return true;
    }

    async function start() {
      if (listening) return;
      manualStopRequested = false;
      const ok = await enableIfNeeded();
      if (!ok) return;
      if (config.provider === 'local-transformers') {
        onError('Local Transformers is configured for TTS. Select huggingface for STT capture.');
        return;
      }
      adapter = buildAdapter();
      if (!adapter) {
        onError(`Voice provider "${config.provider}" is unavailable on this system.`);
        return;
      }
      listening = true;
      refreshButton();
      try {
        await adapter.start(config);
      } catch (err) {
        listening = false;
        refreshButton();
        onError(err?.message || String(err));
      }
    }

    async function stop() {
      if (!listening) return;
      manualStopRequested = true;
      clearVoxAutoSendTimer();
      try { await adapter?.stop?.(config); }
      catch (err) { onError(err?.message || String(err)); }
      finally {
        listening = false;
        refreshButton();
      }
    }

    async function toggle() {
      if (listening) {
        await stop();
        return;
      }
      manualStopRequested = false;
      if (!isSurfaceSttEnabled()) {
        const surfacePatch = buildSurfaceTogglePatch('stt', true);
        const patch = config.sttEnabled === true ? surfacePatch : { sttEnabled: true, ...surfacePatch };
        const result = await saveConfig(patch);
        if (!result?.success) {
          onError(result?.error || 'Unable to enable speech-to-text.');
          return;
        }
        onStatus('Speech-to-text enabled for this window.');
      }
      await start();
    }

    async function cycleProvider() {
      const providers = ['huggingface'];
      const currentIndex = Math.max(0, providers.indexOf(String(config.provider || 'huggingface')));
      const next = providers[(currentIndex + 1) % providers.length];
      const saved = await saveConfig({ provider: next });
      if (saved?.success) onStatus('Voice input engine updated.');
      else onError(saved?.error || 'Unable to change voice provider.');
      return saved;
    }

    async function init() {
      await loadConfig();
      if (isSurfaceTtsEnabled()) {
        prewarmInFlight = (async () => {
          const api = getElectronAPI();
          if (!api || typeof api.voiceToTextPrewarmTts !== 'function') return null;
          try { return await api.voiceToTextPrewarmTts({ surface, reason: 'terminal-init' }); }
          catch (_err) { return null; }
          finally { prewarmInFlight = null; }
        })();
      }
      const btn = getButtonElement();
      if (btn) {
        btn.addEventListener('click', () => { toggle(); });
        btn.addEventListener('contextmenu', async (event) => {
          event.preventDefault();
          await cycleProvider();
        });
      }
      const modeBtn = getModeButtonElement();
      if (modeBtn) modeBtn.addEventListener('click', () => { toggleInputMode(); });
    }

    async function speak(text) {
      const synth = await synthesize(text);
      if (!synth?.success || !synth?.audioBase64) return synth || { success: false, error: 'TTS synthesis failed.' };
      const play = await playAudio(synth.audioBase64, synth.mimeType || 'audio/wav');
      if (!play?.success) return play;
      return { success: true, provider: synth.provider || 'unknown' };
    }

    function handleTranscript(text) {
      const value = String(text || '').trim();
      if (!value || isLikelyNoiseTranscript(value)) return;
      setInputValue(value);
      const mode = String(config.sttInputMode || 'ptt').toLowerCase() === 'vox' ? 'vox' : 'ptt';
      if (mode === 'vox' && typeof opts.onAutoSend === 'function') {
        clearVoxAutoSendTimer();
        const delayMs = Number.isFinite(Number(config.voxAutoSendDelayMs)) ? Math.max(250, Number(config.voxAutoSendDelayMs)) : 900;
        voxAutoSendTimer = setTimeout(() => {
          voxAutoSendTimer = null;
          opts.onAutoSend();
        }, delayMs);
        return;
      }
      if (config.autoSend && typeof opts.onAutoSend === 'function') {
        clearVoxAutoSendTimer();
        opts.onAutoSend();
      }
    }

    return {
      init,
      toggle,
      stop,
      stopSpeech,
      cycleProvider,
      toggleInputMode,
      speak,
      synthesize,
      playAudio,
      saveConfig,
      loadConfig,
      handleTranscript
    };
  }

  global.PsfVoiceToTextController = {
    createVoiceController
  };
})(window);
