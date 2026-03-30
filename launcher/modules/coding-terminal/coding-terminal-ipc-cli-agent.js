/**
 *
 * @version 1.1.2 - March 30, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

function createCliAgentTools(deps = {}) {
  const getConfig = typeof deps.getConfig === 'function' ? deps.getConfig : (() => ({}));
  const getProjectPath = typeof deps.getProjectPath === 'function' ? deps.getProjectPath : (() => '');
  const buildDeterministicToolRunTests = typeof deps.buildDeterministicToolRunTests === 'function'
    ? deps.buildDeterministicToolRunTests
    : (() => null);
  const buildDeterministicToolReadFile = typeof deps.buildDeterministicToolReadFile === 'function'
    ? deps.buildDeterministicToolReadFile
    : (() => null);
  const buildDeterministicToolWriteFile = typeof deps.buildDeterministicToolWriteFile === 'function'
    ? deps.buildDeterministicToolWriteFile
    : (() => null);
  const buildDeterministicToolVerify = typeof deps.buildDeterministicToolVerify === 'function'
    ? deps.buildDeterministicToolVerify
    : (() => null);
  const appendPipelineEvent = typeof deps.appendPipelineEvent === 'function'
    ? deps.appendPipelineEvent
    : (() => null);

  function getPolicy(config = {}) {
    const value = String(config?.cliAgentPolicy || '').trim().toLowerCase();
    if (value === 'read-only') return 'read-only';
    return 'workspace-write';
  }

  function getStepBudget(config = {}) {
    const value = Number(config?.cliAgentStepBudget);
    if (!Number.isFinite(value)) return 2;
    return Math.max(1, Math.min(Math.trunc(value), 8));
  }

  function isEnabled(config = null) {
    const cfg = config || getConfig();
    return cfg?.cliAgentEnabled === true;
  }

  function buildCliAgentSystemPrompt(config = null) {
    const cfg = config || getConfig();
    const policy = getPolicy(cfg);
    const stepBudget = getStepBudget(cfg);
    return [
      '[CLI_AGENT_MODE]',
      `Enabled: true`,
      `Policy: ${policy}`,
      `Max tool calls per turn: ${stepBudget}`,
      'If you need CLI/file actions, emit one line per action exactly:',
      'CLI_TOOL_JSON: {"action":"read_file","path":"relative/path.ext"}',
      'CLI_TOOL_JSON: {"action":"write_file","path":"relative/path.ext","content":"full file content"}',
      'CLI_TOOL_JSON: {"action":"run_tests"}',
      'CLI_TOOL_JSON: {"action":"verify"}',
      'Do not invent tool results. Wait for returned tool output.'
    ].join('\n');
  }

  function applyCliAgentContext(prepared = null) {
    if (!prepared || typeof prepared !== 'object') return prepared;
    const cfg = getConfig();
    if (!isEnabled(cfg)) return prepared;
    const rows = Array.isArray(prepared.messages) ? prepared.messages.slice() : [];
    const hasMarker = rows.some((row) => String(row?.content || '').includes('[CLI_AGENT_MODE]'));
    if (hasMarker) return prepared;
    const prompt = buildCliAgentSystemPrompt(cfg);
    rows.unshift({ role: 'system', content: prompt });
    return {
      ...prepared,
      messages: rows
    };
  }

  function parseCliToolCalls(text = '', config = null) {
    const cfg = config || getConfig();
    if (!isEnabled(cfg)) return [];
    const budget = getStepBudget(cfg);
    const rows = String(text || '').split(/\r?\n/);
    const calls = [];
    for (const row of rows) {
      if (calls.length >= budget) break;
      const idx = row.indexOf('CLI_TOOL_JSON:');
      if (idx < 0) continue;
      const raw = row.slice(idx + 'CLI_TOOL_JSON:'.length).trim();
      if (!raw || !raw.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const next = { ...parsed };
          const action = String(next?.action || '').trim().toLowerCase();
          if (action === 'write_file') {
            next.content = normalizeWriteContent(next.content || '');
          }
          calls.push(next);
        }
      } catch {}
    }
    return calls;
  }

  function callKey(call = {}) {
    const action = String(call?.action || '').trim().toLowerCase();
    const pathArg = String(call?.path || call?.file || '').trim();
    return `${action}::${pathArg}`;
  }

  function normalizeWriteContent(raw = '') {
    const compact = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (!compact) return '';
    // Convert "line 1: ... line 2: ..." style into explicit newlines.
    return compact
      .replace(/\s+line\s+(\d+)\s*:/gi, '\nline $1:')
      .replace(/^\n+/, '')
      .trim();
  }

  function extractPlannedCallsFromUserPrompt(text = '') {
    const source = String(text || '').trim();
    if (!source) return [];
    const planned = [];
    const stepRe = /step\s*\d+\s*:\s*([\s\S]*?)(?=step\s*\d+\s*:|$)/gi;
    let match = null;
    while ((match = stepRe.exec(source))) {
      const step = String(match[1] || '').trim();
      if (!step) continue;

      const writeMatch = step.match(/write_file\s+path=([^\s]+)\s+with\s+content:\s*([\s\S]*)$/i);
      if (writeMatch) {
        planned.push({
          action: 'write_file',
          path: String(writeMatch[1] || '').trim(),
          content: normalizeWriteContent(writeMatch[2] || '')
        });
        continue;
      }

      const readMatch = step.match(/read_file\s+path=([^\s]+)/i);
      if (readMatch) {
        planned.push({
          action: 'read_file',
          path: String(readMatch[1] || '').trim()
        });
        continue;
      }

      if (/\brun_tests\b/i.test(step)) {
        planned.push({ action: 'run_tests' });
        continue;
      }
      if (/\bverify\b/i.test(step)) {
        planned.push({ action: 'verify' });
      }
    }
    return planned;
  }

  function makeToolMessage(call = {}) {
    const action = String(call?.action || '').trim().toLowerCase();
    const pathArg = String(call?.path || call?.file || '').trim();
    if (action === 'run_tests') return 'tool.run_tests';
    if (action === 'verify') return 'tool.verify';
    if (action === 'read_file') return `tool.read_file path=${pathArg}`;
    if (action === 'write_file') {
      const nextContent = String(call?.content || '').replace(/\r\n/g, '\n');
      return `tool.write_file path=${pathArg}\n\`\`\`\n${nextContent}\n\`\`\``;
    }
    return '';
  }

  function emitStatus(sender, payload = {}) {
    try {
      if (!sender || typeof sender.send !== 'function') return;
      sender.send('coding-terminal:stream-data', {
        streamId: payload.streamId || null,
        modelName: payload.modelName || 'assistant',
        chunk: String(payload.chunk || ''),
        kind: 'status'
      });
    } catch {}
  }

  function runCliToolCall(call = {}, context = {}) {
    const cfg = context.config || getConfig();
    const policy = getPolicy(cfg);
    const action = String(call?.action || '').trim().toLowerCase();
    const projectPath = String(context.projectPath || getProjectPath() || '').trim();

    if (!projectPath) {
      return 'CLI tool: FAIL\nReason: project root is not set.';
    }

    if (policy === 'read-only' && action === 'write_file') {
      return 'CLI tool: BLOCKED\nReason: policy read-only does not allow write_file.';
    }

    const message = makeToolMessage(call);
    if (!message) {
      return `CLI tool: FAIL\nReason: unsupported action "${action || 'unknown'}".`;
    }

    let result = null;
    if (action === 'run_tests') {
      result = buildDeterministicToolRunTests({ message, projectPath });
    } else if (action === 'verify') {
      result = buildDeterministicToolVerify({ message, projectPath });
    } else if (action === 'read_file') {
      result = buildDeterministicToolReadFile({ message, projectPath });
    } else if (action === 'write_file') {
      result = buildDeterministicToolWriteFile({ message, projectPath });
    }

    if (!result || typeof result !== 'object') {
      return `CLI tool: FAIL\nReason: no deterministic handler for "${action}".`;
    }
    return String(result.content || '').trim() || `CLI tool: FAIL\nReason: empty result for "${action}".`;
  }

  function extractAssistantTextFromReply(reply = null) {
    if (!reply || typeof reply !== 'object') return '';
    const candidates = [
      reply?.response?.message?.content,
      reply?.response?.content,
      reply?.response?.output_text,
      reply?.response?.text,
      reply?.message?.content,
      reply?.content,
      reply?.text
    ];
    for (const candidate of candidates) {
      const text = String(candidate || '').trim();
      if (text) return text;
    }
    return '';
  }

  async function postProcessAssistantText(payload = {}) {
    const config = getConfig();
    const inputText = String(payload?.text || '');
    if (!isEnabled(config)) return { text: inputText, executed: 0 };

    const calls = parseCliToolCalls(inputText, config);
    if (calls.length === 0) return { text: inputText, executed: 0 };

    const streamId = payload?.streamId || null;
    const modelName = String(payload?.modelName || 'assistant');
    const sender = payload?.sender || null;
    const projectPath = String(getProjectPath() || '').trim();

    let out = inputText;
    let executed = 0;
    for (let i = 0; i < calls.length; i += 1) {
      const call = calls[i];
      const action = String(call?.action || 'unknown');
      appendPipelineEvent({
        kind: 'cli.agent.tool.start',
        modelName,
        streamId,
        action,
        index: i + 1,
        total: calls.length
      });
      emitStatus(sender, {
        streamId,
        modelName,
        chunk: `[CLI Agent] running ${action} (${i + 1}/${calls.length})`
      });
      const toolResult = runCliToolCall(call, { config, projectPath });
      out = `${out}\n\n[CLI Agent ${i + 1}]\n${toolResult}`.trim();
      executed += 1;
      appendPipelineEvent({
        kind: 'cli.agent.tool.done',
        modelName,
        streamId,
        action,
        index: i + 1,
        total: calls.length
      });
      emitStatus(sender, {
        streamId,
        modelName,
        chunk: `[CLI Agent] completed ${action} (${i + 1}/${calls.length})`
      });
    }
    return { text: out, executed };
  }

  async function runAutonomousTurn(payload = {}) {
    const config = getConfig();
    const initialText = String(payload?.text || '');
    if (!isEnabled(config)) return { text: initialText, executed: 0, rounds: 0 };

    const sendModelMessage = typeof payload?.sendModelMessage === 'function'
      ? payload.sendModelMessage
      : null;
    if (!sendModelMessage) {
      return { text: initialText, executed: 0, rounds: 0 };
    }

    const modelName = String(payload?.modelName || '').trim();
    const seedHistory = Array.isArray(payload?.history) ? payload.history.slice() : [];
    const sendOptions = payload?.sendOptions && typeof payload.sendOptions === 'object'
      ? { ...payload.sendOptions }
      : {};
    const sender = payload?.sender || null;
    const streamId = payload?.streamId || null;
    const projectPath = String(getProjectPath() || '').trim();
    const userPrompt = String(payload?.userPrompt || '').trim();
    const maxBudget = getStepBudget(config);
    const maxRounds = maxBudget;
    const plannedCalls = extractPlannedCallsFromUserPrompt(userPrompt);
    const completedKeys = new Set();

    let executed = 0;
    let rounds = 0;
    let currentText = initialText;
    let finalText = initialText;
    const history = seedHistory.concat([{ role: 'assistant', content: initialText }]);
    appendPipelineEvent({
      kind: 'cli.agent.loop.start',
      modelName,
      streamId,
      budget: maxBudget
    });

    for (let round = 1; round <= maxRounds; round += 1) {
      const remaining = maxBudget - executed;
      if (remaining <= 0) {
        finalText = `${finalText}\n\n[CLI Agent]\nBudget reached (${maxBudget}).`;
        appendPipelineEvent({
          kind: 'cli.agent.loop.budget',
          modelName,
          streamId,
          budget: maxBudget,
          executed
        });
        break;
      }

      let calls = parseCliToolCalls(currentText, config).slice(0, remaining);
      if (calls.length === 0 && plannedCalls.length > 0) {
        const fallback = plannedCalls.find((call) => !completedKeys.has(callKey(call)));
        if (fallback) calls = [fallback];
      }
      if (calls.length === 0) break;
      rounds += 1;

      const toolResults = [];
      for (let i = 0; i < calls.length; i += 1) {
        const call = calls[i];
        const action = String(call?.action || 'unknown');
        completedKeys.add(callKey(call));
        appendPipelineEvent({
          kind: 'cli.agent.tool.start',
          modelName,
          streamId,
          action,
          round,
          index: i + 1,
          total: calls.length
        });
        emitStatus(sender, {
          streamId,
          modelName: modelName || 'assistant',
          chunk: `[CLI Agent] round ${round}/${maxRounds}: running ${action}`
        });
        const toolResult = runCliToolCall(call, { config, projectPath });
        toolResults.push(`[CLI Agent ${i + 1}]\n${toolResult}`);
        executed += 1;
        appendPipelineEvent({
          kind: 'cli.agent.tool.done',
          modelName,
          streamId,
          action,
          round,
          index: i + 1,
          total: calls.length
        });
        emitStatus(sender, {
          streamId,
          modelName: modelName || 'assistant',
          chunk: `[CLI Agent] round ${round}/${maxRounds}: completed ${action}`
        });
      }

      const toolBundle = toolResults.join('\n\n').trim();
      finalText = `${finalText}\n\n${toolBundle}`.trim();
      history.push({
        role: 'user',
        content: [
          '[CLI Tool Results]',
          toolBundle,
          'Continue the task. If more actions are required, emit CLI_TOOL_JSON lines.'
        ].join('\n\n')
      });

      let reply = null;
      try {
        appendPipelineEvent({
          kind: 'cli.agent.followup.start',
          modelName,
          streamId,
          round
        });
        reply = await sendModelMessage(modelName, history, sendOptions);
      } catch (err) {
        finalText = `${finalText}\n\n[CLI Agent]\nFollow-up model call failed: ${String(err?.message || err)}`;
        appendPipelineEvent({
          kind: 'cli.agent.followup.error',
          modelName,
          streamId,
          round,
          error: String(err?.message || err)
        });
        break;
      }

      if (!reply?.success) {
        finalText = `${finalText}\n\n[CLI Agent]\nFollow-up model call failed: ${String(reply?.message || 'unknown error')}`;
        appendPipelineEvent({
          kind: 'cli.agent.followup.error',
          modelName,
          streamId,
          round,
          error: String(reply?.message || 'unknown error')
        });
        break;
      }
      if (reply?.response?.error) {
        finalText = `${finalText}\n\n[CLI Agent]\nFollow-up model error: ${String(reply.response.error)}`;
        appendPipelineEvent({
          kind: 'cli.agent.followup.error',
          modelName,
          streamId,
          round,
          error: String(reply.response.error)
        });
        break;
      }

      const nextText = extractAssistantTextFromReply(reply);
      if (!nextText) {
        appendPipelineEvent({
          kind: 'cli.agent.followup.empty',
          modelName,
          streamId,
          round
        });
        const fallback = plannedCalls.find((call) => !completedKeys.has(callKey(call)));
        if (fallback) {
          currentText = `CLI_TOOL_JSON: ${JSON.stringify(fallback)}`;
          continue;
        }
        break;
      }

      currentText = nextText;
      history.push({ role: 'assistant', content: nextText });
      finalText = `${finalText}\n\n[Assistant Follow-up ${round}]\n${nextText}`.trim();
      appendPipelineEvent({
        kind: 'cli.agent.followup.done',
        modelName,
        streamId,
        round
      });
    }

    appendPipelineEvent({
      kind: 'cli.agent.loop.done',
      modelName,
      streamId,
      executed,
      rounds
    });

    return {
      text: finalText,
      executed,
      rounds
    };
  }

  return {
    getPolicy,
    getStepBudget,
    isEnabled,
    buildCliAgentSystemPrompt,
    applyCliAgentContext,
    postProcessAssistantText,
    runAutonomousTurn
  };
}

module.exports = createCliAgentTools;
