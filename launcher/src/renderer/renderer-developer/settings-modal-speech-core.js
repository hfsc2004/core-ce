/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Settings Modal - Speech tab controls
 * Global STT/TTS settings shared across all terminals.
 */

let speechCatalogCache = {
  loaded: false,
  byRef: new Map(),
  sttOptions: [],
  ttsOptions: []
};
let speechVoiceGateState = {
  available: false,
  reason: 'Voice pack not detected.'
};
const SPEECH_SURFACE_IDS = {
  terminal: 'psf-terminal',
  coding: 'psf-coding-terminal',
  relay: 'psf-relay-pipeline-chat'
};

function getSpeechSurfaceOverride(cfg, surfaceId, defaults = {}) {
  const map = (cfg?.surfaceOverrides && typeof cfg.surfaceOverrides === 'object')
    ? cfg.surfaceOverrides
    : {};
  const hit = map[String(surfaceId || '').trim().toLowerCase()];
  if (!hit || typeof hit !== 'object') {
    return {
      sttEnabled: defaults.sttEnabled === true,
      ttsEnabled: defaults.ttsEnabled === true
    };
  }
  return {
    sttEnabled: (typeof hit.sttEnabled === 'boolean') ? hit.sttEnabled : defaults.sttEnabled === true,
    ttsEnabled: (typeof hit.ttsEnabled === 'boolean') ? hit.ttsEnabled : defaults.ttsEnabled === true
  };
}

function setSpeechControlsEnabled(enabled) {
  const root = document.getElementById('settings-tab-speech');
  if (!root) return;
  root.querySelectorAll('input, select, button').forEach((el) => {
    el.disabled = !enabled;
  });
}

async function detectSpeechVoiceAvailability() {
  if (!window.electronAPI) {
    return { available: false, reason: 'Electron API unavailable.' };
  }

  if (window.electronAPI.voiceToTextGetCapabilities) {
    try {
      const caps = await window.electronAPI.voiceToTextGetCapabilities();
      const available = caps?.modGate?.available === true;
      if (available) return { available: true, reason: '' };
      return {
        available: false,
        reason: String(
          caps?.configured?.localTransformers?.error
          || 'Voice pack is not installed/enabled.'
        )
      };
    } catch (_err) {
      // Fall through to mod API checks.
    }
  }

  if (window.electronAPI.modsHasCapability) {
    try {
      const checks = await Promise.all([
        window.electronAPI.modsHasCapability({ capability: 'voice.capture' }),
        window.electronAPI.modsHasCapability({ capability: 'voice.stt' }),
        window.electronAPI.modsHasCapability({ capability: 'voice.tts' })
      ]);
      const available = checks.every((entry) => entry?.ok === true && entry?.available === true);
      return {
        available,
        reason: available ? '' : 'Voice pack capabilities are not fully enabled.'
      };
    } catch (_err) {
      return { available: false, reason: 'Failed to verify voice pack capabilities.' };
    }
  }

  return { available: false, reason: 'Voice capability check unavailable.' };
}

function ensureSpeechVoiceAvailable(statusEl) {
  if (speechVoiceGateState.available === true) return true;
  if (statusEl) {
    statusEl.textContent = speechVoiceGateState.reason || 'Voice pack is not installed/enabled.';
    statusEl.style.color = '#ff6b6b';
  }
  return false;
}

function formatCatalogRef(ref) {
  const collectionId = String(ref?.collectionId || '').trim();
  const modelId = String(ref?.modelId || '').trim();
  if (!collectionId || !modelId) return '';
  return `${collectionId}/${modelId}`;
}

function parseCatalogRef(raw) {
  const value = String(raw || '').trim();
  if (!value) return { collectionId: '', modelId: '' };
  const slashIdx = value.indexOf('/');
  if (slashIdx <= 0 || slashIdx >= value.length - 1) {
    return null;
  }
  return {
    collectionId: value.slice(0, slashIdx).trim(),
    modelId: value.slice(slashIdx + 1).trim()
  };
}

function getVoiceModelIdentity(model) {
  const hfRepo = String(model?.huggingface_repo || '').trim();
  if (hfRepo) return hfRepo;
  return String(model?.id || '').trim();
}

function buildVoiceModelLabel(collectionName, model) {
  const modelName = String(model?.name || model?.id || 'Unnamed model').trim();
  const org = String(model?.organization || '').trim();
  const coll = String(collectionName || '').trim();
  if (org && coll) return `${modelName} - ${org} [${coll}]`;
  if (coll) return `${modelName} [${coll}]`;
  return modelName;
}

function setSelectOptions(selectId, options, selectedValue, emptyLabel) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const safeOptions = Array.isArray(options) ? options : [];
  const escapedEmpty = String(emptyLabel || 'None')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  let html = `<option value="">${escapedEmpty}</option>`;
  for (const opt of safeOptions) {
    const value = String(opt?.value || '').trim();
    const label = String(opt?.label || value || 'Unknown')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const escapedValue = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    html += `<option value="${escapedValue}">${label}</option>`;
  }

  const selected = String(selectedValue || '').trim();
  if (selected && !safeOptions.some((opt) => String(opt?.value || '').trim() === selected)) {
    const escapedSelected = selected
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    html += `<option value="${escapedSelected}">${escapedSelected} (saved)</option>`;
  }

  select.innerHTML = html;
  select.value = selected || '';
}

function findRefByModelIdentity(options, modelIdentity) {
  const target = String(modelIdentity || '').trim().toLowerCase();
  if (!target) return '';
  const hit = (Array.isArray(options) ? options : []).find((opt) => {
    const id1 = String(opt?.modelIdentity || '').trim().toLowerCase();
    const id2 = String(opt?.modelId || '').trim().toLowerCase();
    return id1 === target || id2 === target;
  });
  return hit ? String(hit.value || '').trim() : '';
}

function normalizeUiTtsProvider(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'huggingface') return 'huggingface';
  if (raw === 'local-transformers') return 'local-transformers';
  return 'local-transformers';
}

function normalizePythonBinInput(value) {
  const raw = String(value || '').trim();
  const lowered = raw.toLowerCase();
  if (lowered === 'python' || lowered === 'python3' || lowered === 'py') return '';
  return raw;
}

function refreshSpeechProviderVisibility() {
  const provider = normalizeUiTtsProvider(document.getElementById('settings-voice-tts-provider')?.value || 'local-transformers');
  const hfRow = document.getElementById('settings-voice-tts-model')?.closest('div');
  const hfEndpointRow = document.getElementById('settings-voice-tts-endpoint')?.closest('div');
  const localModelRow = document.getElementById('settings-voice-local-model')?.closest('div');
  const localDeviceRow = document.getElementById('settings-voice-local-device')?.closest('div');
  const localDtypeRow = document.getElementById('settings-voice-local-dtype')?.closest('div');
  const localPythonRow = document.getElementById('settings-voice-local-python')?.closest('div');
  const localSpeakingRateRow = document.getElementById('settings-voice-local-speaking-rate')?.closest('div');
  const localNoiseScaleRow = document.getElementById('settings-voice-local-noise-scale')?.closest('div');
  const localNoiseDurationRow = document.getElementById('settings-voice-local-noise-duration')?.closest('div');
  const localChatterboxCfgRow = document.getElementById('settings-voice-local-chatterbox-cfg')?.closest('div');
  const localChatterboxExaggerationRow = document.getElementById('settings-voice-local-chatterbox-exaggeration')?.closest('div');

  const showHf = provider === 'huggingface';
  if (hfRow) hfRow.style.display = showHf ? '' : 'none';
  if (hfEndpointRow) hfEndpointRow.style.display = showHf ? '' : 'none';

  const showLocalTransformers = provider !== 'huggingface';
  if (localModelRow) localModelRow.style.display = showLocalTransformers ? '' : 'none';
  if (localDeviceRow) localDeviceRow.style.display = showLocalTransformers ? '' : 'none';
  if (localDtypeRow) localDtypeRow.style.display = showLocalTransformers ? '' : 'none';
  if (localPythonRow) localPythonRow.style.display = showLocalTransformers ? '' : 'none';
  if (localSpeakingRateRow) localSpeakingRateRow.style.display = showLocalTransformers ? '' : 'none';
  if (localNoiseScaleRow) localNoiseScaleRow.style.display = showLocalTransformers ? '' : 'none';
  if (localNoiseDurationRow) localNoiseDurationRow.style.display = showLocalTransformers ? '' : 'none';
  if (localChatterboxCfgRow) localChatterboxCfgRow.style.display = showLocalTransformers ? '' : 'none';
  if (localChatterboxExaggerationRow) localChatterboxExaggerationRow.style.display = showLocalTransformers ? '' : 'none';
}

async function loadSpeechCatalogCache() {
  const cache = {
    loaded: true,
    byRef: new Map(),
    sttOptions: [],
    ttsOptions: []
  };

  if (!window.electronAPI?.getMasterCatalog) {
    speechCatalogCache = cache;
    return speechCatalogCache;
  }

  try {
    const catalog = await window.electronAPI.getMasterCatalog();
    const collections = catalog?.collections && typeof catalog.collections === 'object'
      ? Object.entries(catalog.collections)
      : [];

    for (const [collectionId, collection] of collections) {
      const collectionName = String(collection?.name || collectionId || 'Collection').trim();
      const models = Array.isArray(collection?.models) ? collection.models : [];

      for (const model of models) {
        const modelId = String(model?.id || '').trim();
        if (!modelId) continue;

        const refValue = `${collectionId}/${modelId}`;
        const modelIdentity = getVoiceModelIdentity(model);
        const option = {
          value: refValue,
          label: buildVoiceModelLabel(collectionName, model),
          collectionId,
          modelId,
          modelIdentity,
          filename: String(model?.filename || '').trim(),
          architecture: String(model?.architecture || '').trim().toLowerCase(),
          supports_stt: model?.supports_stt === true,
          supports_tts: model?.supports_tts === true
        };

        cache.byRef.set(refValue, option);
        if (option.supports_stt) cache.sttOptions.push(option);
        if (option.supports_tts) cache.ttsOptions.push(option);
      }
    }

    const byLabel = (a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' });
    cache.sttOptions.sort(byLabel);
    cache.ttsOptions.sort(byLabel);
  } catch (err) {
    console.warn('[Settings Speech] Failed to load catalog:', err?.message || err);
  }

  speechCatalogCache = cache;
  return speechCatalogCache;
}
