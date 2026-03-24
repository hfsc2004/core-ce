/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const moeEndpoint = require('./moe-endpoint');

function createAgentTransport({ requestTimeout }) {
  function normalizeMessagesForLlamaTemplate(messages = []) {
    const rows = Array.isArray(messages) ? messages : [];
    const normalized = [];
    for (const row of rows) {
      const rawRole = String(row?.role || '').trim().toLowerCase();
      const content = String(row?.content || '').trim();
      if (!content) continue;
      const role = rawRole === 'assistant' ? 'assistant' : 'user';
      if (normalized.length === 0 && role === 'assistant') {
        normalized.push({ role: 'user', content: 'Continue.' });
      }
      const prev = normalized[normalized.length - 1];
      if (prev && prev.role === role) {
        prev.content = `${prev.content}\n\n${content}`.trim();
      } else {
        normalized.push({ role, content });
      }
    }
    if (normalized.length === 0) normalized.push({ role: 'user', content: 'Hello.' });
    if (normalized[normalized.length - 1]?.role !== 'user') {
      normalized.push({ role: 'user', content: 'Continue.' });
    }
    return normalized;
  }

  function extractLlamaAssistantContent(data = {}) {
    return String(
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.message?.reasoning_content ||
      data?.choices?.[0]?.message?.reasoning ||
      data?.choices?.[0]?.message?.thinking ||
      data?.choices?.[0]?.text ||
      data?.message?.content ||
      data?.content ||
      data?.response ||
      ''
    );
  }

  async function callAgent(agent, messages, options = {}) {
    const provider = String(agent?.provider || '').trim().toLowerCase() === 'llama.cpp' ? 'llama.cpp' : 'ollama';
    const modelTag = String(agent?.modelId || agent?.modelName || '').trim();

    if (!modelTag) {
      return { success: false, error: `No model assigned to agent ${agent.name}` };
    }

    try {
      const controller = new AbortController();
      const timeoutMs = Number.isFinite(Number(options.timeoutMs))
        ? Number(options.timeoutMs)
        : requestTimeout;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const url = provider === 'llama.cpp'
        ? moeEndpoint.buildEndpointURL(agent.endpoint, '/v1/chat/completions')
        : moeEndpoint.buildOllamaChatURL(agent.endpoint);
      const body = provider === 'llama.cpp'
        ? {
            model: modelTag,
            messages: normalizeMessagesForLlamaTemplate(messages),
            stream: false
          }
        : {
            model: modelTag,
            messages,
            stream: false
          };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      const content = provider === 'llama.cpp'
        ? extractLlamaAssistantContent(data)
        : String(data?.message?.content || data?.response || '');
      return { success: true, content };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: err.message };
    }
  }

  async function callAgentWithPolicy(agent, messages, edgePolicy) {
    const retries = Math.max(0, Number.parseInt(String(edgePolicy?.retryCount ?? 0), 10) || 0);
    const timeoutMs = Number.isFinite(Number(edgePolicy?.timeoutMs))
      ? Number(edgePolicy.timeoutMs)
      : requestTimeout;
    let lastResult = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const result = await callAgent(agent, messages, { timeoutMs });
      lastResult = result;
      if (result?.success) {
        return { ...result, attempts: attempt + 1 };
      }
    }
    return {
      ...(lastResult || { success: false, error: 'Unknown agent call failure' }),
      attempts: retries + 1
    };
  }

  async function pingAgent(agent) {
    if (!agent) return { reachable: false, error: 'Agent not found' };
    try {
      const provider = String(agent?.provider || '').trim().toLowerCase() === 'llama.cpp' ? 'llama.cpp' : 'ollama';
      const url = provider === 'llama.cpp'
        ? moeEndpoint.buildEndpointURL(agent.endpoint, '/v1/models')
        : moeEndpoint.buildOllamaTagsURL(agent.endpoint);
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      return {
        reachable: response.ok,
        status: response.status,
        provider,
        endpoint: moeEndpoint.buildEndpointURL(agent.endpoint, '')
      };
    } catch (err) {
      return {
        reachable: false,
        error: err.message
      };
    }
  }

  function buildAgentMessages(agent, currentInput, previousResponses, isLast, options = {}) {
    const messages = [];

    if (agent.systemPrompt) {
      messages.push({ role: 'system', content: agent.systemPrompt });
    }

    const inputText = String(currentInput || '');
    const inputAlreadyContainsHistory = /previous agents in the chain have provided the following context:/i.test(inputText);
    const includeHistoryContext =
      options?.includeHistoryContext === true ||
      String(agent?.routingMode || '').trim().toLowerCase() === 'dynamic';

    if (includeHistoryContext && !inputAlreadyContainsHistory && previousResponses.length > 1) {
      const historyContext = previousResponses
        .slice(0, -1)
        .map((p) => `[${p.agent}]: ${p.response}`)
        .join('\n\n');

      messages.push({
        role: 'system',
        content: `Previous agents in the chain have provided the following context:\n\n${historyContext}`
      });
    }

    if (options?.includeHardwarePlanContext && options?.hardwarePlanContext) {
      messages.push({
        role: 'system',
        content:
          `Hardware planning context:\n${options.hardwarePlanContext}\n\n` +
          `When user intent is machine control, choose exactly one IRG deterministic action and return ONLY JSON on one line.\n` +
          `Prefix exactly with "IRG_PLAN_JSON: " followed by one JSON object.\n` +
          `Allowed actions: blink_gpio, blink_color_sequence, blink_color_group, blink_pattern_sequence, blink_multi_phase, push_esp32_code.\n` +
          `Required JSON shape:\n` +
          `IRG_PLAN_JSON: {"action":"<allowed_action>","params":{...}}\n` +
          `For ESP32 code upload use: {"action":"push_esp32_code","params":{"language":"arduino-cpp","code":"<full sketch code>"}}\n` +
          `Use integer milliseconds and integer counts only.\n` +
          `Do not invent fields outside params; no markdown, no prose, no code block.`
      });
    }

    if (options?.rlmAssistContext) {
      messages.push({
        role: 'system',
        content:
          `RLM assist context for this hop:\n${String(options.rlmAssistContext)}\n\n` +
          `Use it as grounding context. If it conflicts with explicit user intent, follow user intent.`
      });
    }

    messages.push({ role: 'user', content: currentInput });
    return messages;
  }

  return {
    callAgent,
    callAgentWithPolicy,
    pingAgent,
    buildAgentMessages
  };
}

module.exports = createAgentTransport;
