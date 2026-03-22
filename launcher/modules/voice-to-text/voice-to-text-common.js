/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Voice-to-Text common config helpers (global module).
 */

const DEFAULT_VOICE_TO_TEXT_CONFIG = {
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
  hf: {
    sttEndpoint: '',
    sttModel: 'openai/whisper-small',
    ttsEndpoint: '',
    ttsModel: 'microsoft/speecht5_tts',
    ttsVoice: ''
  },
  localTransformers: {
    pythonBin: '',
    model: 'facebook/mms-tts-eng',
    device: 'cpu',
    dtype: 'auto',
    maxNewTokens: 180,
    terminalChunkChars: 360,
    terminalTimeoutSec: 180,
    terminalDebugTrace: false,
    speakingRate: 1.0,
    noiseScale: 0.667,
    noiseScaleDuration: 0.8,
    chatterboxCfgWeight: 0.5,
    chatterboxExaggeration: 0.5
  },
  hardware: {
    inputDeviceId: ''
  },
  catalogRefs: {
    stt: { collectionId: '', modelId: '' },
    tts: { collectionId: '', modelId: '' },
    localTransformersTts: { collectionId: '', modelId: '' }
  }
};

function normalizeSurfaceId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSurfaceOverride(raw, defaults = {}) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  return {
    sttEnabled: (typeof src.sttEnabled === 'boolean') ? src.sttEnabled : defaults.sttEnabled === true,
    ttsEnabled: (typeof src.ttsEnabled === 'boolean') ? src.ttsEnabled : defaults.ttsEnabled === true
  };
}

function normalizeSurfaceOverrides(raw, defaults = {}) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    const surface = normalizeSurfaceId(key);
    if (!surface) continue;
    out[surface] = normalizeSurfaceOverride(value, defaults);
  }
  return out;
}

function normalizeProvider(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'huggingface') return raw;
  // Enforce local-model STT defaults by disallowing web-speech fallback.
  return 'huggingface';
}

function normalizeTtsProvider(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'huggingface') return raw;
  if (raw === 'local-transformers') return 'local-transformers';
  // Enforce local-model TTS defaults by disallowing web-speech fallback.
  return 'local-transformers';
}

function normalizeLanguage(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'en-US';
  return raw.slice(0, 32);
}

function normalizeSttInputMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'vox') return 'vox';
  return 'ptt';
}

function normalizeHfConfig(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const legacyEndpoint = String(src.endpoint || '').trim();
  const legacyModel = String(src.model || '').trim();
  return {
    sttEndpoint: String(src.sttEndpoint || legacyEndpoint).trim(),
    sttModel: String(src.sttModel || legacyModel || DEFAULT_VOICE_TO_TEXT_CONFIG.hf.sttModel).trim() || DEFAULT_VOICE_TO_TEXT_CONFIG.hf.sttModel,
    ttsEndpoint: String(src.ttsEndpoint || '').trim(),
    ttsModel: String(src.ttsModel || DEFAULT_VOICE_TO_TEXT_CONFIG.hf.ttsModel).trim() || DEFAULT_VOICE_TO_TEXT_CONFIG.hf.ttsModel,
    ttsVoice: String(src.ttsVoice || '').trim()
  };
}

function normalizeLocalTransformersConfig(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const rawDevice = String(src.device || 'cpu').trim().toLowerCase();
  const device = (rawDevice === 'cuda' || rawDevice === 'mps' || rawDevice === 'cpu') ? rawDevice : 'cpu';
  const rawDtype = String(src.dtype || 'auto').trim().toLowerCase();
  const dtype = (rawDtype === 'auto' || rawDtype === 'float16' || rawDtype === 'float32' || rawDtype === 'bfloat16')
    ? rawDtype
    : 'auto';
  const maxNewTokens = Number.isFinite(Number(src.maxNewTokens))
    ? Math.max(16, Math.min(1024, Math.floor(Number(src.maxNewTokens))))
    : 180;
  const terminalChunkChars = Number.isFinite(Number(src.terminalChunkChars))
    ? Math.max(80, Math.min(2000, Math.floor(Number(src.terminalChunkChars))))
    : 360;
  const terminalTimeoutSec = Number.isFinite(Number(src.terminalTimeoutSec))
    ? Math.max(30, Math.min(1800, Math.floor(Number(src.terminalTimeoutSec))))
    : 180;
  const terminalDebugTrace = src.terminalDebugTrace === true;
  const speakingRate = Number.isFinite(Number(src.speakingRate))
    ? Math.max(0.5, Math.min(2.0, Number(src.speakingRate)))
    : 1.0;
  const noiseScale = Number.isFinite(Number(src.noiseScale))
    ? Math.max(0.1, Math.min(2.0, Number(src.noiseScale)))
    : 0.667;
  const noiseScaleDuration = Number.isFinite(Number(src.noiseScaleDuration))
    ? Math.max(0.1, Math.min(2.0, Number(src.noiseScaleDuration)))
    : 0.8;
  const chatterboxCfgWeight = Number.isFinite(Number(src.chatterboxCfgWeight))
    ? Math.max(0.0, Math.min(1.5, Number(src.chatterboxCfgWeight)))
    : 0.5;
  const chatterboxExaggeration = Number.isFinite(Number(src.chatterboxExaggeration))
    ? Math.max(0.0, Math.min(1.5, Number(src.chatterboxExaggeration)))
    : 0.5;
  return {
    pythonBin: String(src.pythonBin || '').trim(),
    model: String(src.model || DEFAULT_VOICE_TO_TEXT_CONFIG.localTransformers.model).trim() || DEFAULT_VOICE_TO_TEXT_CONFIG.localTransformers.model,
    device,
    dtype,
    maxNewTokens,
    terminalChunkChars,
    terminalTimeoutSec,
    terminalDebugTrace,
    speakingRate,
    noiseScale,
    noiseScaleDuration,
    chatterboxCfgWeight,
    chatterboxExaggeration
  };
}

function normalizeCatalogRef(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  return {
    collectionId: String(src.collectionId || '').trim(),
    modelId: String(src.modelId || '').trim()
  };
}

function normalizeCatalogRefs(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  return {
    stt: normalizeCatalogRef(src.stt),
    tts: normalizeCatalogRef(src.tts),
    localTransformersTts: normalizeCatalogRef(src.localTransformersTts)
  };
}

function normalizeHardwareConfig(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  return {
    inputDeviceId: String(src.inputDeviceId || '').trim()
  };
}

function normalizeVoiceToTextConfig(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const localTransformersRaw = (src.localTransformers && typeof src.localTransformers === 'object')
    ? src.localTransformers
    : {};
  const localTransformers = normalizeLocalTransformersConfig(localTransformersRaw);
  const hasSttEnabled = typeof src.sttEnabled === 'boolean';
  const hasTtsEnabled = typeof src.ttsEnabled === 'boolean';
  const legacyEnabled = src.enabled === true;
  const sttEnabled = hasSttEnabled ? src.sttEnabled === true : legacyEnabled;
  const ttsEnabled = hasTtsEnabled ? src.ttsEnabled === true : legacyEnabled;
  const enabled = sttEnabled || ttsEnabled;
  const voxAutoSendDelayMs = Number.isFinite(Number(src.voxAutoSendDelayMs))
    ? Math.max(250, Math.min(6000, Math.floor(Number(src.voxAutoSendDelayMs))))
    : DEFAULT_VOICE_TO_TEXT_CONFIG.voxAutoSendDelayMs;
  return {
    enabled,
    sttEnabled,
    ttsEnabled,
    surfaceOverrides: normalizeSurfaceOverrides(src.surfaceOverrides, { sttEnabled, ttsEnabled }),
    provider: normalizeProvider(src.provider),
    ttsProvider: normalizeTtsProvider(src.ttsProvider || src.provider),
    sttInputMode: normalizeSttInputMode(src.sttInputMode),
    language: normalizeLanguage(src.language),
    autoSend: src.autoSend === true,
    voxAutoSendDelayMs,
    hf: normalizeHfConfig(src.hf),
    localTransformers,
    hardware: normalizeHardwareConfig(src.hardware),
    catalogRefs: normalizeCatalogRefs(src.catalogRefs)
  };
}

function getVoiceToTextConfig(settings = {}) {
  const merged = {
    ...DEFAULT_VOICE_TO_TEXT_CONFIG,
    ...(settings.voice_to_text && typeof settings.voice_to_text === 'object' ? settings.voice_to_text : {})
  };
  return normalizeVoiceToTextConfig(merged);
}

function patchVoiceToTextConfig(currentConfig = {}, patch = {}) {
  const srcPatch = (patch && typeof patch === 'object') ? patch : {};
  const normalizeCurrent = normalizeVoiceToTextConfig(currentConfig);
  let sttEnabledPatch;
  let ttsEnabledPatch;

  if (typeof srcPatch.sttEnabled === 'boolean') sttEnabledPatch = srcPatch.sttEnabled;
  if (typeof srcPatch.ttsEnabled === 'boolean') ttsEnabledPatch = srcPatch.ttsEnabled;
  if (typeof srcPatch.enabled === 'boolean') {
    if (typeof sttEnabledPatch !== 'boolean') sttEnabledPatch = srcPatch.enabled;
    if (typeof ttsEnabledPatch !== 'boolean') ttsEnabledPatch = srcPatch.enabled;
  }

  const next = {
    ...normalizeCurrent,
    ...srcPatch,
    sttEnabled: typeof sttEnabledPatch === 'boolean' ? sttEnabledPatch : normalizeCurrent.sttEnabled === true,
    ttsEnabled: typeof ttsEnabledPatch === 'boolean' ? ttsEnabledPatch : normalizeCurrent.ttsEnabled === true,
    surfaceOverrides: {
      ...normalizeSurfaceOverrides(currentConfig.surfaceOverrides, {
        sttEnabled: normalizeCurrent.sttEnabled === true,
        ttsEnabled: normalizeCurrent.ttsEnabled === true
      }),
      ...(srcPatch.surfaceOverrides && typeof srcPatch.surfaceOverrides === 'object'
        ? srcPatch.surfaceOverrides
        : {})
    },
    hf: {
      ...normalizeHfConfig(currentConfig.hf),
      ...(srcPatch.hf && typeof srcPatch.hf === 'object' ? srcPatch.hf : {})
    },
    localTransformers: {
      ...normalizeLocalTransformersConfig(currentConfig.localTransformers),
      ...(srcPatch.localTransformers && typeof srcPatch.localTransformers === 'object'
        ? srcPatch.localTransformers
        : {})
    },
    hardware: {
      ...normalizeHardwareConfig(currentConfig.hardware),
      ...(srcPatch.hardware && typeof srcPatch.hardware === 'object'
        ? srcPatch.hardware
        : {})
    },
    catalogRefs: {
      ...normalizeCatalogRefs(currentConfig.catalogRefs),
      ...(srcPatch.catalogRefs && typeof srcPatch.catalogRefs === 'object' ? srcPatch.catalogRefs : {})
    }
  };
  next.enabled = next.sttEnabled === true || next.ttsEnabled === true;
  return normalizeVoiceToTextConfig(next);
}

function getSurfaceOverride(config = {}, surface = '') {
  const normalizedConfig = normalizeVoiceToTextConfig(config);
  const surfaceId = normalizeSurfaceId(surface);
  if (!surfaceId) return null;
  const map = normalizedConfig.surfaceOverrides && typeof normalizedConfig.surfaceOverrides === 'object'
    ? normalizedConfig.surfaceOverrides
    : {};
  const hit = map[surfaceId];
  if (!hit || typeof hit !== 'object') return null;
  return normalizeSurfaceOverride(hit, {
    sttEnabled: normalizedConfig.sttEnabled === true,
    ttsEnabled: normalizedConfig.ttsEnabled === true
  });
}

function isSttEnabledForSurface(config = {}, surface = '') {
  const normalizedConfig = normalizeVoiceToTextConfig(config);
  if (normalizedConfig.sttEnabled !== true) return false;
  const override = getSurfaceOverride(normalizedConfig, surface);
  if (!override) return true;
  return override.sttEnabled === true;
}

function isTtsEnabledForSurface(config = {}, surface = '') {
  const normalizedConfig = normalizeVoiceToTextConfig(config);
  if (normalizedConfig.ttsEnabled !== true) return false;
  const override = getSurfaceOverride(normalizedConfig, surface);
  if (!override) return true;
  return override.ttsEnabled === true;
}

module.exports = {
  DEFAULT_VOICE_TO_TEXT_CONFIG,
  getVoiceToTextConfig,
  patchVoiceToTextConfig,
  normalizeVoiceToTextConfig,
  getSurfaceOverride,
  isSttEnabledForSurface,
  isTtsEnabledForSurface
};
