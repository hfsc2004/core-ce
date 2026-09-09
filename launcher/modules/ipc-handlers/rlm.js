/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { createRlmEngine } = require('../rlm-engine/rlm-engine');
const bucketSecurity = require('../security-layer/security-buckets');
const http = require('http');
const https = require('https');

function buildSecureAttachmentStore(rawStore, actor = {}) {
  const store = rawStore || {};
  return {
    async listAttachments(sessionId) {
      const auth = await bucketSecurity.authorizeBucketAction({
        action: 'list',
        sessionId,
        actor,
        details: { source: 'rlm:run-turn:list' }
      });
      if (!auth.allowed) return [];
      if (typeof store.listAttachments !== 'function') return [];
      return store.listAttachments(sessionId);
    },
    async readAttachmentText(options = {}) {
      const sessionId = String(options?.sessionId || '').trim();
      const auth = await bucketSecurity.authorizeBucketAction({
        action: 'read',
        sessionId,
        actor,
        details: { source: 'rlm:run-turn:read-text', attachmentId: String(options?.attachmentId || '') }
      });
      if (!auth.allowed) {
        throw new Error(`Permission denied for bucket session: ${sessionId}`);
      }
      if (typeof store.readAttachmentText !== 'function') {
        throw new Error('attachment store unavailable');
      }
      return store.readAttachmentText(options);
    }
  };
}

function createRlmHandlers() {
  function postJson(urlValue, payload = {}, headers = {}, options = {}) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(urlValue);
      } catch (err) {
        reject(err);
        return;
      }
      const body = JSON.stringify(payload);
      const transport = parsed.protocol === 'https:' ? https : http;
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };
      const req = transport.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers
        }
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsedBody = null;
          try {
            parsedBody = data ? JSON.parse(data) : {};
          } catch (err) {
            finish(reject, new Error(`RLM provider returned invalid JSON: ${err.message}`));
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            finish(reject, new Error(`RLM provider HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
            return;
          }
          finish(resolve, parsedBody);
        });
      });
      const timeoutMs = Number(options.timeoutMs);
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        req.setTimeout(timeoutMs, () => {
          try { req.destroy(new Error(`RLM provider request timed out after ${Math.floor(timeoutMs)}ms`)); } catch (_) {}
        });
      }
      req.on('error', (err) => finish(reject, err));
      req.write(body);
      req.end();
    });
  }

  async function sendRlmModelMessage(ctx, rootPayload = {}, modelName, messages, options = {}) {
    const backend = String(rootPayload?.backend || '').trim().toLowerCase();
    const baseUrl = String(rootPayload?.providerBaseUrl || '').trim().replace(/\/+$/, '');
    const isLlamaCpp = backend === 'llama.cpp' || backend === 'llama-cpp' || backend === 'llamacpp';
    if ((isLlamaCpp || backend === 'vllm' || backend === 'openai-compatible') && baseUrl) {
      const headers = {};
      const apiKey = String(rootPayload?.providerApiKey || '').trim();
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const isRootAction = options?.rlmRootAction === true;
      const isSubcall = options?.rlmSubcall === true;
      const isFinalComposition = isSubcall && String(options?.rlmSubcallPurpose || '').trim() === 'final_composition';
      const maxTokens = isRootAction
        ? Math.min(256, Math.max(64, Number(options?.maxTokens) || 192))
        : (isFinalComposition
          ? Math.min(4096, Math.max(128, Number(options?.maxTokens) || 1024))
          : (isSubcall
          ? Math.min(256, Math.max(64, Number(options?.maxTokens) || 128))
          : Math.min(2048, Number(options?.maxTokens) || 1024)));
      const requestBody = {
        model: String(rootPayload?.providerModel || modelName || '').trim() || modelName,
        messages,
        stream: false,
        max_tokens: maxTokens,
        temperature: (isRootAction || isSubcall) ? 0 : (Number.isFinite(Number(options?.temperature)) ? Number(options.temperature) : 0.2)
      };
      if (isLlamaCpp && (isRootAction || isSubcall)) {
        requestBody.chat_template_kwargs = { enable_thinking: false };
        requestBody.reasoning_effort = 'none';
      }
      const response = await postJson(`${baseUrl}/v1/chat/completions`, requestBody, headers);
      const choice = Array.isArray(response?.choices) ? response.choices[0] : null;
      const message = choice?.message || {};
      const content = String(message?.content || choice?.text || response?.content || response?.text || '');
      const finishReason = String(choice?.finish_reason || response?.finish_reason || '');
      const reasoning = String(
        message?.reasoning_content ||
        message?.reasoning ||
        message?.thinking ||
        response?.reasoning_content ||
        response?.reasoning ||
        response?.thinking ||
        ''
      );
      return {
        success: true,
        response: {
          finishReason,
          message: {
            role: 'assistant',
            content,
            reasoning_content: reasoning,
            thinking: reasoning
          },
          raw: response
        }
      };
    }
    return ctx.ollamaManager.sendMessage(modelName, messages, options);
  }

  return {
    'rlm:run-turn': async (ctx, event, payload = {}) => {
      const actor = {
        userId: String(payload?.userId || payload?.user || payload?.actorId || 'default')
      };
      const engine = createRlmEngine({
        attachmentStore: buildSecureAttachmentStore(ctx.attachmentStore, actor),
        executeDeterministicTool: (toolName, args = {}, context = {}, options = {}) =>
          ctx.sessionManager.executeDeterministicTool(toolName, args, context, options),
        sendMessage: (modelName, messages, options = {}) =>
          ctx.ollamaManager.sendMessage(modelName, messages, options)
      });
      return engine.runTurn(payload || {});
    },

    'rlm:start-session': async (ctx, event, payload = {}) => {
      if (!ctx.sessionManager || typeof ctx.sessionManager.startRlmSession !== 'function') {
        return { success: false, error: 'RLM service is unavailable.' };
      }
      return ctx.sessionManager.startRlmSession(payload || {});
    },

    'rlm:run-dry-turn': async (ctx, event, payload = {}) => {
      if (!ctx.sessionManager || typeof ctx.sessionManager.runRlmDryTurn !== 'function') {
        return { success: false, error: 'RLM service is unavailable.' };
      }
      return ctx.sessionManager.runRlmDryTurn(payload || {});
    },

    'rlm:get-session': async (ctx, event, sessionId = '') => {
      if (!ctx.sessionManager || typeof ctx.sessionManager.getRlmSession !== 'function') {
        return { success: false, error: 'RLM service is unavailable.' };
      }
      return ctx.sessionManager.getRlmSession(sessionId);
    },

    'rlm:stop-session': async (ctx, event, sessionId = '', reason = 'stopped') => {
      if (!ctx.sessionManager || typeof ctx.sessionManager.stopRlmSession !== 'function') {
        return { success: false, error: 'RLM service is unavailable.' };
      }
      return ctx.sessionManager.stopRlmSession(sessionId, reason);
    },

    'rlm:list-sessions': async (ctx) => {
      if (!ctx.sessionManager || typeof ctx.sessionManager.listRlmSessions !== 'function') {
        return { success: false, error: 'RLM service is unavailable.' };
      }
      return ctx.sessionManager.listRlmSessions();
    },

    'rlm:validate-sandbox-code': async (ctx, event, payload = {}) => {
      if (!ctx.sessionManager || typeof ctx.sessionManager.validateRlmSandboxCode !== 'function') {
        return { success: false, error: 'RLM sandbox service is unavailable.' };
      }
      return ctx.sessionManager.validateRlmSandboxCode(payload || {});
    },

    'rlm:execute-sandbox-code': async (ctx, event, payload = {}) => {
      if (!ctx.sessionManager || typeof ctx.sessionManager.executeRlmSandboxCode !== 'function') {
        return { success: false, error: 'RLM sandbox service is unavailable.' };
      }
      return ctx.sessionManager.executeRlmSandboxCode(payload || {});
    },

    'rlm:run-action': async (ctx, event, payload = {}) => {
      if (!ctx.sessionManager || typeof ctx.sessionManager.runRlmAction !== 'function') {
        return { success: false, error: 'RLM action service is unavailable.' };
      }
      return ctx.sessionManager.runRlmAction(payload || {});
    },

    'rlm:run-loop': async (ctx, event, payload = {}) => {
      if (!ctx.sessionManager || typeof ctx.sessionManager.runRlmLoop !== 'function') {
        return { success: false, error: 'RLM loop service is unavailable.' };
      }
      return ctx.sessionManager.runRlmLoop(payload || {}, {
        onProgress: (progress = {}) => {
          try {
            event.sender.send('rlm:progress', progress);
          } catch (_) {}
        },
        sendMessage: (modelName, messages, options = {}) =>
          sendRlmModelMessage(ctx, payload || {}, modelName, messages, options)
      });
    }
  };
}

module.exports = { createRlmHandlers };
