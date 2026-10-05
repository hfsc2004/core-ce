'use strict';

// BMOC owns conversation history, slot identity, and lifetime. llama.cpp owns
// all model-specific recurrent tensors. Nothing here is persisted across starts.
module.exports = function createSequenceState({ getSession, fetch: request = globalThis.fetch, log = entry => console.log('[BMOC State]', JSON.stringify(entry)) }) {
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

  const states = new Map();
  const invalidatedSessions = new WeakSet();
  function lifetimeKey(session) {
    return JSON.stringify([session?.ollamaPID, session?.ollamaPort, session?.startTime,
      session?.metadata?.modelPath, session?.metadata?.persistentSequence === true]);
  }
  function get(id) {
    const session = getSession(id);
    if (!session || session.metadata?.backend !== 'llama-cpp') {
      throw new Error('No llama.cpp BMOC session');
    }
    if (invalidatedSessions.has(session)) throw new Error('BMOC session is closing');
    let state = states.get(id);
    if (state && state.lifetime !== lifetimeKey(session)) {
      state.closed = true;
      record(id, state, session, 'process-replaced');
      state.controller?.abort();
      states.delete(id);
      state = null;
    }
    if (!state) {
      state = { sessionId: id, lifetime: lifetimeKey(session), pid: session.ollamaPID, slotId: 0, messages: [], status: 'empty',
        tokens: [], promptText: '', generation: 0, turnCount: 0, totalTurnCount: 0, resetCount: 0, events: [], closed: false, tail: Promise.resolve() };
      states.set(id, state);
      record(id, state, session, 'opened');
    }
    if (state.closed) throw new Error('BMOC session is closing');
    return { state, session };
  }
  function describe(id, state, session) {
    return {
      sessionId: id, enabled: session?.metadata?.persistentSequence === true,
      status: state?.closed ? 'invalidated' : (state?.status || 'empty'),
      generation: state?.generation || 0, turnCount: state?.turnCount || 0,
      totalTurnCount: state?.totalTurnCount || 0, resetCount: state?.resetCount || 0,
      modelId: session?.metadata?.modelId || session?.metadata?.modelName || null,
      modelName: session?.metadata?.modelName || null, runtime: 'llama.cpp',
      events: (state?.events || []).map(event => ({ ...event }))
    };
  }
  function record(id, state, session, type) {
    if (session?.metadata?.persistentSequence !== true) return;
    const event = { type, at: new Date().toISOString(), generation: state.generation,
      turnCount: state.turnCount, totalTurnCount: state.totalTurnCount };
    state.events.push(event);
    if (state.events.length > 100) state.events.shift();
    const { events, ...metadata } = describe(id, state, session);
    // Metadata only: never log prompts, token IDs, or model tensor contents.
    try { log({ ...metadata, event: { ...event } }); } catch (_) { /* logging cannot break a turn */ }
  }
  function enqueue(id, action) {
    let entry;
    try { entry = get(id); } catch (err) { return Promise.resolve({ success: false, error: err.message }); }
    const { state, session } = entry;
    const operation = state.tail.then(async () => {
      const current = getSession(id);
      if (state.closed || !current || invalidatedSessions.has(current) || lifetimeKey(current) !== state.lifetime) {
        return { success: false, error: 'BMOC session invalidated' };
      }
      try {
        const result = await action(state, current);
        return { ...result, bmocState: describe(id, state, session) };
      } catch (err) {
        state.status = 'invalid';
        record(id, state, session, 'error');
        return { success: false, error: err.message, bmocState: describe(id, state, session) };
      }
    });
    state.tail = operation.catch(() => {});
    return operation;
  }
  async function call(state, session, route, body, timeoutMs) {
    state.controller = new AbortController();
    const timer = setTimeout(() => state.controller?.abort(), timeoutMs || 120000);
    try {
      const response = await request(`http://127.0.0.1:${session.ollamaPort}${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: state.controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json();
      const current = getSession(state.sessionId);
      if (state.closed || !current || lifetimeKey(current) !== state.lifetime) {
        throw new Error('BMOC session invalidated');
      }
      return data;
    } finally { clearTimeout(timer); state.controller = null; }
  }
  function runTurn(id, input = {}) {
    return enqueue(id, async (state, session) => {
      const ownEndpoint = `http://127.0.0.1:${session.ollamaPort}`;
      if (input.endpoint && input.endpoint.replace(/\/$/, '') !== ownEndpoint) {
        throw new Error('Agent must use its BMOC-owned endpoint');
      }
      if (session.metadata.persistentSequence === true && state.status === 'invalid') throw new Error('Sequence invalid; reset the BMOC session state before continuing');
      // Provider/template adaptation belongs to BMOC, not Relay.
      const incoming = normalizeMessagesForLlamaTemplate(input.messages);
      const persistent = session.metadata.persistentSequence === true;
      const messages = persistent ? [...state.messages, ...incoming] : incoming;
      state.status = 'busy';
      record(id, state, session, 'turn-started');
      let content;
      if (persistent) {
        // Chat responses can hide reasoning tokens. Render with llama.cpp's own
        // template, but retain the exact native completion tokens for continuation.
        // Render just the new turn's boundary. Rendering the entire conversation
        // can rewrite prior reasoning/stop text and lose native recurrent state.
        const boundary = '__BMOC_SEQUENCE_BOUNDARY__';
        const templateMessages = state.tokens.length
          ? [...state.messages.slice(0, -1), { role: 'assistant', content: boundary }, ...incoming]
          : incoming;
        const rendered = await call(state, session, '/apply-template', { messages: templateMessages }, input.timeoutMs);
        const prompt = rendered.prompt;
        if (typeof prompt !== 'string') throw new Error('Missing rendered llama.cpp prompt');
        let suffix = prompt;
        if (state.tokens.length) {
          const index = prompt.indexOf(boundary);
          if (index < 0 || index !== prompt.lastIndexOf(boundary)) {
            throw new Error('Cannot render sequence continuation boundary');
          }
          suffix = prompt.slice(index + boundary.length);
        }
        const tokenized = await call(state, session, '/tokenize', {
          content: suffix, add_special: false, parse_special: true
        }, input.timeoutMs);
        if (!Array.isArray(tokenized.tokens)) throw new Error('Missing prompt token IDs');
        const promptTokens = [...state.tokens, ...tokenized.tokens];
        const data = await call(state, session, '/completion', {
          prompt: promptTokens, stream: false, id_slot: state.slotId,
          cache_prompt: true, return_tokens: true
        }, input.timeoutMs);
        if (!Array.isArray(data.tokens) || typeof data.content !== 'string') {
          throw new Error('Missing native completion tokens');
        }
        if (data.truncated) throw new Error('Persistent context limit reached; reset model state');
        content = data.content;
        state.tokens = [...promptTokens, ...data.tokens];
        state.promptText += suffix + content;
        state.messages = [...messages, { role: 'assistant', content }];
      } else {
        const data = await call(state, session, '/v1/chat/completions', {
          model: input.model || session.metadata.modelName, messages, stream: false
        }, input.timeoutMs);
        const assistant = data.choices?.[0]?.message || {};
        content = String(assistant.content || assistant.reasoning_content || assistant.reasoning || assistant.thinking ||
          data.choices?.[0]?.text || data.message?.content || data.content || data.response || '');
      }
      state.status = 'ready';
      state.turnCount++;
      state.totalTurnCount++;
      record(id, state, session, 'turn-completed');
      return { success: true, content };
    });
  }
  function reset(id) {
    return enqueue(id, async (state, session) => {
      if (session.metadata.persistentSequence !== true) throw new Error('Persistent state is not enabled');
      state.status = 'resetting';
      await call(state, session, `/slots/${state.slotId}?action=erase`, {}, 120000);
      state.messages = [];
      state.tokens = [];
      state.promptText = '';
      state.generation++;
      state.turnCount = 0;
      state.resetCount++;
      state.status = 'empty';
      record(id, state, session, 'reset');
      return { success: true };
    });
  }
  async function invalidate(id) {
    const session = getSession(id);
    if (session) invalidatedSessions.add(session);
    const state = states.get(id);
    if (!state) return;
    state.closed = true;
    record(id, state, session, 'invalidated');
    state.controller?.abort();
    await state.tail;
    state.messages = [];
    state.tokens = [];
    state.promptText = '';
    states.delete(id);
  }
  function status(id) {
    const session = getSession(id);
    if (!session || session.metadata?.backend !== 'llama-cpp') {
      return { sessionId: id, enabled: false, status: 'invalidated' };
    }
    // Observation never allocates state or contacts the model server.
    const state = states.get(id);
    const view = describe(id, state, session);
    if (invalidatedSessions.has(session) || (state && state.lifetime !== lifetimeKey(session))) view.status = 'invalidated';
    return { ...view, messageCount: state?.messages.length || 0, tokenCount: state?.tokens.length || 0 };
  }
  async function ping(id) {
    try {
      const { session } = get(id);
      const response = await request(`http://127.0.0.1:${session.ollamaPort}/v1/models`, {
        method: 'GET', signal: AbortSignal.timeout(5000)
      });
      return { reachable: response.ok, status: response.status, provider: 'llama.cpp' };
    } catch (err) { return { reachable: false, error: err.message }; }
  }
  return { runTurn, reset, invalidate, status, ping };
};
