/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

(function() {
  'use strict';

  function createTerminalSpeechController(ctx = {}) {
    const getVoiceController = () => (typeof ctx.getVoiceController === 'function' ? ctx.getVoiceController() : null);
    const getSpeechEngine = () => (typeof ctx.getSpeechEngine === 'function' ? ctx.getSpeechEngine() : null);
    const setSpeechEngine = (value) => { if (typeof ctx.setSpeechEngine === 'function') ctx.setSpeechEngine(value); };
    const getLastSpeechCfg = () => (typeof ctx.getLastSpeechCfg === 'function' ? ctx.getLastSpeechCfg() : null);
    const setLastSpeechCfg = (value) => { if (typeof ctx.setLastSpeechCfg === 'function') ctx.setLastSpeechCfg(value); };
    const getProfileKey = () => (typeof ctx.getProfileKey === 'function' ? ctx.getProfileKey() : '');
    const setProfileKey = (value) => { if (typeof ctx.setProfileKey === 'function') ctx.setProfileKey(String(value || '')); };
    const getChunkProfile = () => (typeof ctx.getChunkProfile === 'function' ? (ctx.getChunkProfile() || { preview: 140, segment: 220, tail: 240 }) : { preview: 140, segment: 220, tail: 240 });
    const setChunkProfile = (value) => { if (typeof ctx.setChunkProfile === 'function') ctx.setChunkProfile(value || { preview: 140, segment: 220, tail: 240 }); };
    const addSystemMessage = (text) => { if (typeof ctx.addSystemMessage === 'function') ctx.addSystemMessage(text); };

    function isTtsDebugTraceEnabled(cfg = null) {
      const c = cfg && typeof cfg === 'object' ? cfg : null;
      if (c) return c?.localTransformers?.terminalDebugTrace === true;
      return getLastSpeechCfg()?.localTransformers?.terminalDebugTrace === true;
    }

    function addTtsDebugMessage(enabled, message) {
      if (!enabled) return;
      addSystemMessage(`[TTS debug] ${message}`);
    }

    function normalizeSpeechText(text) {
      return String(text || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/^\s*[-*•]+\s+/gm, ' ')
        .replace(/[*_#~]+/g, ' ')
        .replace(/[-–—]+/g, ' ')
        .replace(/:\)|:-\)|:\(|:-\(|:D|:-D|;\)|;-\)/g, ' ')
        .replace(/\p{Extended_Pictographic}/gu, ' ')
        .replace(/[\uFE0E\uFE0F]/g, ' ')
        .replace(/[()[\]{}<>|\\^`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function splitSpeechChunks(text, maxLen = 140) {
      const value = String(text || '').trim();
      if (!value) return [];
      const units = value.match(/[^.!?]+[.!?]?/g) || [value];
      const chunks = [];
      let current = '';
      for (const unitRaw of units) {
        const unit = String(unitRaw || '').trim();
        if (!unit) continue;
        if (!current) {
          current = unit;
          continue;
        }
        if ((current.length + 1 + unit.length) <= maxLen) {
          current += ` ${unit}`;
        } else {
          chunks.push(current);
          current = unit;
        }
      }
      if (current) chunks.push(current);
      return chunks;
    }

    function resolveSpeechEngineProfile(speechCfg = null) {
      const provider = String(speechCfg?.ttsProvider || speechCfg?.provider || 'local-transformers').toLowerCase();
      const model = String(speechCfg?.localTransformers?.model || '').trim().toLowerCase();
      const device = String(speechCfg?.localTransformers?.device || '').trim().toLowerCase();
      const base = {
        key: `${provider}|${model}|${device || 'auto'}`,
        tuning: {
          minEnqueueIntervalMs: 350,
          maxQueueDepthForStream: 6,
          minContentCharsForIncrementalSegments: 320,
          minTailSpeakChars: 30,
          maxAudioQueueDepth: 5,
          minAudioQueueBeforePlay: 1
        },
        chunks: { preview: 140, segment: 220, tail: 240 }
      };
      if (provider === 'local-transformers' && model.includes('facebook/mms-tts') && device === 'cpu') {
        return {
          key: `${base.key}|mms-cpu`,
          tuning: {
            minEnqueueIntervalMs: 450,
            maxQueueDepthForStream: 8,
            minContentCharsForIncrementalSegments: 420,
            minTailSpeakChars: 40,
            maxAudioQueueDepth: 8,
            minAudioQueueBeforePlay: 2
          },
          chunks: { preview: 220, segment: 420, tail: 520 }
        };
      }
      return base;
    }

    async function applySpeechEngineProfile(speechCfg = null) {
      const profile = resolveSpeechEngineProfile(speechCfg);
      setChunkProfile(profile.chunks);
      const engine = getSpeechEngine();
      if (engine && typeof engine.configure === 'function' && getProfileKey() !== profile.key) {
        engine.configure(profile.tuning);
        setProfileKey(profile.key);
      }
      return profile;
    }

    async function buildSpeechRuntimeProfile(options = {}) {
      const vc = getVoiceController();
      let speechCfg = null;
      try {
        if (typeof vc?.loadConfig === 'function') {
          speechCfg = await vc.loadConfig();
        }
      } catch (_err) {
        speechCfg = null;
      }
      setLastSpeechCfg(speechCfg);
      const ttsProvider = String(speechCfg?.ttsProvider || speechCfg?.provider || 'local-transformers').toLowerCase();
      const localModel = String(speechCfg?.localTransformers?.model || '').trim().toLowerCase();
      const isChatterbox = ttsProvider === 'local-transformers' && localModel.includes('chatterbox');
      const isVitsLike = ttsProvider === 'local-transformers' && (localModel.includes('vits') || localModel.includes('kakao'));
      const configuredTimeoutSec = Number(speechCfg?.localTransformers?.terminalTimeoutSec);
      const configuredTimeoutMs = Number.isFinite(configuredTimeoutSec)
        ? Math.max(30, configuredTimeoutSec) * 1000
        : null;
      const timeoutMs = Number.isFinite(options?.timeoutMs)
        ? Number(options.timeoutMs)
        : (configuredTimeoutMs || (isChatterbox ? (16 * 60 * 1000) : (isVitsLike ? 300000 : (ttsProvider === 'local-transformers' ? 120000 : 45000))));
      const profile = {
        speechCfg,
        ttsProvider,
        localModel,
        timeoutMs,
        isChatterbox,
        isVitsLike,
        debugOn: isTtsDebugTraceEnabled(speechCfg)
      };
      await applySpeechEngineProfile(speechCfg);
      return profile;
    }

    async function synthesizeAssistantChunk(text, options = {}) {
      const chunk = normalizeSpeechText(text);
      if (!chunk) return { success: false, error: 'Empty text.' };
      const vc = getVoiceController();
      if (!vc || typeof vc.synthesize !== 'function') {
        return { success: false, error: 'TTS synth API unavailable.' };
      }
      const profile = await buildSpeechRuntimeProfile(options);
      const { debugOn, ttsProvider, localModel, timeoutMs } = profile;
      addTtsDebugMessage(debugOn, `start provider=${ttsProvider} model=${localModel || 'n/a'} chunks=1 chunkChars=${chunk.length} timeoutMs=${timeoutMs}`);
      const synthStartedAt = Date.now();
      addTtsDebugMessage(debugOn, `chunk synth begin chars=${chunk.length}`);
      const result = await Promise.race([
        vc.synthesize(chunk),
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: false, error: `TTS timed out after ${timeoutMs / 1000}s.` }), timeoutMs);
        })
      ]);
      addTtsDebugMessage(debugOn, `chunk synth end ms=${Date.now() - synthStartedAt} success=${result?.success === true}`);
      if (!result?.success && result?.error) {
        if (debugOn) addSystemMessage(`TTS notice: ${result.error}`);
        addTtsDebugMessage(debugOn, `chunk failed error=${result.error}`);
        return result;
      }
      addTtsDebugMessage(debugOn, 'end');
      return result || { success: false, error: 'Unknown TTS synth failure.' };
    }

    async function playAssistantAudio(job = {}) {
      const vc = getVoiceController();
      if (!vc || typeof vc.playAudio !== 'function') {
        return { success: false, error: 'TTS play API unavailable.' };
      }
      const profile = await buildSpeechRuntimeProfile({});
      const playStartedAt = Date.now();
      addTtsDebugMessage(profile.debugOn, `chunk play begin bytes=${String(job.audioBase64 || '').length}`);
      const result = await vc.playAudio(job.audioBase64 || '', job.mimeType || 'audio/wav');
      addTtsDebugMessage(profile.debugOn, `chunk play end ms=${Date.now() - playStartedAt} success=${result?.success === true}`);
      return result;
    }

    async function speakAssistantTextNow(text, options = {}) {
      const content = normalizeSpeechText(text);
      if (!content) return;
      const vc = getVoiceController();
      if (!vc || typeof vc.speak !== 'function') return;
      let speechCfg = null;
      try {
        if (typeof vc.loadConfig === 'function') {
          speechCfg = await vc.loadConfig();
        }
      } catch (_err) {
        speechCfg = null;
      }
      setLastSpeechCfg(speechCfg);
      const ttsProvider = String(speechCfg?.ttsProvider || speechCfg?.provider || 'local-transformers').toLowerCase();
      const localModel = String(speechCfg?.localTransformers?.model || '').trim().toLowerCase();
      const isChatterbox = ttsProvider === 'local-transformers' && localModel.includes('chatterbox');
      const isVitsLike = ttsProvider === 'local-transformers' && (localModel.includes('vits') || localModel.includes('kakao'));
      let value = content;
      const skipPrefix = normalizeSpeechText(options?.skipPrefix || '');
      if (skipPrefix) {
        const fullLower = value.toLowerCase();
        const prefixLower = skipPrefix.toLowerCase();
        if (fullLower.startsWith(prefixLower)) {
          value = value.slice(skipPrefix.length).trim();
        }
      }
      if (!value) return;
      const configuredChunkChars = Number(speechCfg?.localTransformers?.terminalChunkChars);
      const defaultChunkChars = Number.isFinite(configuredChunkChars)
        ? configuredChunkChars
        : (isChatterbox ? 360 : (isVitsLike ? 1000 : 420));
      const maxChunkChars = Number.isFinite(options?.maxChunkChars) ? Number(options.maxChunkChars) : defaultChunkChars;
      const chunks = splitSpeechChunks(value, maxChunkChars);
      if (chunks.length === 0) return;
      const debugOn = isTtsDebugTraceEnabled(speechCfg);
      try {
        const configuredTimeoutSec = Number(speechCfg?.localTransformers?.terminalTimeoutSec);
        const configuredTimeoutMs = Number.isFinite(configuredTimeoutSec)
          ? Math.max(30, configuredTimeoutSec) * 1000
          : null;
        const timeoutMs = Number.isFinite(options?.timeoutMs)
          ? Number(options.timeoutMs)
          : (configuredTimeoutMs || (isChatterbox ? (16 * 60 * 1000) : (isVitsLike ? 300000 : (ttsProvider === 'local-transformers' ? 120000 : 45000))));
        addTtsDebugMessage(debugOn, `start provider=${ttsProvider} model=${localModel || 'n/a'} chunks=${chunks.length} chunkChars=${maxChunkChars} timeoutMs=${timeoutMs}`);
        for (const chunk of chunks) {
          const synthStartedAt = Date.now();
          addTtsDebugMessage(debugOn, `chunk synth begin chars=${chunk.length}`);
          const result = await Promise.race([
            vc.speak(chunk),
            new Promise((resolve) => {
              setTimeout(() => resolve({ success: false, error: `TTS timed out after ${timeoutMs / 1000}s.` }), timeoutMs);
            })
          ]);
          addTtsDebugMessage(debugOn, `chunk synth end ms=${Date.now() - synthStartedAt} success=${result?.success === true}`);
          if (!result?.success && result?.error) {
            if (debugOn) addSystemMessage(`TTS notice: ${result.error}`);
            addTtsDebugMessage(debugOn, `chunk failed error=${result.error}`);
            break;
          }
        }
        addTtsDebugMessage(debugOn, 'end');
      } catch (err) {
        const msg = err?.message || String(err);
        if (!/audio playback interrupted/i.test(msg)) {
          console.warn('[Terminal] TTS error:', msg);
          if (debugOn) addSystemMessage(`TTS error: ${msg}`);
          addTtsDebugMessage(debugOn, `exception=${msg}`);
        } else {
          addTtsDebugMessage(debugOn, 'playback interrupted by user stop');
        }
      }
    }

    function ensureSpeechEngine() {
      const existing = getSpeechEngine();
      if (existing) return existing;
      if (!window.PsfSpeechEngine || typeof window.PsfSpeechEngine.createSpeechEngine !== 'function') {
        return null;
      }
      const engine = window.PsfSpeechEngine.createSpeechEngine({
        runSpeak: (chunk, options = {}) => speakAssistantTextNow(chunk, options),
        runSynthesize: (chunk, options = {}) => synthesizeAssistantChunk(chunk, options),
        runPlayAudio: (audioJob) => playAssistantAudio(audioJob),
        interruptPlayback: () => getVoiceController()?.stopSpeech?.(),
        isDebugEnabled: () => isTtsDebugTraceEnabled(),
        onDebug: (message) => addSystemMessage(`[TTS debug] ${message}`),
        minEnqueueIntervalMs: 350,
        maxQueueDepthForStream: 6,
        minContentCharsForIncrementalSegments: 320,
        minTailSpeakChars: 30,
        maxAudioQueueDepth: 5,
        minAudioQueueBeforePlay: 1,
        logDeferred: false
      });
      setSpeechEngine(engine);
      setProfileKey('');
      return engine;
    }

    async function speakAssistantText(text, options = {}) {
      const engine = ensureSpeechEngine();
      if (engine && typeof engine.enqueueText === 'function') {
        return engine.enqueueText(text, options);
      }
      return speakAssistantTextNow(text, options);
    }

    return {
      isTtsDebugTraceEnabled,
      addTtsDebugMessage,
      resolveSpeechEngineProfile,
      applySpeechEngineProfile,
      ensureSpeechEngine,
      normalizeSpeechText,
      splitSpeechChunks,
      buildSpeechRuntimeProfile,
      synthesizeAssistantChunk,
      playAssistantAudio,
      speakAssistantTextNow,
      speakAssistantText,
      getSpeechChunkProfile: () => ({ ...getChunkProfile() })
    };
  }

  window.TerminalSpeech = {
    createTerminalSpeechController
  };
})();
