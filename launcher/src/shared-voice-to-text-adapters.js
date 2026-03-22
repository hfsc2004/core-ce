/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
(function initPsfVoiceToTextAdapters(global) {
  'use strict';

  function toBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
    for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function createWebSpeechAdapter(ctx) {
    const SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    let recognition = null;
    let liveText = '';

    function ensureRecognition() {
      if (recognition) return recognition;
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = String(result?.[0]?.transcript || '').trim();
          if (!text) continue;
          if (result.isFinal) finalText += `${text} `;
          else interim += `${text} `;
        }
        liveText = finalText.trim() || interim.trim();
      };
      recognition.onerror = (event) => {
        ctx.onError(`Voice error: ${event?.error || 'speech recognition failed'}`);
      };
      recognition.onend = () => {
        const text = String(liveText || '').trim();
        liveText = '';
        ctx.onStateChange(false);
        if (text) ctx.onTranscript(text);
      };
      return recognition;
    }

    return {
      start: async (cfg) => {
        const rec = ensureRecognition();
        rec.lang = String(cfg?.language || 'en-US');
        liveText = '';
        rec.start();
      },
      stop: async () => {
        if (recognition) recognition.stop();
      }
    };
  }

  function createHuggingFaceAdapter(ctx) {
    let mediaStream = null;
    let audioContext = null;
    let sourceNode = null;
    let processorNode = null;
    let silentGainNode = null;
    let pcmChunks = [];
    let inputSampleRate = 16000;
    let hardStopTimer = null;
    const MAX_RECORD_MS = 15000;
    const SILENCE_STOP_MS = 900;
    const MIN_RECORD_MS = 450;
    const VOICE_RMS_THRESHOLD = 0.015;
    let startedAt = 0;
    let lastVoiceAt = 0;
    let hasSpeech = false;
    let stopRequested = false;
    let stopPromise = null;

    function encodeWavFromFloat32(samples, sampleRate) {
      const length = samples.length;
      const bytesPerSample = 2;
      const blockAlign = bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = length * bytesPerSample;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);
      let offset = 0;
      const writeStr = (v) => {
        for (let i = 0; i < v.length; i += 1) view.setUint8(offset + i, v.charCodeAt(i));
        offset += v.length;
      };
      writeStr('RIFF');
      view.setUint32(offset, 36 + dataSize, true); offset += 4;
      writeStr('WAVE');
      writeStr('fmt ');
      view.setUint32(offset, 16, true); offset += 4;
      view.setUint16(offset, 1, true); offset += 2;
      view.setUint16(offset, 1, true); offset += 2;
      view.setUint32(offset, sampleRate, true); offset += 4;
      view.setUint32(offset, byteRate, true); offset += 4;
      view.setUint16(offset, blockAlign, true); offset += 2;
      view.setUint16(offset, 16, true); offset += 2;
      writeStr('data');
      view.setUint32(offset, dataSize, true); offset += 4;
      for (let i = 0; i < length; i += 1) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
      return buffer;
    }

    function mergeFloat32Chunks(chunks) {
      const safe = Array.isArray(chunks) ? chunks : [];
      let total = 0;
      for (const c of safe) total += (c?.length || 0);
      const merged = new Float32Array(total);
      let offset = 0;
      for (const c of safe) {
        if (!c || !c.length) continue;
        merged.set(c, offset);
        offset += c.length;
      }
      return merged;
    }

    function downsampleFloat32(samples, inputRate, outputRate) {
      const inRate = Number(inputRate || 0);
      const outRate = Number(outputRate || 0);
      if (!samples || !samples.length) return new Float32Array(0);
      if (!Number.isFinite(inRate) || !Number.isFinite(outRate) || inRate <= 0 || outRate <= 0 || outRate >= inRate) {
        return samples;
      }
      const ratio = inRate / outRate;
      const outLength = Math.max(1, Math.floor(samples.length / ratio));
      const result = new Float32Array(outLength);
      let offsetBuffer = 0;
      for (let i = 0; i < outLength; i += 1) {
        const nextOffsetBuffer = Math.min(samples.length, Math.floor((i + 1) * ratio));
        let accum = 0;
        let count = 0;
        for (let j = offsetBuffer; j < nextOffsetBuffer; j += 1) {
          accum += samples[j];
          count += 1;
        }
        result[i] = count > 0 ? (accum / count) : 0;
        offsetBuffer = nextOffsetBuffer;
      }
      return result;
    }

    function clearTimer() {
      if (!hardStopTimer) return;
      clearTimeout(hardStopTimer);
      hardStopTimer = null;
    }

    async function stopMedia() {
      try { if (processorNode) processorNode.disconnect(); } catch (_) {}
      try { if (sourceNode) sourceNode.disconnect(); } catch (_) {}
      try { if (silentGainNode) silentGainNode.disconnect(); } catch (_) {}
      try { if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      if (audioContext) {
        try { await audioContext.close(); } catch (_) {}
      }
      mediaStream = null;
      audioContext = null;
      sourceNode = null;
      processorNode = null;
      silentGainNode = null;
      pcmChunks = [];
      clearTimer();
    }

    async function stopAndFlush(cfg) {
      try {
        const merged = mergeFloat32Chunks(pcmChunks);
        pcmChunks = [];
        if (!merged.length) return;
        let samples = merged;
        let sampleRate = Number(inputSampleRate || 16000);
        if (sampleRate > 16000) {
          samples = downsampleFloat32(merged, sampleRate, 16000);
          sampleRate = 16000;
        }
        const wavBuffer = encodeWavFromFloat32(samples, sampleRate);
        const audioBase64 = toBase64(wavBuffer);
        const api = ctx.getElectronAPI();
        if (!api || typeof api.voiceToTextTranscribeHf !== 'function') {
          ctx.onError('STT transcription API is unavailable.');
          return;
        }
        const result = await api.voiceToTextTranscribeHf({
          audioBase64,
          mimeType: 'audio/wav',
          language: String(cfg?.language || 'en-US'),
          surface: String(ctx.surface || 'unknown')
        });
        if (result?.success && result?.transcript) ctx.onTranscript(String(result.transcript));
        else ctx.onError(result?.error || 'STT transcription failed.');
      } catch (err) {
        ctx.onError(err?.message || String(err));
      } finally {
        ctx.onStateChange(false);
      }
    }

    function requestStop(cfg) {
      if (stopPromise) return stopPromise;
      if (stopRequested) return Promise.resolve();
      stopRequested = true;
      clearTimer();
      stopPromise = stopAndFlush(cfg).finally(async () => {
        await stopMedia();
        stopRequested = false;
        stopPromise = null;
      });
      return stopPromise;
    }

    return {
      start: async (cfg) => {
        const selectedDeviceId = String(cfg?.hardware?.inputDeviceId || '').trim();
        const requestedConstraints = selectedDeviceId
          ? { audio: { deviceId: { exact: selectedDeviceId } } }
          : { audio: true };
        let stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia(requestedConstraints);
        } catch (err) {
          if (!selectedDeviceId) throw err;
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        mediaStream = stream;
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) throw new Error('AudioContext is unavailable in this environment.');
        audioContext = new Ctx();
        inputSampleRate = Number(audioContext.sampleRate || 16000);
        sourceNode = audioContext.createMediaStreamSource(stream);
        processorNode = audioContext.createScriptProcessor(4096, 1, 1);
        silentGainNode = audioContext.createGain();
        silentGainNode.gain.value = 0;
        pcmChunks = [];
        startedAt = Date.now();
        lastVoiceAt = startedAt;
        hasSpeech = false;
        stopRequested = false;
        stopPromise = null;

        processorNode.onaudioprocess = (event) => {
          const channel = event?.inputBuffer?.getChannelData?.(0);
          if (!channel || !channel.length) return;
          const frame = new Float32Array(channel);
          pcmChunks.push(frame);
          let sumSq = 0;
          for (let i = 0; i < frame.length; i += 1) sumSq += frame[i] * frame[i];
          const rms = Math.sqrt(sumSq / Math.max(1, frame.length));
          const now = Date.now();
          if (rms >= VOICE_RMS_THRESHOLD) {
            hasSpeech = true;
            lastVoiceAt = now;
            return;
          }
          if (!stopRequested && hasSpeech && (now - startedAt) >= MIN_RECORD_MS && (now - lastVoiceAt) >= SILENCE_STOP_MS) {
            requestStop(cfg);
          }
        };

        sourceNode.connect(processorNode);
        processorNode.connect(silentGainNode);
        silentGainNode.connect(audioContext.destination);
        clearTimer();
        hardStopTimer = setTimeout(() => requestStop(cfg), MAX_RECORD_MS);
      },
      stop: async (cfg) => {
        await requestStop(cfg);
      }
    };
  }

  global.PsfVoiceToTextAdapters = {
    toBase64,
    createWebSpeechAdapter,
    createHuggingFaceAdapter
  };
})(window);
