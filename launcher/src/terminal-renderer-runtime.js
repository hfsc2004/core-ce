/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createRuntimeController(deps) {
    const getCurrentModel = typeof deps?.getCurrentModel === 'function' ? deps.getCurrentModel : () => '';
    const getTerminalPort = typeof deps?.getTerminalPort === 'function' ? deps.getTerminalPort : () => 0;
    const getProvider = typeof deps?.getProvider === 'function' ? deps.getProvider : () => 'ollama';
    const getProviderBaseUrl = typeof deps?.getProviderBaseUrl === 'function' ? deps.getProviderBaseUrl : () => '';
    const getProviderApiKey = typeof deps?.getProviderApiKey === 'function' ? deps.getProviderApiKey : () => '';
    const getProviderModelId = typeof deps?.getProviderModelId === 'function' ? deps.getProviderModelId : () => '';
    const getLlamaCppModelPath = typeof deps?.getLlamaCppModelPath === 'function' ? deps.getLlamaCppModelPath : () => '';
    const getConfig = typeof deps?.getConfig === 'function' ? deps.getConfig : () => ({});
    const getTemperature = typeof deps?.getTemperature === 'function' ? deps.getTemperature : () => 0.7;
    const getTopP = typeof deps?.getTopP === 'function' ? deps.getTopP : () => null;
    const getTopK = typeof deps?.getTopK === 'function' ? deps.getTopK : () => null;
    const getNumCtx = typeof deps?.getNumCtx === 'function' ? deps.getNumCtx : () => null;
    const getNumGpu = typeof deps?.getNumGpu === 'function' ? deps.getNumGpu : () => null;
    const getNumPredict = typeof deps?.getNumPredict === 'function' ? deps.getNumPredict : () => null;
    const getRepeatPenalty = typeof deps?.getRepeatPenalty === 'function' ? deps.getRepeatPenalty : () => null;
    const getSeed = typeof deps?.getSeed === 'function' ? deps.getSeed : () => null;
    const getStopSequences = typeof deps?.getStopSequences === 'function' ? deps.getStopSequences : () => null;
    const setGpuIndicator = typeof deps?.setGpuIndicator === 'function' ? deps.setGpuIndicator : (() => {});

    function sanitizeQwenSelfDialogue(content) {
      let text = String(content || '');
      if (!text) return text;
      const model = String(getCurrentModel() || '').toLowerCase();
      if (!model.includes('qwen')) return text;

      const roleMarker = /\n\s*USER\s*:|\n\s*ASSISTANT\s*:/i;
      const roleMatch = text.match(roleMarker);
      if (roleMatch && Number.isInteger(roleMatch.index) && roleMatch.index > 0) {
        return text.slice(0, roleMatch.index).trim();
      }

      const hardCutPhrases = [
        'How can I assist you today?',
        'What can you do?',
        'What do you do?',
        'What is your model\'s size?',
        'What languages do you support?',
        'How can I use you?',
        'What are your limitations?',
        'Okay, I need to ',
        'Let me think'
      ];
      let cutAt = -1;
      for (const phrase of hardCutPhrases) {
        const idx = text.indexOf(phrase);
        if (idx <= 0) continue;
        if (idx < 40) continue;
        if (cutAt === -1 || idx < cutAt) cutAt = idx;
      }
      if (cutAt > 0) {
        const before = text.slice(0, cutAt);
        const assistIdx = before.indexOf('How can I assist you today?');
        if (assistIdx >= 0) {
          return before.slice(0, assistIdx + 'How can I assist you today?'.length).trim();
        }
        return before.trim();
      }

      return text;
    }

    function shouldInjectAttachmentContext(message) {
      const text = String(message || '').trim();
      if (!text) return false;
      const lower = text.toLowerCase();

      const greetingOnly = /^(hi|hello|hey|yo|sup|hola|howdy|good (morning|afternoon|evening)|thanks|thank you|ok|okay)[!. ]*$/i.test(text);
      if (greetingOnly) return false;
      if (lower.length <= 24 && /^(hi|hello|hey|thanks|thank you|ok|okay)/.test(lower)) return false;

      if (/(file|files|doc|docs|document|attachment|attached|pdf|markdown|md|read|summari[sz]e|analy[sz]e|review|inspect|based on|from the file|from attachments?)/i.test(lower)) {
        return true;
      }
      return true;
    }

    function buildOllamaOptions() {
      const options = {
        port: getTerminalPort(),
        temperature: getTemperature(),
        keep_alive: '30m'
      };
      if (getTopP() !== null) options.top_p = getTopP();
      if (getTopK() !== null) options.top_k = getTopK();
      if (getNumCtx() !== null) options.num_ctx = getNumCtx();
      if (getNumGpu() !== null) options.num_gpu = getNumGpu();
      if (getNumPredict() !== null) options.num_predict = getNumPredict();
      if (getRepeatPenalty() !== null) options.repeat_penalty = getRepeatPenalty();
      if (getSeed() !== null) options.seed = getSeed();
      if (getStopSequences() !== null) options.stop = getStopSequences();
      return options;
    }

    function normalizeProvider(value) {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return 'ollama';
      if (raw === 'llamacpp') return 'llama.cpp';
      return raw;
    }

    function defaultBaseUrlForProvider(providerKey) {
      if (providerKey === 'llama.cpp') return 'http://127.0.0.1:8080';
      if (providerKey === 'vllm') return 'http://127.0.0.1:8000';
      if (providerKey === 'openai-compatible') return 'http://127.0.0.1:8000';
      return '';
    }

    function buildProviderConfig() {
      const provider = normalizeProvider(getProvider());
      const baseUrl = String(getProviderBaseUrl() || '').trim() || defaultBaseUrlForProvider(provider);
      const apiKey = String(getProviderApiKey() || '');
      const providerModel = String(getProviderModelId() || '').trim();
      const llamaCppModelPath = String(getLlamaCppModelPath() || '').trim();
      return { provider, baseUrl, apiKey, providerModel, llamaCppModelPath };
    }

    async function verifyGPUUsage() {
      try {
        const response = await fetch(`http://localhost:${getTerminalPort()}/api/ps`);
        if (!response.ok) {
          console.warn('[Terminal] Could not check GPU status');
          return;
        }

        const data = await response.json();
        const cfg = getConfig() || {};
        if (data && data.models && data.models.length > 0) {
          const model = data.models[0];
          if (model.size_vram === 0 && (cfg.gpuType === 'nvidia' || cfg.gpuType === 'amd')) {
            console.warn('⚠️ Ollama is using CPU! size_vram = 0');
            setGpuIndicator('⚠️', 'CPU Fallback');
          } else if (model.size_vram > 0) {
            // reset handled by normal gpu indicator update outside
          }
        }
      } catch (err) {
        console.warn('[Terminal] GPU verification error:', err);
      }
    }

    return {
      sanitizeQwenSelfDialogue,
      shouldInjectAttachmentContext,
      buildOllamaOptions,
      buildProviderConfig,
      verifyGPUUsage
    };
  }

  window.TerminalRuntime = {
    createRuntimeController
  };
})();
