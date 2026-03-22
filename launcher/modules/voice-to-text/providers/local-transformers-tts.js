/**
 * Local Transformers TTS functions.
 */
const { getVoiceToTextConfig } = require('../voice-to-text-common');
const { resolveVoiceModelFromCatalog } = require('../voice-to-text-catalog');
const common = require('./local-transformers-common');
const runtime = require('./local-transformers-runtime');
const availability = require('./local-transformers-availability');
const workerApi = require('./local-transformers-worker');

async function synthesizeWithLocalTransformers(ctx, payload = {}) {
  const settings = ctx.settingsManager.getSettings(ctx.appDir);
  const voiceCfg = getVoiceToTextConfig(settings);
  const localCfg = voiceCfg.localTransformers || {};
  const catalogRef = voiceCfg?.catalogRefs?.localTransformersTts || {};
  const catalogHit = resolveVoiceModelFromCatalog(ctx.appDir, catalogRef);
  const text = String(payload.text || '').trim();
  if (!text) {
    return { success: false, error: 'TTS text is empty.' };
  }

  const configuredModel = String(catalogHit?.model?.huggingface_repo || catalogHit?.model?.id || localCfg.model || 'facebook/mms-tts-eng');
  const selectedModel = common.isDiaModel(configuredModel) ? common.resolveDiaTransformersModel(configuredModel) : configuredModel;
  const runtimeResult = await runtime.resolvePythonBinForModel(localCfg, { appDir: ctx.appDir, model: selectedModel });
  if (!runtimeResult?.success || !runtimeResult?.pythonBin) {
    return {
      success: false,
      error: `Local Transformers TTS unavailable: ${runtimeResult?.error || 'No Python runtime available for selected TTS model.'}`
    };
  }
  const pythonBin = runtimeResult.pythonBin;
  const scriptPath = common.path.join(__dirname, 'local_transformers_tts.py');
  let effectiveDevice = String(localCfg.device || 'cpu');
  let probe = await availability.checkLocalTransformersAvailability(localCfg, { appDir: ctx.appDir, model: selectedModel, pythonBin });
  if (!probe.available) {
    if (String(localCfg.device || 'cpu').toLowerCase() === 'cuda' && common.isCudaUnavailableErrorText(probe.error)) {
      effectiveDevice = 'cpu';
      const cpuCfg = { ...localCfg, device: 'cpu' };
      probe = await availability.checkLocalTransformersAvailability(cpuCfg, { appDir: ctx.appDir, model: selectedModel, pythonBin });
    }
  }
  if (!probe.available) {
    return {
      success: false,
      error: `Local Transformers TTS unavailable: ${probe.error}`
    };
  }
  const configuredMaxTokens = Number(localCfg.maxNewTokens);
  const effectiveMaxTokens = common.isDiaModel(selectedModel)
    ? ((Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 256) ? configuredMaxTokens : 3072)
    : ((Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0) ? configuredMaxTokens : 180);

  const request = {
    text,
    model: selectedModel,
    device: effectiveDevice,
    dtype: String(localCfg.dtype || 'auto'),
    max_new_tokens: effectiveMaxTokens
  };
  request.speaking_rate = Number(localCfg.speakingRate ?? 1.0);
  request.noise_scale = Number(localCfg.noiseScale ?? 0.667);
  request.noise_scale_duration = Number(localCfg.noiseScaleDuration ?? 0.8);
  request.chatterbox_cfg_weight = Number(localCfg.chatterboxCfgWeight ?? 0.5);
  request.chatterbox_exaggeration = Number(localCfg.chatterboxExaggeration ?? 0.5);
  const hfToken = String(
    ctx?.settingsManager?.getHuggingFaceToken?.(ctx.appDir)
    || settings?.huggingface_token
    || ''
  ).trim();
  if (hfToken) request.hf_token = hfToken;

  let parsed = null;
  try {
    const worker = workerApi.ensureLocalTransformersWorker(pythonBin, scriptPath);
    const requestedTimeoutMs = Number.isFinite(payload?.timeoutMs) ? Number(payload.timeoutMs) : 120000;
    const minimumTimeoutMs = common.isChatterboxModel(selectedModel)
      ? 15 * 60 * 1000
      : (common.isDiaModel(selectedModel) ? 10 * 60 * 1000 : 120000);
    const workerTimeoutMs = Math.max(requestedTimeoutMs, minimumTimeoutMs);
    parsed = await workerApi.requestLocalTransformersWorker(worker, request, { timeout: workerTimeoutMs });
  } catch (err) {
    common.clearProbeCacheForPython(pythonBin);
    return { success: false, error: `Local Transformers TTS worker failed: ${err.message}` };
  }

  try {
    if (parsed && parsed.success === true && parsed.audioBase64) {
      return {
        success: true,
        provider: 'local-transformers',
        mimeType: String(parsed.mimeType || 'audio/wav'),
        audioBase64: String(parsed.audioBase64),
        model: String(request.model || localCfg.model || 'facebook/mms-tts-eng')
      };
    }
    const errText = String(parsed?.error || 'Local Transformers TTS returned no audio.');
    if (/(missing python packages|torch\.cuda\.is_available|cuda requested)/i.test(errText)) {
      common.clearProbeCacheForPython(pythonBin);
    }
    return { success: false, error: errText };
  } catch (err) {
    return {
      success: false,
      error: `Invalid Local Transformers TTS response: ${err.message}`
    };
  }
}

async function prewarmLocalTransformers(ctx, payload = {}) {
  const settings = ctx.settingsManager.getSettings(ctx.appDir);
  const voiceCfg = getVoiceToTextConfig(settings);
  const localCfg = voiceCfg.localTransformers || {};
  const catalogRef = voiceCfg?.catalogRefs?.localTransformersTts || {};
  const catalogHit = resolveVoiceModelFromCatalog(ctx.appDir, catalogRef);
  const configuredModel = String(catalogHit?.model?.huggingface_repo || catalogHit?.model?.id || localCfg.model || 'facebook/mms-tts-eng');
  const selectedModel = common.isDiaModel(configuredModel) ? common.resolveDiaTransformersModel(configuredModel) : configuredModel;
  const runtimeResult = await runtime.resolvePythonBinForModel(localCfg, { appDir: ctx.appDir, model: selectedModel });
  if (!runtimeResult?.success || !runtimeResult?.pythonBin) {
    return {
      success: false,
      error: `Local Transformers TTS unavailable: ${runtimeResult?.error || 'No Python runtime available for selected TTS model.'}`
    };
  }
  const pythonBin = runtimeResult.pythonBin;
  const scriptPath = common.path.join(__dirname, 'local_transformers_tts.py');
  let effectiveDevice = String(localCfg.device || 'cpu');
  let probe = await availability.checkLocalTransformersAvailability(localCfg, { appDir: ctx.appDir, model: selectedModel, pythonBin });
  if (!probe.available) {
    if (String(localCfg.device || 'cpu').toLowerCase() === 'cuda' && common.isCudaUnavailableErrorText(probe.error)) {
      effectiveDevice = 'cpu';
      const cpuCfg = { ...localCfg, device: 'cpu' };
      probe = await availability.checkLocalTransformersAvailability(cpuCfg, { appDir: ctx.appDir, model: selectedModel, pythonBin });
    }
  }
  if (!probe.available) {
    return {
      success: false,
      error: `Local Transformers TTS unavailable: ${probe.error}`
    };
  }
  const request = {
    prewarm: true,
    prime: true,
    prime_text: 'PSF warmup.',
    model: selectedModel,
    device: effectiveDevice,
    dtype: String(localCfg.dtype || 'auto'),
    max_new_tokens: common.isDiaModel(selectedModel) ? 3072 : Number(localCfg.maxNewTokens || 180),
    speaking_rate: Number(localCfg.speakingRate ?? 1.0),
    noise_scale: Number(localCfg.noiseScale ?? 0.667),
    noise_scale_duration: Number(localCfg.noiseScaleDuration ?? 0.8),
    chatterbox_cfg_weight: Number(localCfg.chatterboxCfgWeight ?? 0.5),
    chatterbox_exaggeration: Number(localCfg.chatterboxExaggeration ?? 0.5)
  };
  const hfToken = String(
    ctx?.settingsManager?.getHuggingFaceToken?.(ctx.appDir)
    || settings?.huggingface_token
    || ''
  ).trim();
  if (hfToken) request.hf_token = hfToken;
  try {
    const worker = workerApi.ensureLocalTransformersWorker(pythonBin, scriptPath);
    const requestedTimeoutMs = Number.isFinite(payload?.timeoutMs) ? Number(payload.timeoutMs) : 120000;
    const minimumTimeoutMs = common.isDiaModel(selectedModel) ? 10 * 60 * 1000 : 120000;
    const parsed = await workerApi.requestLocalTransformersWorker(worker, request, {
      timeout: Math.max(requestedTimeoutMs, minimumTimeoutMs)
    });
    if (parsed?.success) {
      return {
        success: true,
        provider: 'local-transformers',
        warmed: true,
        model: String(request.model),
        device: String(request.device)
      };
    }
    return { success: false, error: String(parsed?.error || 'Local Transformers TTS warmup failed.') };
  } catch (err) {
    common.clearProbeCacheForPython(pythonBin);
    return { success: false, error: `Local Transformers TTS warmup failed: ${err.message || String(err)}` };
  }
}

module.exports = {
  synthesizeWithLocalTransformers,
  prewarmLocalTransformers
};
