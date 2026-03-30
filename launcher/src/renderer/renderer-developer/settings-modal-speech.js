/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Settings Modal - Speech tab save/load/test handlers
 * Depends on settings-modal-speech-core.js.
 */

async function loadSpeechSettings() {
  const statusEl = document.getElementById('settings-speech-status');
  try {
    if (!window.electronAPI?.voiceToTextGetConfig) return;

    const [voiceGate, cache, result] = await Promise.all([
      detectSpeechVoiceAvailability(),
      loadSpeechCatalogCache(),
      window.electronAPI.voiceToTextGetConfig()
    ]);
    speechVoiceGateState = voiceGate;
    setSpeechControlsEnabled(voiceGate.available === true);

    if (!result?.success || !result?.config) {
      if (statusEl) {
        statusEl.textContent = result?.error || 'Failed to load speech settings.';
        statusEl.style.color = '#ff6b6b';
      }
      return;
    }

    const cfg = result.config;
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(value || '');
    };
    const setChecked = (id, checked) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = checked === true;
    };

    const sttRefSaved = formatCatalogRef(cfg?.catalogRefs?.stt);
    const ttsRefSaved = formatCatalogRef(cfg?.catalogRefs?.tts);
    const localRefSaved = formatCatalogRef(cfg?.catalogRefs?.localTransformersTts);

    const sttRefSelected = sttRefSaved || findRefByModelIdentity(cache.sttOptions, cfg?.hf?.sttModel || '');
    const ttsRefSelected = ttsRefSaved || findRefByModelIdentity(cache.ttsOptions, cfg?.hf?.ttsModel || '');
    const localRefSelected = localRefSaved || findRefByModelIdentity(cache.ttsOptions, cfg?.localTransformers?.model || '');

    setSelectOptions(
      'settings-voice-stt-model',
      cache.sttOptions,
      sttRefSelected,
      cache.sttOptions.length > 0 ? 'Select STT model' : 'No STT models tagged in catalog'
    );
    setSelectOptions(
      'settings-voice-tts-model',
      cache.ttsOptions,
      ttsRefSelected,
      cache.ttsOptions.length > 0 ? 'Select TTS model' : 'No TTS models tagged in catalog'
    );
    setSelectOptions(
      'settings-voice-local-model',
      cache.ttsOptions,
      localRefSelected,
      cache.ttsOptions.length > 0 ? 'Select Local Transformers model' : 'No TTS models tagged in catalog'
    );

    setChecked('settings-voice-stt-enabled', cfg.sttEnabled === true);
    setChecked('settings-voice-tts-enabled', cfg.ttsEnabled === true);
    const terminalOverride = getSpeechSurfaceOverride(cfg, SPEECH_SURFACE_IDS.terminal, cfg);
    const codingOverride = getSpeechSurfaceOverride(cfg, SPEECH_SURFACE_IDS.coding, cfg);
    const relayOverride = getSpeechSurfaceOverride(cfg, SPEECH_SURFACE_IDS.relay, cfg);
    setChecked('settings-voice-surface-terminal-stt', terminalOverride.sttEnabled === true);
    setChecked('settings-voice-surface-terminal-tts', terminalOverride.ttsEnabled === true);
    setChecked('settings-voice-surface-coding-stt', codingOverride.sttEnabled === true);
    setChecked('settings-voice-surface-coding-tts', codingOverride.ttsEnabled === true);
    setChecked('settings-voice-surface-relay-stt', relayOverride.sttEnabled === true);
    setChecked('settings-voice-surface-relay-tts', relayOverride.ttsEnabled === true);
    setValue('settings-voice-stt-endpoint', cfg?.hf?.sttEndpoint || '');

    setValue('settings-voice-tts-provider', normalizeUiTtsProvider(cfg?.ttsProvider || 'local-transformers'));
    setValue('settings-voice-tts-endpoint', cfg?.hf?.ttsEndpoint || '');

    setValue('settings-voice-local-device', cfg?.localTransformers?.device || 'cpu');
    setValue('settings-voice-local-dtype', cfg?.localTransformers?.dtype || 'auto');
    setValue('settings-voice-local-python', normalizePythonBinInput(cfg?.localTransformers?.pythonBin || ''));
    setValue('settings-voice-local-speaking-rate', cfg?.localTransformers?.speakingRate ?? 1.0);
    setValue('settings-voice-local-noise-scale', cfg?.localTransformers?.noiseScale ?? 0.667);
    setValue('settings-voice-local-noise-duration', cfg?.localTransformers?.noiseScaleDuration ?? 0.8);
    setValue('settings-voice-local-chatterbox-cfg', cfg?.localTransformers?.chatterboxCfgWeight ?? 0.5);
    setValue('settings-voice-local-chatterbox-exaggeration', cfg?.localTransformers?.chatterboxExaggeration ?? 0.5);
    setValue('settings-voice-terminal-chunk-chars', cfg?.localTransformers?.terminalChunkChars ?? 360);
    setValue('settings-voice-terminal-timeout-sec', cfg?.localTransformers?.terminalTimeoutSec ?? 180);
    setChecked('settings-voice-terminal-debug-trace', cfg?.localTransformers?.terminalDebugTrace === true);

    const stateEl = document.getElementById('settings-voice-state');
    if (stateEl) {
      const sttOn = cfg.sttEnabled === true;
      const ttsOn = cfg.ttsEnabled === true;
      const anyOn = sttOn || ttsOn;
      stateEl.textContent = `STT ${sttOn ? 'ON' : 'OFF'} • TTS ${ttsOn ? 'ON' : 'OFF'}`;
      stateEl.style.color = anyOn ? '#00ff88' : '#ffd400';
    }

    const providerEl = document.getElementById('settings-voice-tts-provider');
    if (providerEl && !providerEl.dataset.speechBound) {
      providerEl.addEventListener('change', refreshSpeechProviderVisibility);
      providerEl.dataset.speechBound = '1';
    }
    refreshSpeechProviderVisibility();

    if (statusEl) {
      if (voiceGate.available === true) {
        statusEl.textContent = '';
        statusEl.style.color = '#888';
      } else {
        statusEl.textContent = voiceGate.reason || 'Voice pack is not installed/enabled. Speech controls are locked.';
        statusEl.style.color = '#ff6b6b';
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Load failed: ${err.message || String(err)}`;
      statusEl.style.color = '#ff6b6b';
    }
  }
}

async function saveSpeechSettings() {
  const statusEl = document.getElementById('settings-speech-status');
  if (!ensureSpeechVoiceAvailable(statusEl)) return;
  try {
    const readValue = (id) => String(document.getElementById(id)?.value || '').trim();
    const readChecked = (id) => document.getElementById(id)?.checked === true;
    const readNumber = (id, fallback) => {
      const raw = readValue(id);
      const value = Number(raw);
      if (!Number.isFinite(value)) return fallback;
      return value;
    };

    const sttRef = parseCatalogRef(readValue('settings-voice-stt-model'));
    if (sttRef === null) {
      throw new Error('Invalid STT model selection.');
    }
    const ttsRef = parseCatalogRef(readValue('settings-voice-tts-model'));
    if (ttsRef === null) {
      throw new Error('Invalid TTS model selection.');
    }
    const localRef = parseCatalogRef(readValue('settings-voice-local-model'));
    if (localRef === null) {
      throw new Error('Invalid Local Transformers model selection.');
    }

    const sttHit = speechCatalogCache.byRef.get(formatCatalogRef(sttRef));
    const ttsHit = speechCatalogCache.byRef.get(formatCatalogRef(ttsRef));
    const localHit = speechCatalogCache.byRef.get(formatCatalogRef(localRef));

    const ttsProvider = normalizeUiTtsProvider(readValue('settings-voice-tts-provider'));

    if (ttsProvider === 'local-transformers' && !formatCatalogRef(localRef)) {
      throw new Error('Select a Built-in TTS Model.');
    }
    if (ttsProvider === 'huggingface' && !formatCatalogRef(ttsRef)) {
      throw new Error('Select a Local TTS Model.');
    }

    const looksLikeGguf = (hit) => {
      const name = String(hit?.filename || '').toLowerCase();
      const id = String(hit?.modelId || '').toLowerCase();
      return name.endsWith('.gguf') || id.includes('gguf');
    };
    if (ttsProvider === 'local-transformers' && looksLikeGguf(localHit)) {
      throw new Error('Selected Built-in TTS Model is a GGUF chat model. Choose a transformers TTS model.');
    }
    if (ttsProvider === 'huggingface' && looksLikeGguf(ttsHit)) {
      throw new Error('Selected Local TTS Model is a GGUF chat model. Choose a TTS-capable model.');
    }

    const patch = {
      sttEnabled: readChecked('settings-voice-stt-enabled'),
      ttsEnabled: readChecked('settings-voice-tts-enabled'),
      surfaceOverrides: {
        [SPEECH_SURFACE_IDS.terminal]: {
          sttEnabled: readChecked('settings-voice-surface-terminal-stt'),
          ttsEnabled: readChecked('settings-voice-surface-terminal-tts')
        },
        [SPEECH_SURFACE_IDS.coding]: {
          sttEnabled: readChecked('settings-voice-surface-coding-stt'),
          ttsEnabled: readChecked('settings-voice-surface-coding-tts')
        },
        [SPEECH_SURFACE_IDS.relay]: {
          sttEnabled: readChecked('settings-voice-surface-relay-stt'),
          ttsEnabled: readChecked('settings-voice-surface-relay-tts')
        }
      },
      provider: 'huggingface',
      ttsProvider,
      hf: {
        sttModel: sttHit?.modelIdentity || '',
        sttEndpoint: readValue('settings-voice-stt-endpoint'),
        ttsModel: ttsHit?.modelIdentity || '',
        ttsEndpoint: readValue('settings-voice-tts-endpoint')
      },
      localTransformers: {
        model: localHit?.modelIdentity || '',
        device: readValue('settings-voice-local-device').toLowerCase() || 'cpu',
        dtype: readValue('settings-voice-local-dtype').toLowerCase() || 'auto',
        pythonBin: normalizePythonBinInput(readValue('settings-voice-local-python')),
        speakingRate: readNumber('settings-voice-local-speaking-rate', 1.0),
        noiseScale: readNumber('settings-voice-local-noise-scale', 0.667),
        noiseScaleDuration: readNumber('settings-voice-local-noise-duration', 0.8),
        chatterboxCfgWeight: readNumber('settings-voice-local-chatterbox-cfg', 0.5),
        chatterboxExaggeration: readNumber('settings-voice-local-chatterbox-exaggeration', 0.5),
        terminalChunkChars: readNumber('settings-voice-terminal-chunk-chars', 360),
        terminalTimeoutSec: readNumber('settings-voice-terminal-timeout-sec', 180),
        terminalDebugTrace: readChecked('settings-voice-terminal-debug-trace')
      },
      catalogRefs: {
        stt: sttRef,
        tts: ttsRef,
        localTransformersTts: localRef
      }
    };

    const result = await window.electronAPI.voiceToTextSetConfig(patch);
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to save speech settings.');
    }

    if (statusEl) {
      statusEl.textContent = 'Saved speech settings.';
      statusEl.style.color = '#00ff88';
    }
    await loadSpeechSettings();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Save failed: ${err.message || String(err)}`;
      statusEl.style.color = '#ff6b6b';
    }
  }
}

async function testSpeechOutput() {
  const statusEl = document.getElementById('settings-speech-status');
  if (!ensureSpeechVoiceAvailable(statusEl)) return;
  let stopPhaseAnimation = null;
  const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
    let timer = null;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  try {
    const sampleText = 'Jee ess enn. Speech test. Local text to speech is active.';
    const provider = normalizeUiTtsProvider(document.getElementById('settings-voice-tts-provider')?.value || 'local-transformers');
    if (statusEl) {
      statusEl.textContent = 'Preparing TTS test...';
      statusEl.style.color = '#ffd400';
    }
    const synthesize = async (text) => {
      if (provider === 'huggingface') {
        return window.electronAPI.voiceToTextSynthesizeHf({
          text,
          language: 'en-US',
          surface: 'settings-window'
        });
      }
      return window.electronAPI.voiceToTextSynthesizeLocalTransformers({
        text,
        language: 'en-US',
        surface: 'settings-window',
        timeoutMs: 120000
      });
    };
    const playResult = async (result, segmentLabel = '') => {
      if (!result?.success || !result?.audioBase64) {
        throw new Error(result?.error || 'No audio returned.');
      }
      const mimeType = String(result.mimeType || 'audio/wav');
      const src = `data:${mimeType};base64,${result.audioBase64}`;
      const audio = new Audio(src);
      audio.preload = 'auto';
      await new Promise((resolve, reject) => {
        let started = false;
        audio.onplay = () => {
          started = true;
          if (statusEl) {
            statusEl.textContent = `Playing ${segmentLabel || 'TTS audio'}...`;
            statusEl.style.color = '#00d4ff';
          }
        };
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('Audio playback failed.'));
        const startPlayback = () => {
          audio.play().catch((err) => reject(err));
        };
        audio.oncanplaythrough = () => {
          if (!started) startPlayback();
        };
        audio.load();
        setTimeout(() => {
          if (!started) startPlayback();
        }, 250);
      });
    };

    if (statusEl) {
      const startedAt = Date.now();
      statusEl.style.color = '#ffd400';
      const intervalId = setInterval(() => {
        const elapsedMs = Date.now() - startedAt;
        if (provider === 'local-transformers') {
          if (elapsedMs < 3000) {
            statusEl.textContent = 'Checking local voice runtime...';
          } else if (elapsedMs < 15000) {
            statusEl.textContent = 'Preparing local voice runtime...';
          } else if (elapsedMs < 45000) {
            statusEl.textContent = 'Loading local TTS model and generating audio...';
          } else if (elapsedMs < 90000) {
            statusEl.textContent = 'Still working: compiling/loading model runtime (this can be slow on first run)...';
          } else {
            statusEl.textContent = 'Still working: if this persists, stop and run Binary Manager > Voice Runtime > Install / Repair.';
          }
        } else {
          statusEl.textContent = 'Generating speech from local endpoint...';
        }
      }, 400);
      stopPhaseAnimation = () => {
        clearInterval(intervalId);
        stopPhaseAnimation = null;
      };
    }
    const localTestTimeoutMs = provider === 'local-transformers' ? (16 * 60 * 1000) : 180000;
    const result = await withTimeout(
      synthesize(sampleText),
      localTestTimeoutMs,
      `TTS test timed out after ${Math.round(localTestTimeoutMs / 1000)}s. Runtime/model initialization is taking too long.`
    );
    if (stopPhaseAnimation) stopPhaseAnimation();
    await playResult(result, 'TTS test');

    if (statusEl) {
      statusEl.textContent = 'TTS test played successfully.';
      statusEl.style.color = '#00ff88';
    }
  } catch (err) {
    if (stopPhaseAnimation) stopPhaseAnimation();
    if (statusEl) {
      statusEl.textContent = `TTS test failed: ${err.message || String(err)}`;
      statusEl.style.color = '#ff6b6b';
    }
  }
}

async function testSpeechInput() {
  const statusEl = document.getElementById('settings-speech-status');
  if (!ensureSpeechVoiceAvailable(statusEl)) return;
  let stopPhaseAnimation = null;
  try {
    if (!window.electronAPI?.voiceToTextTestStt) {
      throw new Error('STT test API unavailable.');
    }
    if (statusEl) {
      const startedAt = Date.now();
      statusEl.style.color = '#ffd400';
      statusEl.textContent = 'Testing STT path...';
      const intervalId = setInterval(() => {
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs < 3000) {
          statusEl.textContent = 'Checking local STT runtime...';
        } else if (elapsedMs < 15000) {
          statusEl.textContent = 'Preparing local STT runtime...';
        } else if (elapsedMs < 45000) {
          statusEl.textContent = 'Loading STT model and validating CUDA/runtime...';
        } else if (elapsedMs < 90000) {
          statusEl.textContent = 'Still working: installing/repairing runtime packages (first run can be slow)...';
        } else {
          statusEl.textContent = 'Still working: long first-run setup in progress (Python + torch + model init).';
        }
      }, 400);
      stopPhaseAnimation = () => {
        clearInterval(intervalId);
        stopPhaseAnimation = null;
      };
    }
    const result = await window.electronAPI.voiceToTextTestStt();
    if (stopPhaseAnimation) stopPhaseAnimation();
    if (!result?.success) {
      throw new Error(result?.message || result?.error || 'STT test failed.');
    }
    if (statusEl) {
      statusEl.textContent = String(result?.message || 'STT path is ready.');
      statusEl.style.color = '#00ff88';
    }
  } catch (err) {
    if (stopPhaseAnimation) stopPhaseAnimation();
    if (statusEl) {
      statusEl.textContent = `STT test failed: ${err.message || String(err)}`;
      statusEl.style.color = '#ff6b6b';
    }
  }
}

function showTtsDeviceHelp() {
  const message = [
    'Local TTS Device options:',
    '',
    'cpu: runs on processor only; most compatible, usually slowest.',
    'cuda: runs on NVIDIA GPU via CUDA; fastest when supported.',
    'mps: Apple Metal Performance Shaders backend for macOS Apple Silicon.',
    '',
    'For Linux/Windows NVIDIA systems: use cuda when available, otherwise cpu. Ignore mps.'
  ].join('\n');
  window.alert(message);
}
