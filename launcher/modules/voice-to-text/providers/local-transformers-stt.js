/**
 * Local Transformers STT functions.
 */
const { getVoiceToTextConfig } = require('../voice-to-text-common');
const { resolveVoiceModelFromCatalog } = require('../voice-to-text-catalog');
const common = require('./local-transformers-common');
const runtime = require('./local-transformers-runtime');
const availability = require('./local-transformers-availability');
const workerApi = require('./local-transformers-worker');

async function resolvePythonBinForLocalStt(ctx, localCfg = {}, selectedModel = '') {
  const effectiveModel = String(selectedModel || '').trim();
  const wantsCuda = String(localCfg?.device || 'cpu').trim().toLowerCase() === 'cuda';
  const requiresChatterbox = common.isChatterboxModel(effectiveModel);
  const requiresDia = common.isDiaModel(effectiveModel);

  const ensuredManaged = await runtime.ensureManagedVoiceRuntime(ctx.appDir, {
    requiresChatterbox,
    requiresDia,
    prefersCuda: wantsCuda
  });
  if (ensuredManaged?.success && ensuredManaged?.pythonBin) {
    return { success: true, pythonBin: ensuredManaged.pythonBin, source: 'voice-runtime' };
  }
  if (wantsCuda) {
    return {
      success: false,
      error: `CUDA STT runtime prepare failed: ${ensuredManaged?.error || 'Unable to prepare managed voice runtime with CUDA torch.'}`
    };
  }

  const fallback = await runtime.resolvePythonBinForModel(localCfg, { appDir: ctx.appDir, model: effectiveModel });
  if (!fallback?.success || !fallback?.pythonBin) {
    return {
      success: false,
      error: fallback?.error || 'No Python runtime available for selected STT model.'
    };
  }
  return { success: true, pythonBin: fallback.pythonBin, source: fallback.source || 'fallback' };
}

async function transcribeWithLocalTransformers(ctx, payload = {}) {
  const settings = ctx.settingsManager.getSettings(ctx.appDir);
  const voiceCfg = getVoiceToTextConfig(settings);
  const localCfg = voiceCfg.localTransformers || {};
  const catalogRef = voiceCfg?.catalogRefs?.stt || {};
  const catalogHit = resolveVoiceModelFromCatalog(ctx.appDir, catalogRef);
  const selectedModel = String(
    catalogHit?.model?.huggingface_repo ||
    catalogHit?.model?.id ||
    voiceCfg?.hf?.sttModel ||
    'openai/whisper-small'
  ).trim();
  if (!selectedModel) {
    return { success: false, error: 'STT model is not configured.' };
  }
  const audioBase64 = String(payload?.audioBase64 || '').trim();
  if (!audioBase64) {
    return { success: false, error: 'Audio payload is empty.' };
  }
  const mimeType = String(payload?.mimeType || 'audio/wav').trim().toLowerCase();
  if (!mimeType.includes('wav')) {
    return { success: false, error: `Local STT expects WAV audio input. Got: ${mimeType || 'unknown'}` };
  }

  const runtimeResolved = await resolvePythonBinForLocalStt(ctx, localCfg, selectedModel);
  if (!runtimeResolved?.success || !runtimeResolved?.pythonBin) {
    return {
      success: false,
      error: `Local Transformers STT unavailable: ${runtimeResolved?.error || 'No Python runtime available for selected STT model.'}`
    };
  }
  const pythonBin = runtimeResolved.pythonBin;
  const scriptPath = common.path.join(__dirname, 'local_transformers_stt.py');
  let effectiveDevice = String(localCfg.device || 'cpu').toLowerCase();
  let cudaRepairError = '';
  let probe = await availability.checkLocalTransformersSttAvailability({ ...localCfg, device: effectiveDevice }, { appDir: ctx.appDir, pythonBin });
  if (!probe.available && effectiveDevice === 'cuda' && common.isCudaUnavailableErrorText(probe.error)) {
    const repaired = await runtime.ensureVoiceRuntimePackages(pythonBin, {
      requiresChatterbox: common.isChatterboxModel(selectedModel),
      requiresDia: common.isDiaModel(selectedModel),
      prefersCuda: true
    });
    common.clearProbeCacheForPython(pythonBin);
    if (repaired?.success) {
      probe = await availability.checkLocalTransformersSttAvailability({ ...localCfg, device: 'cuda' }, { appDir: ctx.appDir, pythonBin });
    } else {
      cudaRepairError = String(repaired?.error || 'unknown CUDA repair failure');
    }
  }
  if (!probe.available && effectiveDevice === 'cuda' && common.isCudaUnavailableErrorText(probe.error)) {
    effectiveDevice = 'cpu';
    probe = await availability.checkLocalTransformersSttAvailability({ ...localCfg, device: effectiveDevice }, { appDir: ctx.appDir, pythonBin });
  }
  if (!probe.available) {
    return {
      success: false,
      error: `Local Transformers STT unavailable: ${probe.error}${cudaRepairError ? ` | CUDA repair failed: ${cudaRepairError}` : ''}`
    };
  }

  const request = {
    audioBase64,
    mimeType: 'audio/wav',
    model: selectedModel,
    device: effectiveDevice,
    dtype: String(localCfg.dtype || 'auto'),
    language: String(payload?.language || voiceCfg?.language || 'en-US'),
    max_new_tokens: Number.isFinite(Number(localCfg.maxNewTokens)) ? Number(localCfg.maxNewTokens) : 256
  };
  const hfToken = String(
    ctx?.settingsManager?.getHuggingFaceToken?.(ctx.appDir)
    || settings?.huggingface_token
    || ''
  ).trim();
  if (hfToken) request.hf_token = hfToken;

  let parsed = null;
  try {
    const worker = workerApi.ensureLocalTransformersWorker(pythonBin, scriptPath);
    const requestedTimeoutMs = Number.isFinite(payload?.timeoutMs) ? Number(payload.timeoutMs) : 180000;
    parsed = await workerApi.requestLocalTransformersWorker(worker, request, { timeout: Math.max(requestedTimeoutMs, 120000) });
  } catch (err) {
    common.clearProbeCacheForPython(pythonBin);
    return { success: false, error: `Local Transformers STT worker failed: ${err.message || String(err)}` };
  }

  if (parsed?.success && String(parsed?.transcript || '').trim()) {
    return {
      success: true,
      transcript: String(parsed.transcript).trim(),
      provider: 'local-transformers',
      model: String(parsed.model || selectedModel)
    };
  }
  const errText = String(parsed?.error || 'Local Transformers STT returned no transcript.');
  if (/(missing python packages|torch\.cuda\.is_available|cuda requested)/i.test(errText)) {
    common.clearProbeCacheForPython(pythonBin);
  }
  return { success: false, error: errText };
}

async function testLocalTransformersStt(ctx, payload = {}) {
  const settings = ctx.settingsManager.getSettings(ctx.appDir);
  const voiceCfg = getVoiceToTextConfig(settings);
  const localCfg = voiceCfg.localTransformers || {};
  const catalogRef = voiceCfg?.catalogRefs?.stt || {};
  const catalogHit = resolveVoiceModelFromCatalog(ctx.appDir, catalogRef);
  const selectedModel = String(
    catalogHit?.model?.huggingface_repo ||
    catalogHit?.model?.id ||
    voiceCfg?.hf?.sttModel ||
    'openai/whisper-small'
  ).trim();
  const runtimeResolved = await resolvePythonBinForLocalStt(ctx, localCfg, selectedModel);
  if (!runtimeResolved?.success || !runtimeResolved?.pythonBin) {
    return {
      success: false,
      mode: 'local-transformers',
      message: `❌ Local STT runtime unavailable: ${runtimeResolved?.error || 'No Python runtime.'}`
    };
  }
  const pythonBin = runtimeResolved.pythonBin;
  let effectiveDevice = String(localCfg.device || 'cpu').toLowerCase();
  let cudaRepairError = '';
  let probe = await availability.checkLocalTransformersSttAvailability({ ...localCfg, device: effectiveDevice }, { appDir: ctx.appDir, pythonBin });
  if (!probe.available && effectiveDevice === 'cuda' && common.isCudaUnavailableErrorText(probe.error)) {
    const repaired = await runtime.ensureVoiceRuntimePackages(pythonBin, {
      requiresChatterbox: common.isChatterboxModel(selectedModel),
      requiresDia: common.isDiaModel(selectedModel),
      prefersCuda: true
    });
    common.clearProbeCacheForPython(pythonBin);
    if (repaired?.success) {
      probe = await availability.checkLocalTransformersSttAvailability({ ...localCfg, device: 'cuda' }, { appDir: ctx.appDir, pythonBin });
    } else {
      cudaRepairError = String(repaired?.error || 'unknown CUDA repair failure');
    }
  }
  if (!probe.available && effectiveDevice === 'cuda' && common.isCudaUnavailableErrorText(probe.error)) {
    effectiveDevice = 'cpu';
    probe = await availability.checkLocalTransformersSttAvailability({ ...localCfg, device: 'cpu' }, { appDir: ctx.appDir, pythonBin });
  }
  if (!probe.available) {
    return {
      success: false,
      mode: 'local-transformers',
      pythonBin,
      model: selectedModel,
      message: `❌ ${probe.error}`
    };
  }
  return {
    success: true,
    mode: 'local-transformers',
    pythonBin,
    model: selectedModel,
    device: effectiveDevice,
    message: effectiveDevice === 'cpu' && String(localCfg.device || '').toLowerCase() === 'cuda'
      ? `✅ Local STT runtime ready on cpu fallback (${selectedModel})${cudaRepairError ? `; CUDA repair failed: ${cudaRepairError}` : ''}.`
      : `✅ Local STT runtime ready (${selectedModel}).`
  };
}

async function prewarmLocalTransformersStt(ctx, payload = {}) {
  const settings = ctx.settingsManager.getSettings(ctx.appDir);
  const voiceCfg = getVoiceToTextConfig(settings);
  const localCfg = voiceCfg.localTransformers || {};
  const catalogRef = voiceCfg?.catalogRefs?.stt || {};
  const catalogHit = resolveVoiceModelFromCatalog(ctx.appDir, catalogRef);
  const selectedModel = String(
    catalogHit?.model?.huggingface_repo ||
    catalogHit?.model?.id ||
    voiceCfg?.hf?.sttModel ||
    'openai/whisper-small'
  ).trim();
  const runtimeResolved = await resolvePythonBinForLocalStt(ctx, localCfg, selectedModel);
  if (!runtimeResolved?.success || !runtimeResolved?.pythonBin) {
    return {
      success: false,
      error: `Local Transformers STT unavailable: ${runtimeResolved?.error || 'No Python runtime available for selected STT model.'}`
    };
  }
  const pythonBin = runtimeResolved.pythonBin;
  const scriptPath = common.path.join(__dirname, 'local_transformers_stt.py');
  let effectiveDevice = String(localCfg.device || 'cpu').toLowerCase();
  let probe = await availability.checkLocalTransformersSttAvailability({ ...localCfg, device: effectiveDevice }, { appDir: ctx.appDir, pythonBin });
  if (!probe.available && effectiveDevice === 'cuda' && common.isCudaUnavailableErrorText(probe.error)) {
    effectiveDevice = 'cpu';
    probe = await availability.checkLocalTransformersSttAvailability({ ...localCfg, device: effectiveDevice }, { appDir: ctx.appDir, pythonBin });
  }
  if (!probe.available) {
    return {
      success: false,
      error: `Local Transformers STT unavailable: ${probe.error}`
    };
  }

  const request = {
    prewarm: true,
    model: selectedModel,
    device: effectiveDevice,
    dtype: String(localCfg.dtype || 'auto')
  };
  const hfToken = String(
    ctx?.settingsManager?.getHuggingFaceToken?.(ctx.appDir)
    || settings?.huggingface_token
    || ''
  ).trim();
  if (hfToken) request.hf_token = hfToken;

  try {
    const worker = workerApi.ensureLocalTransformersWorker(pythonBin, scriptPath);
    const requestedTimeoutMs = Number.isFinite(payload?.timeoutMs) ? Number(payload.timeoutMs) : 180000;
    const parsed = await workerApi.requestLocalTransformersWorker(worker, request, { timeout: Math.max(requestedTimeoutMs, 120000) });
    if (parsed?.success) {
      return {
        success: true,
        provider: 'local-transformers',
        warmed: true,
        model: String(selectedModel),
        device: String(effectiveDevice)
      };
    }
    return { success: false, error: String(parsed?.error || 'Local Transformers STT warmup failed.') };
  } catch (err) {
    common.clearProbeCacheForPython(pythonBin);
    return { success: false, error: `Local Transformers STT warmup failed: ${err.message || String(err)}` };
  }
}

module.exports = {
  resolvePythonBinForLocalStt,
  transcribeWithLocalTransformers,
  testLocalTransformersStt,
  prewarmLocalTransformersStt
};
