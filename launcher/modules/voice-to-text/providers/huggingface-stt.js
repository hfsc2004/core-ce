/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { getVoiceToTextConfig } = require('../voice-to-text-common');
const { resolveVoiceModelFromCatalog } = require('../voice-to-text-catalog');

function isLocalEndpoint(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    const host = String(parsed.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch (_err) {
    return false;
  }
}

function decodeBase64Audio(base64) {
  const raw = String(base64 || '').trim();
  if (!raw) return null;
  return Buffer.from(raw, 'base64');
}

function coerceTranscript(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const candidate = coerceTranscript(item);
      if (candidate) return candidate;
    }
    return '';
  }
  if (typeof payload === 'object') {
    const text = String(payload.text || payload.generated_text || '').trim();
    if (text) return text;
  }
  return '';
}

async function transcribeWithHuggingFace(ctx, payload = {}) {
  const settings = ctx.settingsManager.getSettings(ctx.appDir);
  const vtt = getVoiceToTextConfig(settings);
  const catalogHit = resolveVoiceModelFromCatalog(ctx.appDir, vtt?.catalogRefs?.stt || {});
  const sttModel = String(
    catalogHit?.model?.huggingface_repo ||
    catalogHit?.model?.id ||
    vtt?.hf?.sttModel ||
    'openai/whisper-small'
  ).trim();
  const endpoint = String(vtt?.hf?.sttEndpoint || '').trim();
  const token = String(settings?.huggingface_token || '').trim();

  if (!endpoint) {
    return { success: false, error: 'Local STT endpoint is required in voice_to_text.hf.sttEndpoint.' };
  }
  if (!isLocalEndpoint(endpoint)) {
    return { success: false, error: `STT endpoint must be local (localhost/127.0.0.1/::1). Got: ${endpoint}` };
  }

  const audioBuffer = decodeBase64Audio(payload.audioBase64);
  if (!audioBuffer || audioBuffer.length === 0) {
    return { success: false, error: 'Audio payload is empty.' };
  }

  const mimeType = String(payload.mimeType || 'audio/webm').trim();
  const language = String(payload?.language || vtt?.language || 'en-US').trim();
  const headers = {
    'Content-Type': mimeType,
    'X-PSF-STT-Model': sttModel
  };
  if (language) headers['X-PSF-STT-Language'] = language;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let endpointUrl = endpoint;
  try {
    const parsed = new URL(endpoint);
    if (sttModel) parsed.searchParams.set('model', sttModel);
    if (language) parsed.searchParams.set('language', language);
    endpointUrl = parsed.toString();
  } catch (_err) {
    endpointUrl = endpoint;
  }

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: audioBuffer
    });

    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (_) {
      parsed = raw;
    }

    if (!response.ok) {
      const errText = coerceTranscript(parsed) || String(raw || response.statusText || 'HF request failed');
      return {
        success: false,
        error: `HF STT request failed (${response.status}): ${errText}`
      };
    }

    const transcript = coerceTranscript(parsed);
    if (!transcript) {
      return { success: false, error: 'HF STT returned no transcript text.' };
    }
    return {
      success: true,
      transcript,
      provider: 'huggingface',
      model: sttModel
    };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

async function checkHuggingFaceSttHealth(ctx) {
  const settings = ctx.settingsManager.getSettings(ctx.appDir);
  const vtt = getVoiceToTextConfig(settings);
  const endpoint = String(vtt?.hf?.sttEndpoint || '').trim();
  if (!endpoint) {
    return { success: false, message: '❌ Local STT endpoint is not configured.' };
  }
  if (!isLocalEndpoint(endpoint)) {
    return { success: false, message: `❌ STT endpoint must be local (localhost/127.0.0.1/::1). Got: ${endpoint}` };
  }
  const timeoutMs = 4000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'OPTIONS',
      signal: controller.signal
    });
    return {
      success: true,
      status: Number(response.status || 0),
      message: `✅ STT endpoint reachable (${response.status}).`
    };
  } catch (err) {
    return {
      success: false,
      message: `❌ STT endpoint health check failed: ${err?.message || String(err)}`
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  transcribeWithHuggingFace,
  checkHuggingFaceSttHealth
};
