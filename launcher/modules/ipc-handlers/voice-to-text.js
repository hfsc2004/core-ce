/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const {
  getVoiceToTextConfig,
  patchVoiceToTextConfig,
  isSttEnabledForSurface,
  isTtsEnabledForSurface
} = require('../voice-to-text/voice-to-text-common');
const { transcribeWithHuggingFace, checkHuggingFaceSttHealth } = require('../voice-to-text/providers/huggingface-stt');
const { synthesizeWithHuggingFace } = require('../voice-to-text/providers/huggingface-tts');
const {
  checkLocalTransformersAvailability,
  synthesizeWithLocalTransformers,
  transcribeWithLocalTransformers,
  testLocalTransformersStt,
  prewarmLocalTransformersStt,
  prewarmLocalTransformers
} = require('../voice-to-text/providers/local-transformers');

const PREWARM_TTL_MS = 90 * 1000;
const ttsPrewarmCache = new Map();
const ttsPrewarmInflight = new Map();
const sttPrewarmCache = new Map();
const sttPrewarmInflight = new Map();

async function checkVoiceCapabilities(ctx, required = []) {
  const requiredCaps = Array.isArray(required) ? required : [];
  if (!ctx?.modLoader || typeof ctx.modLoader.hasEnabledCapability !== 'function') {
    return {
      ok: false,
      available: false,
      missing: requiredCaps,
      error: 'Voice capability pack is not available in this runtime.'
    };
  }

  const missing = [];
  const grants = [];
  for (const capability of requiredCaps) {
    const check = await ctx.modLoader.hasEnabledCapability(capability);
    if (!check?.ok || check?.available !== true) {
      missing.push(capability);
    } else {
      grants.push({ capability, modId: check.modId || '', version: check.version || '' });
    }
  }
  return {
    ok: true,
    available: missing.length === 0,
    missing,
    grants
  };
}

function voiceCapabilityError(missing = []) {
  const suffix = Array.isArray(missing) && missing.length > 0
    ? ` Missing capabilities: ${missing.join(', ')}.`
    : '';
  return `Voice pack is not installed/enabled.${suffix}`;
}

function buildTtsPrewarmKey(config = {}) {
  const provider = String(config?.ttsProvider || 'local-transformers').toLowerCase();
  const localCfg = config?.localTransformers || {};
  const model = provider === 'local-transformers'
    ? String(localCfg?.model || '')
    : String(config?.hf?.ttsModel || '');
  const device = String(localCfg?.device || '');
  const endpoint = String(config?.hf?.ttsEndpoint || '');
  return `${provider}|${model}|${device}|${endpoint}`;
}

function buildSttPrewarmKey(config = {}) {
  const localCfg = config?.localTransformers || {};
  const model = String(config?.hf?.sttModel || '');
  const endpoint = String(config?.hf?.sttEndpoint || '');
  const device = String(localCfg?.device || '');
  return `${model}|${endpoint}|${device}`;
}

function createVoiceToTextHandlers() {
  return {
    'voice-to-text:get-config': (ctx) => {
      const settings = ctx.settingsManager.getSettings(ctx.appDir);
      return {
        success: true,
        config: getVoiceToTextConfig(settings)
      };
    },
    'voice-to-text:set-config': async (ctx, event, patch = {}) => {
      // Fail closed for config mutation unless a voice capture-capable mod is enabled.
      const gate = await checkVoiceCapabilities(ctx, ['voice.capture']);
      if (!gate.available) {
        return { success: false, error: voiceCapabilityError(gate.missing), modGate: gate };
      }
      const settings = ctx.settingsManager.getSettings(ctx.appDir);
      const current = getVoiceToTextConfig(settings);
      const next = patchVoiceToTextConfig(current, patch);
      const saveResult = ctx.settingsManager.saveSettings(ctx.appDir, {
        ...settings,
        voice_to_text: next
      });
      if (!saveResult?.success) {
        return { success: false, error: saveResult?.error || 'Failed to save voice-to-text config.' };
      }
      return {
        success: true,
        config: next
      };
    },
    'voice-to-text:get-capabilities': async (ctx) => {
      const gateCapture = await checkVoiceCapabilities(ctx, ['voice.capture']);
      const gateStt = await checkVoiceCapabilities(ctx, ['voice.capture', 'voice.stt']);
      const gateTts = await checkVoiceCapabilities(ctx, ['voice.tts']);
      const voiceAvailable = gateCapture.available && (gateStt.available || gateTts.available);
      if (!voiceAvailable) {
        return {
          success: true,
          providers: [],
          configured: {
            sttEnabled: false,
            ttsEnabled: false,
            huggingface: { stt: false, tts: false },
            localTransformers: { available: false, error: voiceCapabilityError([...(gateCapture.missing || []), ...(gateStt.missing || []), ...(gateTts.missing || [])]) }
          },
          selectedModels: {
            stt: '',
            tts: '',
            localTransformersTts: ''
          },
          catalogRefs: {
            stt: { collectionId: '', modelId: '' },
            tts: { collectionId: '', modelId: '' },
            localTransformersTts: { collectionId: '', modelId: '' }
          },
          modGate: {
            available: false,
            capture: gateCapture,
            stt: gateStt,
            tts: gateTts
          }
        };
      }
      const settings = ctx.settingsManager.getSettings(ctx.appDir);
      const config = getVoiceToTextConfig(settings);
      const localCfg = config?.localTransformers || {};
      const localTransformers = await checkLocalTransformersAvailability(localCfg, { appDir: ctx.appDir });
      return {
        success: true,
        providers: [
          {
            id: 'huggingface',
            label: 'Endpoint STT/TTS',
            requiresEndpoint: false
          },
          {
            id: 'local-transformers',
            label: 'Local Transformers (STT/TTS)',
            requiresEndpoint: false
          }
        ],
        configured: {
          sttEnabled: config?.sttEnabled === true,
          ttsEnabled: config?.ttsEnabled === true,
          huggingface: {
            stt: Boolean(config?.hf?.sttEndpoint),
            tts: Boolean(config?.hf?.ttsEndpoint)
          },
          localTransformers: {
            available: localTransformers.available === true,
            error: localTransformers.available ? '' : String(localTransformers.error || '')
          }
        },
        selectedModels: {
          stt: String(config?.hf?.sttModel || 'openai/whisper-small'),
          tts: String(config?.hf?.ttsModel || 'microsoft/speecht5_tts'),
          localTransformersTts: String(localCfg?.model || 'facebook/mms-tts-eng')
        },
        catalogRefs: {
          stt: config?.catalogRefs?.stt || { collectionId: '', modelId: '' },
          tts: config?.catalogRefs?.tts || { collectionId: '', modelId: '' },
          localTransformersTts: config?.catalogRefs?.localTransformersTts || { collectionId: '', modelId: '' }
        },
        modGate: {
          available: true,
          capture: gateCapture,
          stt: gateStt,
          tts: gateTts
        }
      };
    },
    'voice-to-text:transcribe-hf': async (ctx, event, payload = {}) => {
      const gate = await checkVoiceCapabilities(ctx, ['voice.capture', 'voice.stt']);
      if (!gate.available) return { success: false, error: voiceCapabilityError(gate.missing), modGate: gate };
      const settings = ctx.settingsManager.getSettings(ctx.appDir);
      const config = getVoiceToTextConfig(settings);
      const surface = String(payload?.surface || '').trim().toLowerCase();
      if (!isSttEnabledForSurface(config, surface)) {
        return { success: false, error: 'STT is disabled for this surface in speech settings.' };
      }
      const endpoint = String(config?.hf?.sttEndpoint || '').trim();
      if (!endpoint) {
        return transcribeWithLocalTransformers(ctx, payload);
      }
      return transcribeWithHuggingFace(ctx, payload);
    },
    'voice-to-text:test-stt': async (ctx) => {
      const gate = await checkVoiceCapabilities(ctx, ['voice.capture', 'voice.stt']);
      if (!gate.available) return { success: false, message: voiceCapabilityError(gate.missing), modGate: gate };
      const settings = ctx.settingsManager.getSettings(ctx.appDir);
      const config = getVoiceToTextConfig(settings);
      const endpoint = String(config?.hf?.sttEndpoint || '').trim();
      if (endpoint) {
        const health = await checkHuggingFaceSttHealth(ctx);
        return {
          success: health?.success === true,
          mode: 'endpoint',
          endpoint,
          message: String(health?.message || '')
        };
      }
      return testLocalTransformersStt(ctx, {});
    },
    'voice-to-text:synthesize-hf': async (ctx, event, payload = {}) => {
      const gate = await checkVoiceCapabilities(ctx, ['voice.tts']);
      if (!gate.available) return { success: false, error: voiceCapabilityError(gate.missing), modGate: gate };
      const settings = ctx.settingsManager.getSettings(ctx.appDir);
      const config = getVoiceToTextConfig(settings);
      const surface = String(payload?.surface || '').trim().toLowerCase();
      if (!isTtsEnabledForSurface(config, surface)) {
        return { success: false, error: 'TTS is disabled for this surface in speech settings.' };
      }
      return synthesizeWithHuggingFace(ctx, payload);
    },
    'voice-to-text:synthesize-local-transformers': async (ctx, event, payload = {}) => {
      const gate = await checkVoiceCapabilities(ctx, ['voice.tts']);
      if (!gate.available) return { success: false, error: voiceCapabilityError(gate.missing), modGate: gate };
      const settings = ctx.settingsManager.getSettings(ctx.appDir);
      const config = getVoiceToTextConfig(settings);
      const surface = String(payload?.surface || '').trim().toLowerCase();
      if (!isTtsEnabledForSurface(config, surface)) {
        return { success: false, error: 'TTS is disabled for this surface in speech settings.' };
      }
      return synthesizeWithLocalTransformers(ctx, payload);
    },
    'voice-to-text:prewarm-tts': async (ctx, event, payload = {}) => {
      const gate = await checkVoiceCapabilities(ctx, ['voice.tts']);
      if (!gate.available) return { success: false, skipped: true, error: voiceCapabilityError(gate.missing), modGate: gate };
      const settings = ctx.settingsManager.getSettings(ctx.appDir);
      const config = getVoiceToTextConfig(settings);
      if (config?.ttsEnabled !== true) {
        return { success: false, skipped: true, error: 'TTS is disabled in global speech settings.' };
      }
      const key = buildTtsPrewarmKey(config);
      const now = Date.now();
      const cachedAt = Number(ttsPrewarmCache.get(key) || 0);
      if (cachedAt > 0 && (now - cachedAt) < PREWARM_TTL_MS) {
        return { success: true, warmed: true, cached: true };
      }
      const existing = ttsPrewarmInflight.get(key);
      if (existing) return existing;

      const provider = String(config?.ttsProvider || 'local-transformers').toLowerCase();
      const run = (async () => {
        try {
          let result;
          if (provider === 'local-transformers') {
            const localModel = String(config?.localTransformers?.model || '').trim().toLowerCase();
            if (localModel.includes('chatterbox')) {
              result = { success: true, warmed: false, skipped: true, provider: 'local-transformers', reason: 'chatterbox_prewarm_skip' };
            } else {
              result = await prewarmLocalTransformers(ctx, payload);
            }
          } else if (provider === 'huggingface') {
            // Local HF endpoint warmup is model-specific and may be expensive;
            // keep prewarm non-blocking by marking provider as accepted.
            result = { success: true, warmed: false, skipped: true, provider: 'huggingface' };
          } else {
            result = { success: false, error: `Unsupported TTS provider: ${provider}` };
          }
          if (result?.success) {
            ttsPrewarmCache.set(key, Date.now());
          }
          return result;
        } finally {
          ttsPrewarmInflight.delete(key);
        }
      })();

      ttsPrewarmInflight.set(key, run);
      return run;
    },
    'voice-to-text:prewarm-stt': async (ctx, event, payload = {}) => {
      const gate = await checkVoiceCapabilities(ctx, ['voice.capture', 'voice.stt']);
      if (!gate.available) return { success: false, skipped: true, error: voiceCapabilityError(gate.missing), modGate: gate };
      const settings = ctx.settingsManager.getSettings(ctx.appDir);
      const config = getVoiceToTextConfig(settings);
      if (config?.sttEnabled !== true) {
        return { success: false, skipped: true, error: 'STT is disabled in global speech settings.' };
      }
      const key = buildSttPrewarmKey(config);
      const now = Date.now();
      const cachedAt = Number(sttPrewarmCache.get(key) || 0);
      if (cachedAt > 0 && (now - cachedAt) < PREWARM_TTL_MS) {
        return { success: true, warmed: true, cached: true };
      }
      const existing = sttPrewarmInflight.get(key);
      if (existing) return existing;

      const run = (async () => {
        try {
          const endpoint = String(config?.hf?.sttEndpoint || '').trim();
          let result;
          if (endpoint) {
            result = await checkHuggingFaceSttHealth(ctx);
          } else {
            result = await prewarmLocalTransformersStt(ctx, payload);
          }
          if (result?.success) {
            sttPrewarmCache.set(key, Date.now());
          }
          return result;
        } finally {
          sttPrewarmInflight.delete(key);
        }
      })();
      sttPrewarmInflight.set(key, run);
      return run;
    }
  };
}

module.exports = {
  createVoiceToTextHandlers
};
