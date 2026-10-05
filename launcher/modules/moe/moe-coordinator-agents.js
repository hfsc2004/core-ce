/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const moeEndpoint = require('./moe-endpoint');

function createAgentTransport({ requestTimeout, runSessionTurn, pingSession }) {
  async function callAgent(agent, messages, options = {}) {
    const provider = String(agent?.provider || '').trim().toLowerCase() === 'llama.cpp' ? 'llama.cpp' : 'ollama';
    const modelTag = String(agent?.modelId || agent?.modelName || '').trim();

    if (!modelTag) {
      return { success: false, error: `No model assigned to agent ${agent.name}` };
    }

    if (provider === 'llama.cpp') {
      if (!runSessionTurn) return { success: false, error: 'BMOC session support unavailable' };
      return runSessionTurn(agent.sessionId, { model: modelTag,
        messages, timeoutMs: options.timeoutMs || requestTimeout,
        endpoint: moeEndpoint.buildEndpointURL(agent.endpoint, '') });
    }
    try {
      const controller = new AbortController();
      const timeoutMs = Number.isFinite(Number(options.timeoutMs))
        ? Number(options.timeoutMs)
        : requestTimeout;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const url = moeEndpoint.buildOllamaChatURL(agent.endpoint);
      const body = { model: modelTag, messages, stream: false };

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
      const content = String(data?.message?.content || data?.response || '');
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
      if (provider === 'llama.cpp') {
        if (!pingSession) return { reachable: false, error: 'BMOC session support unavailable' };
        return await pingSession(agent.sessionId);
      }
      const url = moeEndpoint.buildOllamaTagsURL(agent.endpoint);
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

    if (options?.structuredRecordContext) {
      messages.push({
        role: 'system',
        content:
          `Structured record context from prior agents (authoritative for carry-forward fields):\n` +
          `${String(options.structuredRecordContext)}\n\n` +
          `Use this context to populate missing fields. Do not output placeholders.`
      });
    }

    const stateCaps = options?.pipelineStateToolCapabilities || {};
    if (stateCaps.pipelineStateRead || stateCaps.pipelineStateWrite) {
      const rules = [];
      if (stateCaps.pipelineStateRead) {
        rules.push('Read: Include `PIPE_STATE_GET: key1,key2` in your output only when explicitly instructed to retrieve variables.');
      }
      if (stateCaps.pipelineStateWrite) {
        rules.push('Write: Include `PIPE_STATE_SET: key=value` (or JSON: `PIPE_STATE_SET: {"key":"k","value":"v"}`) only when explicitly instructed to save variables.');
      }
      rules.push('Do not use PIPE_STATE commands unless explicitly requested by prompt/policy.');
      messages.push({
        role: 'system',
        content: `Pipeline state tool policy:\n${rules.join('\n')}`
      });
    }

    if (options?.pipelineStateReadContext) {
      messages.push({
        role: 'system',
        content:
          `Pipeline state lookup result:\n${String(options.pipelineStateReadContext)}\n\n` +
          `Use these retrieved values as authoritative variable values for this turn.`
      });
    }

    if (options?.cliToolContext) {
      messages.push({
        role: 'system',
        content: String(options.cliToolContext)
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
