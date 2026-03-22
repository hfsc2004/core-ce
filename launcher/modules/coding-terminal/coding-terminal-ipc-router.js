/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - IPC Router/Dispatch Helpers
 */

'use strict';

function createRouterTools(deps = {}) {
  const streamTools = deps.streamTools;
  const withTimeout = deps.withTimeout;
  const getCodingInferenceBackend = deps.getCodingInferenceBackend;
  const ensureRouterLlamaReady = deps.ensureRouterLlamaReady;
  const ensureRouterOllamaReady = deps.ensureRouterOllamaReady;
  const listInferenceModels = deps.listInferenceModels;
  const sendInferenceMessage = deps.sendInferenceMessage;
  const resolveConfiguredModel = deps.resolveConfiguredModel;
  const getRouterLlamaPort = deps.getRouterLlamaPort;
  const getRouterOllamaPort = deps.getRouterOllamaPort;
  const getDefaultRouterModel = deps.getDefaultRouterModel;
  const getKeepAlive = deps.getKeepAlive;
  const getConfig = typeof deps.getConfig === 'function' ? deps.getConfig : () => ({});

  function normalizeRouterModeConfig(cfg = {}) {
    const mode = String(cfg?.routerMode || '').trim().toLowerCase();
    if (mode === 'on' || mode === 'off') return mode;
    return cfg?.routerEnabled ? 'on' : 'off';
  }

  function shortHash(text) {
    return deps.crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex').slice(0, 10);
  }

  function buildGenerationOptions({ config, groundedRewriteMode, dispatchMode }) {
    const cfg = config || {};
    const asNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const base = {};
    const coderTemp = asNumber(cfg.coderTemperature);
    const coderTopP = asNumber(cfg.coderTopP);
    const coderTopK = asNumber(cfg.coderTopK);
    const coderRepeatPenalty = asNumber(cfg.coderRepeatPenalty);
    const coderNumPredict = asNumber(cfg.coderNumPredict);
    const coderNumCtx = asNumber(cfg.coderNumCtx);
    const coderSeed = asNumber(cfg.coderSeed);
    if (coderTemp !== null) base.temperature = coderTemp;
    if (coderTopP !== null) base.top_p = coderTopP;
    if (coderTopK !== null) base.top_k = coderTopK;
    if (coderRepeatPenalty !== null) base.repeat_penalty = coderRepeatPenalty;
    if (coderNumPredict !== null) base.num_predict = coderNumPredict;
    if (coderNumCtx !== null) base.num_ctx = coderNumCtx;
    if (coderSeed !== null) base.seed = coderSeed;

    if (groundedRewriteMode) {
      return {
        ...base,
        temperature: Number.isFinite(Number(cfg.rewriteTemperature)) ? Number(cfg.rewriteTemperature) : 0.1,
        top_p: Number.isFinite(Number(cfg.rewriteTopP)) ? Number(cfg.rewriteTopP) : 0.85,
        top_k: Number.isFinite(Number(cfg.rewriteTopK)) ? Number(cfg.rewriteTopK) : 40,
        repeat_penalty: Number.isFinite(Number(cfg.rewriteRepeatPenalty)) ? Number(cfg.rewriteRepeatPenalty) : 1.1,
        num_predict: Number.isFinite(Number(cfg.rewriteNumPredict)) ? Number(cfg.rewriteNumPredict) : 4096
      };
    }
    if (dispatchMode === 'inspect') {
      return {
        ...base,
        temperature: coderTemp !== null ? coderTemp : 0.2,
        top_p: coderTopP !== null ? coderTopP : 0.9,
        top_k: coderTopK !== null ? coderTopK : 40
      };
    }
    return base;
  }

  function buildRouterInferenceOptions(cfg = {}, backend, routerPort) {
    const asNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const options = {
      port: routerPort,
      keep_alive: getKeepAlive(),
      backend
    };
    const temperature = asNumber(cfg.routerTemperature);
    const topP = asNumber(cfg.routerTopP);
    const topK = asNumber(cfg.routerTopK);
    const repeatPenalty = asNumber(cfg.routerRepeatPenalty);
    const numPredict = asNumber(cfg.routerNumPredict);
    const numCtx = asNumber(cfg.routerNumCtx);
    const seed = asNumber(cfg.routerSeed);
    options.temperature = temperature !== null ? temperature : 0;
    options.num_predict = numPredict !== null ? numPredict : 256;
    if (topP !== null) options.top_p = topP;
    if (topK !== null) options.top_k = topK;
    if (repeatPenalty !== null) options.repeat_penalty = repeatPenalty;
    if (numCtx !== null) options.num_ctx = numCtx;
    if (seed !== null) options.seed = seed;
    return options;
  }

  function normalizeChatMode(value) {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'inspect') return 'inspect';
    if (v === 'generate') return 'generate';
    return 'auto';
  }

  function detectInspectIntent(message) {
    const text = String(message || '').toLowerCase();
    return /(examine|inspect|review|summari[sz]e|list|quote|show.*content|show.*file|read.*file|what.*(contains|says))/i.test(text);
  }

  function detectRewriteIntent(message) {
    const text = String(message || '').toLowerCase();
    return /(modify|fix|correct|rewrite|update|refactor|patch|change|reprint|print.*(corrected|full file)|show.*(corrected|fixed))/i.test(text);
  }

  function detectGenerateIntent(message) {
    const text = String(message || '').toLowerCase();
    return detectRewriteIntent(text) || /(write|create|build|implement|generate|develop|produce|code)/i.test(text);
  }

  function getChatDispatchMode(message, cfg = null) {
    const config = cfg || getConfig() || {};
    const requestedMode = normalizeChatMode(config.chatMode);
    const inspectIntent = detectInspectIntent(message);
    const rewriteIntent = detectRewriteIntent(message);
    const generateIntent = detectGenerateIntent(message);
    if (requestedMode === 'inspect' || requestedMode === 'generate') {
      return { mode: requestedMode, inspectIntent, rewriteIntent, generateIntent };
    }
    if (rewriteIntent || generateIntent) {
      return { mode: 'generate', inspectIntent, rewriteIntent, generateIntent };
    }
    if (inspectIntent) {
      return { mode: 'inspect', inspectIntent, rewriteIntent, generateIntent };
    }
    return { mode: 'generate', inspectIntent, rewriteIntent, generateIntent };
  }

  function isRouterSmalltalkPrompt(message) {
    const text = String(message || '').trim();
    if (!text) return false;

    const greetingOnly = /^(hi|hello|hey|yo|howdy|hola|sup|what'?s up|good (morning|afternoon|evening))[!. ]*$/i.test(text);
    const thanksOnly = /^(thanks|thank you|thx|ok|okay|cool|nice)[!. ]*$/i.test(text);
    const lightweightSocial = /^(how are you|you there|are you there|ready\??|let'?s go|lets go)[!.? ]*$/i.test(text);

    return greetingOnly || thanksOnly || lightweightSocial;
  }

  function sanitizeRouterSmalltalkResponse(text) {
    let out = streamTools.sanitizeAssistantText(String(text || ''));
    if (!out) return '';

    out = out
      .replace(/\r/g, '')
      .replace(/\n(?:user|assistant|system)\s*[:>].*$/is, '')
      .replace(/\n<\|im_start\|>.*$/is, '')
      .trim();

    const paragraphs = out.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
    const first = paragraphs[0] || out.split('\n').find((l) => String(l || '').trim()) || '';
    const compact = String(first || '').replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    return compact.length > 260 ? `${compact.slice(0, 260).trim()}...` : compact;
  }

  async function runRouterSmalltalkTurn(message, cfg = {}) {
    try {
      const backend = getCodingInferenceBackend();
      const routerReady = backend === 'llama-cpp'
        ? await ensureRouterLlamaReady()
        : await ensureRouterOllamaReady();
      if (!routerReady?.success) {
        return { success: false, error: routerReady?.error || 'router-session-unavailable' };
      }
      const routerPort = backend === 'llama-cpp' ? getRouterLlamaPort() : getRouterOllamaPort();
      if (!routerPort) {
        return { success: false, error: 'router-port-unavailable' };
      }

      const configured = String(cfg?.routerModelName || cfg?.dispatcherModelName || getDefaultRouterModel()).trim();
      const modelsResult = await withTimeout(
        listInferenceModels({ port: routerPort, backend }),
        5000,
        'Router model list timeout'
      );
      const routerModelNames = modelsResult?.success && Array.isArray(modelsResult.models)
        ? modelsResult.models.map((m) => m.name || '').filter(Boolean)
        : [];
      const routerModel = resolveConfiguredModel(configured, routerModelNames) || configured;
      if (!routerModel) {
        return { success: false, error: 'router-model-not-found' };
      }

      const timeoutMs = Math.max(2000, Math.min(Number(cfg.routerTimeoutMs || cfg.dispatcherTimeoutMs) || 8000, 30000));
      const reqMessages = [];
      const routerSystemPrompt = String(cfg?.routerSystemPrompt || '').trim();
      if (routerSystemPrompt) {
        reqMessages.push({ role: 'system', content: routerSystemPrompt });
      }
      reqMessages.push({ role: 'user', content: String(message || '') });
      const routerOptions = buildRouterInferenceOptions(cfg, backend, routerPort);

      let reply;
      try {
        reply = await withTimeout(
          sendInferenceMessage(routerModel, reqMessages, {
            ...routerOptions
          }),
          timeoutMs,
          `Router timeout after ${timeoutMs}ms`
        );
      } catch (err) {
        const msg = String(err?.message || '');
        if (!/timeout/i.test(msg)) throw err;
        const retryTimeoutMs = Math.min(30000, Math.max(timeoutMs + 4000, Math.floor(timeoutMs * 1.75)));
        reply = await withTimeout(
          sendInferenceMessage(routerModel, reqMessages, {
            ...routerOptions
          }),
          retryTimeoutMs,
          `Router timeout after retry ${retryTimeoutMs}ms`
        );
      }

      if (!reply?.success) {
        return { success: false, error: String(reply?.message || 'router-chat-failed') };
      }
      const rawContent = String(
        reply?.response?.message?.content ||
        reply?.response?.response ||
        reply?.response?.content ||
        ''
      ).trim();
      const content = sanitizeRouterSmalltalkResponse(rawContent);
      if (!content) {
        return { success: false, error: 'router-empty-response' };
      }
      return { success: true, modelName: routerModel, routerPort, content };
    } catch (err) {
      return { success: false, error: String(err?.message || 'router-smalltalk-exception') };
    }
  }

  async function runRouterDirectTurn(message, cfg = {}) {
    try {
      const backend = getCodingInferenceBackend();
      const routerReady = backend === 'llama-cpp'
        ? await ensureRouterLlamaReady()
        : await ensureRouterOllamaReady();
      if (!routerReady?.success) {
        return { success: false, error: routerReady?.error || 'router-session-unavailable' };
      }
      const routerPort = backend === 'llama-cpp' ? getRouterLlamaPort() : getRouterOllamaPort();
      if (!routerPort) {
        return { success: false, error: 'router-port-unavailable' };
      }

      const configured = String(cfg?.routerModelName || cfg?.dispatcherModelName || getDefaultRouterModel()).trim();
      const modelsResult = await withTimeout(
        listInferenceModels({ port: routerPort, backend }),
        5000,
        'Router model list timeout'
      );
      const routerModelNames = modelsResult?.success && Array.isArray(modelsResult.models)
        ? modelsResult.models.map((m) => m.name || '').filter(Boolean)
        : [];
      const routerModel = resolveConfiguredModel(configured, routerModelNames) || configured;
      if (!routerModel) {
        return { success: false, error: 'router-model-not-found' };
      }

      const timeoutMs = Math.max(4000, Math.min(Number(cfg.routerTimeoutMs || cfg.dispatcherTimeoutMs) || 12000, 45000));
      const reqMessages = [];
      const routerSystemPrompt = String(cfg?.routerSystemPrompt || '').trim();
      if (routerSystemPrompt) {
        reqMessages.push({ role: 'system', content: routerSystemPrompt });
      }
      reqMessages.push({ role: 'user', content: String(message || '') });
      const routerOptions = buildRouterInferenceOptions(cfg, backend, routerPort);

      let reply;
      try {
        reply = await withTimeout(
          sendInferenceMessage(routerModel, reqMessages, {
            ...routerOptions
          }),
          timeoutMs,
          `Router timeout after ${timeoutMs}ms`
        );
      } catch (err) {
        const msg = String(err?.message || '');
        if (!/timeout/i.test(msg)) throw err;
        const retryTimeoutMs = Math.min(60000, Math.max(timeoutMs + 6000, Math.floor(timeoutMs * 1.8)));
        reply = await withTimeout(
          sendInferenceMessage(routerModel, reqMessages, {
            ...routerOptions
          }),
          retryTimeoutMs,
          `Router timeout after retry ${retryTimeoutMs}ms`
        );
      }

      if (!reply?.success) {
        return { success: false, error: String(reply?.message || 'router-chat-failed') };
      }
      const rawContent = String(
        reply?.response?.message?.content ||
        reply?.response?.response ||
        reply?.response?.content ||
        ''
      ).trim();
      const content = streamTools.sanitizeAssistantText(rawContent);
      if (!content) {
        return { success: false, error: 'router-empty-response' };
      }
      return { success: true, modelName: routerModel, routerPort, content };
    } catch (err) {
      return { success: false, error: String(err?.message || 'router-direct-exception') };
    }
  }

  return {
    normalizeRouterModeConfig,
    shortHash,
    buildGenerationOptions,
    isRouterSmalltalkPrompt,
    runRouterSmalltalkTurn,
    runRouterDirectTurn,
    getChatDispatchMode
  };
}

module.exports = createRouterTools;
