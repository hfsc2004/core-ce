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

function extractAudioBase64FromJson(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = extractAudioBase64FromJson(item);
      if (value) return value;
    }
    return '';
  }
  if (typeof payload === 'object') {
    const direct = String(payload.audio || payload.audio_base64 || payload.base64 || '').trim();
    if (direct) return direct;
  }
  return '';
}

async function synthesizeWithHuggingFace(ctx, payload = {}) {
  const settings = ctx.settingsManager.getSettings(ctx.appDir);
  const vtt = getVoiceToTextConfig(settings);
  const catalogHit = resolveVoiceModelFromCatalog(ctx.appDir, vtt?.catalogRefs?.tts || {});
  const ttsModel = String(
    catalogHit?.model?.huggingface_repo ||
    catalogHit?.model?.id ||
    vtt?.hf?.ttsModel ||
    'microsoft/speecht5_tts'
  ).trim();
  const endpoint = String(vtt?.hf?.ttsEndpoint || '').trim();
  const token = String(settings?.huggingface_token || '').trim();
  const text = String(payload.text || '').trim();

  if (!endpoint) {
    return { success: false, error: 'Local TTS endpoint is required in voice_to_text.hf.ttsEndpoint.' };
  }
  if (!isLocalEndpoint(endpoint)) {
    return { success: false, error: `TTS endpoint must be local (localhost/127.0.0.1/::1). Got: ${endpoint}` };
  }
  if (!text) {
    return { success: false, error: 'TTS text is empty.' };
  }

  const headers = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const requestBody = {
    inputs: text
  };
  if (vtt?.hf?.ttsVoice) {
    requestBody.parameters = {
      ...(requestBody.parameters || {}),
      speaker: String(vtt.hf.ttsVoice)
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok) {
      const errBody = await response.text();
      return {
        success: false,
        error: `HF TTS request failed (${response.status}): ${errBody || response.statusText}`
      };
    }

    if (contentType.includes('application/json')) {
      const json = await response.json();
      const audioBase64 = extractAudioBase64FromJson(json);
      if (!audioBase64) {
        return { success: false, error: 'HF TTS JSON response did not include audio bytes.' };
      }
      return {
      success: true,
      provider: 'huggingface',
      mimeType: 'audio/wav',
      audioBase64,
      model: ttsModel
    };
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
    return {
      success: true,
      provider: 'huggingface',
      mimeType: contentType || 'audio/wav',
      audioBase64,
      model: ttsModel
    };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

module.exports = {
  synthesizeWithHuggingFace
};
