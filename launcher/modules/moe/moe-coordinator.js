/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ==========================================================================
 * MOE COORDINATOR
 * ==========================================================================
 */

const moeIrg = require('./moe-irg');
const createAgentTransport = require('./moe-coordinator-agents');
const {
  DEFAULT_CHANNEL_POLICY,
  buildRoutingConfigMap,
  resolveNextAgentIndex,
  getChannelPoliciesForAgentEdges,
  getEdgePolicyForTransition,
  resolveChannelConstrainedNext,
  shouldPassThroughEdge
} = require('./moe-coordinator-routing');
const {
  buildEndpointRegistry,
  resolveExecutionTarget,
  startGateway,
  listAvailableSerialPorts,
  getInputGateway,
  getAnyEnabledIrgGateway,
  normalizeIrgEntryMode,
  normalizeIrgModeOverride,
  isLikelyHardwareIntent,
  buildHardwarePlanContext
} = require('./moe-coordinator-gateways');
const {
  buildAgentRlmAssistContext,
  getRlmAttachmentSessionsForAgent,
  collectRlmAttachmentEvidenceFromStore
} = require('./moe-coordinator-rlm');
const {
  rerunLastIrgInternal,
  runIrgContractInternal
} = require('./moe-coordinator-irg-replay');

let deploymentManager = null;
let deterministicToolsRuntime = null;
let attachmentStore = null;
const gatewayRuntime = new Map();
let lastIrgReplay = null;

const REQUEST_TIMEOUT = 120000;

const transport = createAgentTransport({ requestTimeout: REQUEST_TIMEOUT });

function initialize(deployment, options = {}) {
  deploymentManager = deployment;
  deterministicToolsRuntime = options?.deterministicToolsRuntime || null;
  attachmentStore = options?.attachmentStore || null;
  gatewayRuntime.clear();
  lastIrgReplay = null;
  console.log('[MoE Coordinator] Initialized');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeAgentOutputForHandoff(value) {
  let text = String(value || '');
  if (!text) return '';
  // Prevent recursive prompt-echo loops across hops.
  text = text.replace(
    /\n*Previous agents in the chain have provided the following context:[\s\S]*$/i,
    ''
  );
  // UI marker occasionally echoed by weaker models.
  text = text.replace(/\n*Handoff payload \(input to this agent\)[\s\S]*$/i, '');
  return text.trim();
}

function extractSection(text, heading) {
  const source = String(text || '');
  if (!source) return '';
  const escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Z_][A-Z0-9_ ]*:\\s*|$)`, 'i');
  const match = source.match(pattern);
  return String(match?.[1] || '').trim();
}

function buildStructuredUpdateFromStep(outputText) {
  const out = String(outputText || '');
  if (!out) return {};
  const update = {};
  const motion = extractSection(out, 'MOTION');
  const forCase = extractSection(out, 'FOR_CASE');
  const risks = extractSection(out, 'RISKS');
  const amendment = extractSection(out, 'AMENDMENT');
  const plan = extractSection(out, 'PLAN');
  const safetyCheck = extractSection(out, 'SAFETY_CHECK');
  const rationale = extractSection(out, 'RATIONALE');
  const requiredGuardrail = extractSection(out, 'REQUIRED_GUARDRAIL');
  if (motion) update.MOTION = motion;
  if (forCase) update.FOR_CASE = forCase;
  if (risks) update.RISKS = risks;
  if (amendment) update.AMENDMENT = amendment;
  if (plan) update.PLAN = plan;
  if (safetyCheck) update.SAFETY_CHECK = safetyCheck;
  if (rationale) update.RATIONALE = rationale;
  if (requiredGuardrail) update.REQUIRED_GUARDRAIL = requiredGuardrail;
  return update;
}

function buildStructuredContextText(record = {}) {
  const fields = [
    `MOTION: ${record.MOTION || 'N/A'}`,
    `FOR_CASE: ${record.FOR_CASE || 'N/A'}`,
    `RISKS: ${record.RISKS || 'N/A'}`,
    `AMENDMENT: ${record.AMENDMENT || 'N/A'}`,
    `PLAN: ${record.PLAN || 'N/A'}`,
    `SAFETY_CHECK: ${record.SAFETY_CHECK || 'N/A'}`,
    `RATIONALE: ${record.RATIONALE || 'N/A'}`,
    `REQUIRED_GUARDRAIL: ${record.REQUIRED_GUARDRAIL || 'N/A'}`
  ];
  return fields.join('\n');
}

function normalizeToolName(value) {
  return String(value || '').trim().toLowerCase();
}

function extractAgentToolCapabilities(agent = {}) {
  const caps = {
    pipelineStateRead: false,
    pipelineStateWrite: false
  };
  const tools = Array.isArray(agent?.tools) ? agent.tools : [];
  for (const entry of tools) {
    if (typeof entry === 'string') {
      const name = normalizeToolName(entry);
      if (name === 'pipeline_state' || name === 'pipeline-state') {
        caps.pipelineStateRead = true;
        caps.pipelineStateWrite = true;
      } else if (name === 'pipeline_state:read' || name === 'pipeline-state:read') {
        caps.pipelineStateRead = true;
      } else if (name === 'pipeline_state:write' || name === 'pipeline-state:write') {
        caps.pipelineStateWrite = true;
      }
      continue;
    }
    if (entry && typeof entry === 'object') {
      const name = normalizeToolName(entry.name || entry.id || entry.tool || '');
      if (name === 'pipeline_state' || name === 'pipeline-state') {
        if (entry.read === false && entry.write === false) continue;
        if (entry.read === true || entry.read == null) caps.pipelineStateRead = true;
        if (entry.write === true || entry.write == null) caps.pipelineStateWrite = true;
      }
    }
  }
  return caps;
}

function parsePipelineStateGetKeys(text) {
  const raw = String(text || '');
  if (!raw) return [];
  const keys = [];
  const regex = /PIPE_STATE_GET\s*:\s*(.+)$/gim;
  let match = regex.exec(raw);
  while (match) {
    const payload = String(match[1] || '').trim();
    if (payload) {
      if (payload.startsWith('{') || payload.startsWith('[')) {
        try {
          const parsed = JSON.parse(payload);
          if (Array.isArray(parsed)) {
            for (const row of parsed) {
              const key = String(row || '').trim();
              if (key) keys.push(key);
            }
          } else if (parsed && typeof parsed === 'object') {
            const list = Array.isArray(parsed.keys) ? parsed.keys : [];
            for (const row of list) {
              const key = String(row || '').trim();
              if (key) keys.push(key);
            }
          }
        } catch {
          for (const part of payload.split(',')) {
            const key = String(part || '').trim();
            if (key) keys.push(key);
          }
        }
      } else {
        for (const part of payload.split(',')) {
          const key = String(part || '').trim();
          if (key) keys.push(key);
        }
      }
    }
    match = regex.exec(raw);
  }
  return Array.from(new Set(keys));
}

function parsePipelineStateSetOps(text) {
  const raw = String(text || '');
  if (!raw) return [];
  const ops = [];
  const regex = /PIPE_STATE_SET\s*:\s*(.+)$/gim;
  let match = regex.exec(raw);
  while (match) {
    const payload = String(match[1] || '').trim();
    if (!payload) {
      match = regex.exec(raw);
      continue;
    }
    if (payload.startsWith('{')) {
      try {
        const parsed = JSON.parse(payload);
        if (parsed && typeof parsed === 'object') {
          const key = String(parsed.key || '').trim();
          const value = parsed.value != null ? String(parsed.value) : '';
          if (key) ops.push({ key, value });
        }
      } catch {
        // ignore malformed json
      }
      match = regex.exec(raw);
      continue;
    }
    const eqIndex = payload.indexOf('=');
    if (eqIndex > 0) {
      const key = payload.slice(0, eqIndex).trim();
      const value = payload.slice(eqIndex + 1).trim();
      if (key) ops.push({ key, value });
    }
    match = regex.exec(raw);
  }
  return ops;
}

function buildPipelineStateReadContext(keys = [], store = null) {
  const list = Array.isArray(keys) ? keys : [];
  if (!store || !(store instanceof Map) || list.length === 0) return '';
  const lines = [];
  for (const key of list) {
    const val = store.has(key) ? String(store.get(key)) : 'N/A';
    lines.push(`${key}=${val}`);
  }
  return lines.join('\n');
}

function rememberLastIrgExecution({ contract, gatewayConfig } = {}) {
  if (!contract || !gatewayConfig) return;
  lastIrgReplay = {
    contract: deepClone(contract),
    gatewayConfig: deepClone(gatewayConfig),
    capturedAt: new Date().toISOString()
  };
}

async function routeMessage(userMessage, options = {}) {
  if (!deploymentManager || !deploymentManager.isActive()) {
    return { success: false, error: 'No active MoE deployment' };
  }

  const agents = deploymentManager.getAgentsInOrder();
  if (agents.length === 0) {
    return { success: false, error: 'No agents in pipeline' };
  }

  const hardwareIntent = isLikelyHardwareIntent(userMessage);
  const inputGateway = getInputGateway(deploymentManager);
  const irgGateway = inputGateway || (hardwareIntent ? getAnyEnabledIrgGateway(deploymentManager) : null);
  if (irgGateway && !gatewayRuntime.has(irgGateway.id)) {
    gatewayRuntime.set(irgGateway.id, startGateway(irgGateway));
  }

  const irgEntryMode = normalizeIrgEntryMode(irgGateway?.irg?.entryMode);
  const irgModeOverride = normalizeIrgModeOverride(options?.irgModeOverride);
  let forceLlmIrgRefinement = false;
  let deterministicDraftResult = null;

  if (irgGateway && irgEntryMode === 'deterministic-first') {
    const irgResult = await moeIrg.tryHandleGatewayRequest({
      message: userMessage,
      gatewayConfig: irgGateway,
      llmPlan: '',
      requireLlmPlan: false,
      modeOverride: irgModeOverride
    });
    if (irgResult.handled) {
      if (irgResult.needsLlmRefinement === true) {
        forceLlmIrgRefinement = true;
        deterministicDraftResult = irgResult;
      } else {
      if (irgResult.success) {
        rememberLastIrgExecution({
          contract: irgResult.contract || null,
          gatewayConfig: irgGateway
        });
      }
      const trace = {
        conversationId: options.conversationId || `conv-${Date.now()}`,
        startedAt: new Date().toISOString(),
        steps: [{
          agentId: 'irg-gateway',
          agentName: irgGateway.name || 'IRG Gateway',
          modelName: 'deterministic-irg',
          input: String(userMessage || '').slice(0, 200),
          output: irgResult.response,
          durationMs: 0,
          success: !!irgResult.success
        }],
        finalResponse: irgResult.response,
        completedAt: new Date().toISOString(),
        totalDurationMs: 0,
        mode: 'irg-deterministic'
      };
      return {
        success: !!irgResult.success,
        response: irgResult.response,
        trace,
        error: irgResult.success ? undefined : (String(irgResult.response || '').trim() || 'IRG error'),
        irg: {
          handled: true,
          contract: irgResult.contract || null,
          execution: irgResult.execution || null
        }
      };
      }
    }
  }

  const deploymentStatus = deploymentManager?.getStatus?.() || null;
  const orderedAgentIds = agents.map((agent) => agent.id);
  const channelPolicyContext = getChannelPoliciesForAgentEdges(
    agents.length,
    deploymentStatus,
    REQUEST_TIMEOUT,
    orderedAgentIds
  );
  const routingConfigByAgentId = buildRoutingConfigMap(deploymentStatus?.config?.items, agents);
  const endpointRegistry = buildEndpointRegistry(deploymentStatus?.config, agents);
  const maxHops = Math.max(8, agents.length * 4);

  const trace = {
    conversationId: options.conversationId || `conv-${Date.now()}`,
    startedAt: new Date().toISOString(),
    steps: [],
    finalResponse: null,
    deterministicTools: {
      enabled: !!deterministicToolsRuntime
    },
    pipelineState: {}
  };
  if (forceLlmIrgRefinement && deterministicDraftResult) {
    trace.steps.push({
      agentId: 'irg-gateway',
      agentName: irgGateway?.name || 'IRG Gateway',
      modelName: 'deterministic-irg',
      input: String(userMessage || '').slice(0, 200),
      output: deterministicDraftResult.response,
      durationMs: 0,
      success: false,
      route: {
        mode: 'llm-refinement-required',
        reason: Array.isArray(deterministicDraftResult?.analysis?.gaps)
          ? deterministicDraftResult.analysis.gaps.join(', ')
          : 'coverage-gaps'
      }
    });
  }

  let currentContext = userMessage;
  const pipelineState = new Map();
  const structuredRecord = {
    MOTION: '',
    FOR_CASE: '',
    RISKS: '',
    AMENDMENT: '',
    PLAN: '',
    SAFETY_CHECK: '',
    RATIONALE: '',
    REQUIRED_GUARDRAIL: ''
  };
  let previousResponses = [];
  let previousStepSuccess = true;
  let currentAgentIndex = 0;
  let previousAgentIndex = -1;
  let previousAgentId = null;
  let pendingEdgePolicy = DEFAULT_CHANNEL_POLICY;
  let hops = 0;

  try {
    while (currentAgentIndex >= 0 && currentAgentIndex < agents.length && hops < maxHops) {
      const agent = agents[currentAgentIndex];
      const isLast = (currentAgentIndex === agents.length - 1);
      const edgePolicy = previousAgentIndex >= 0
        ? (pendingEdgePolicy || getEdgePolicyForTransition(channelPolicyContext, previousAgentId, agent.id, previousAgentIndex))
        : DEFAULT_CHANNEL_POLICY;

      if (previousAgentIndex >= 0 && !shouldPassThroughEdge(edgePolicy, previousStepSuccess)) {
        trace.steps.push({
          agentId: `channel-${edgePolicy.id || previousAgentIndex}`,
          agentName: edgePolicy.label || 'Channel Gate',
          modelName: 'channel-control',
          input: String(currentContext || '').slice(0, 200),
          output: `Skipped downstream routing due to flowCondition=${edgePolicy.flowCondition}`,
          durationMs: 0,
          success: true
        });
        break;
      }

      hops += 1;
      const rlmAssistContext = await buildAgentRlmAssistContext({
        agent,
        currentInput: currentContext,
        routingConfigByAgentId,
        deterministicToolsRuntime,
        attachmentStore
      });

      const messages = transport.buildAgentMessages(
        agent,
        currentContext,
        previousResponses,
        isLast,
        {
          includeHardwarePlanContext:
            currentAgentIndex === 0 &&
            !!irgGateway &&
            hardwareIntent,
          hardwarePlanContext: currentAgentIndex === 0 ? buildHardwarePlanContext(irgGateway) : '',
          rlmAssistContext,
          pipelineStateToolCapabilities: extractAgentToolCapabilities(agent),
          pipelineStateReadContext: buildPipelineStateReadContext(
            parsePipelineStateGetKeys(`${agent?.systemPrompt || ''}\n${currentContext || ''}`),
            pipelineState
          ),
          structuredRecordContext:
            String(agent?.name || '').trim().toLowerCase() === 'clerk'
              ? buildStructuredContextText(structuredRecord)
              : ''
        }
      );

      const stepStart = Date.now();
      const resolvedExecution = resolveExecutionTarget(agent, endpointRegistry);
      const response = await transport.callAgentWithPolicy(
        resolvedExecution.agent,
        messages,
        edgePolicy
      );
      const stepDuration = Date.now() - stepStart;
      const normalizedOutput = sanitizeAgentOutputForHandoff(response?.content);
      if (resolvedExecution.worker && endpointRegistry?.enabled) {
        endpointRegistry.reportResult(resolvedExecution.worker.id, {
          success: !!response?.success,
          latencyMs: stepDuration,
          error: response?.error || ''
        });
      }

      const step = {
        agentId: agent.id,
        agentName: agent.name,
        modelName: agent.modelName,
        input: String(currentContext || '').substring(0, 200),
        output: normalizedOutput || response.content,
        durationMs: stepDuration,
        success: response.success,
        attempts: response.attempts || 1,
        execution: resolvedExecution.meta || null,
        rlmAssistApplied: rlmAssistContext.length > 0,
        rlmAssistContextChars: rlmAssistContext.length,
        pipelineStateOps: []
      };
      const toolCaps = extractAgentToolCapabilities(agent);
      if (toolCaps.pipelineStateWrite) {
        const setOps = parsePipelineStateSetOps(normalizedOutput || response.content);
        for (const op of setOps) {
          pipelineState.set(op.key, op.value);
          step.pipelineStateOps.push({ op: 'set', key: op.key, valuePreview: String(op.value).slice(0, 80) });
        }
      }
      trace.steps.push(step);

      if (options.onAgentResponse) {
        options.onAgentResponse(step, currentAgentIndex, agents.length);
      }

      if (!response.success) {
        previousStepSuccess = false;
        if (edgePolicy.onFailure === 'continue') {
      const failConstrained = resolveChannelConstrainedNext({
        channelContext: channelPolicyContext,
        currentAgentId: agent.id,
        proposedNextIndex: (currentAgentIndex + 1 < agents.length) ? currentAgentIndex + 1 : null,
        orderedAgentIds,
        agents,
        currentInput: step.input,
        currentOutput: String(response.error || ''),
        previousStepSuccess: false
      });
          if (!Number.isInteger(failConstrained.nextIndex)) break;
          previousAgentIndex = currentAgentIndex;
          previousAgentId = agent.id;
          pendingEdgePolicy = failConstrained.edgePolicy || DEFAULT_CHANNEL_POLICY;
          currentAgentIndex = failConstrained.nextIndex;
          continue;
        }
        trace.error = `Agent ${agent.name} failed: ${response.error}`;
        return { success: false, trace, error: trace.error };
      }

      previousResponses.push({ agent: agent.name, response: normalizedOutput || response.content });
      Object.assign(structuredRecord, buildStructuredUpdateFromStep(normalizedOutput || response.content));
      currentContext = normalizedOutput || response.content;
      previousStepSuccess = true;

      const routeDecision = resolveNextAgentIndex({
        currentAgent: agent,
        currentAgentIndex,
        currentInput: step.input,
        currentOutput: normalizedOutput || response.content,
        agents,
        orderedAgentIds,
        routingConfigByAgentId
      });
      step.route = routeDecision;
      const constrained = resolveChannelConstrainedNext({
        channelContext: channelPolicyContext,
        currentAgentId: agent.id,
        proposedNextIndex: routeDecision.nextIndex,
        orderedAgentIds,
        agents,
        currentInput: step.input,
        currentOutput: normalizedOutput || response.content,
        previousStepSuccess: true
      });
      step.channel = {
        reason: constrained.reason,
        fromAgentId: agent.id,
        toAgentId: Number.isInteger(constrained.nextIndex) ? orderedAgentIds[constrained.nextIndex] : null
      };
      if (!Number.isInteger(constrained.nextIndex)) break;
      previousAgentIndex = currentAgentIndex;
      previousAgentId = agent.id;
      pendingEdgePolicy = constrained.edgePolicy || DEFAULT_CHANNEL_POLICY;
      currentAgentIndex = constrained.nextIndex;
    }

    if (hops >= maxHops) {
      trace.steps.push({
        agentId: 'routing-guard',
        agentName: 'Routing Guard',
        modelName: 'coordinator',
        input: String(currentContext || '').slice(0, 200),
        output: `Stopped after ${maxHops} hops to prevent routing loop.`,
        durationMs: 0,
        success: false
      });
      trace.error = `Routing loop guard triggered after ${maxHops} hops`;
      return { success: false, trace, error: trace.error };
    }

    trace.finalResponse = currentContext;
    trace.pipelineState = Object.fromEntries(pipelineState.entries());
    trace.completedAt = new Date().toISOString();
    trace.totalDurationMs = trace.steps.reduce((sum, s) => sum + s.durationMs, 0);

    const shouldRunPostLlmIrg =
      !!irgGateway &&
      hardwareIntent;
    if (shouldRunPostLlmIrg) {
      const llmPlan = String(trace.finalResponse || '').trim();
      const strictLlmPlan = irgGateway?.irg?.requireLlmPlanForLive === true || forceLlmIrgRefinement;
      const irgResult = await moeIrg.tryHandleGatewayRequest({
        message: String(userMessage || '').trim(),
        gatewayConfig: irgGateway,
        llmPlan,
        requireLlmPlan: strictLlmPlan,
        modeOverride: irgModeOverride
      });
      if (irgResult.handled) {
        trace.steps.push({
          agentId: 'irg-gateway',
          agentName: irgGateway.name || 'IRG Gateway',
          modelName: 'deterministic-irg',
          input: String(userMessage || '').trim().slice(0, 200),
          output: irgResult.response,
          durationMs: 0,
          success: !!irgResult.success
        });
        trace.finalResponse = irgResult.response;
        trace.mode = forceLlmIrgRefinement
          ? 'deterministic-first+llm-refined+irg'
          : (irgEntryMode === 'llm-plan-first'
            ? 'llm-plan-first+irg'
            : 'deterministic-first+llm-plan+irg');
        if (!irgResult.success) {
          trace.error = String(irgResult.response || 'IRG error');
          return {
            success: false,
            response: irgResult.response,
            trace,
            error: String(irgResult.response || 'IRG error'),
            irg: {
              handled: true,
              contract: irgResult.contract || null,
              execution: irgResult.execution || null
            }
          };
        }
        rememberLastIrgExecution({
          contract: irgResult.contract || null,
          gatewayConfig: irgGateway
        });
        return {
          success: true,
          response: irgResult.response,
          trace,
          irg: {
            handled: true,
            contract: irgResult.contract || null,
            execution: irgResult.execution || null
          }
        };
      }
      const llmPlanPreview = llmPlan.length > 700 ? `${llmPlan.slice(0, 700)}...` : llmPlan;
      const parseError =
        'Error\n' +
        'Reason: LLM returned a hardware plan that did not map to an allowed deterministic action schema.\n' +
        'Expected prefix/schema: IRG_PLAN_JSON: {"action":"<allowed_action>","params":{...}} (allowed: blink_gpio, blink_color_sequence, blink_color_group, blink_pattern_sequence, blink_multi_phase, push_esp32_code)\n' +
        `LLM output (preview):\n${llmPlanPreview}`;
      trace.steps.push({
        agentId: 'irg-gateway',
        agentName: irgGateway.name || 'IRG Gateway',
        modelName: 'deterministic-irg',
        input: String(userMessage || '').trim().slice(0, 200),
        output: parseError,
        durationMs: 0,
        success: false
      });
      trace.finalResponse = parseError;
      trace.error = parseError;
      return {
        success: false,
        response: parseError,
        trace,
        error: parseError,
        irg: {
          handled: false,
          contract: null,
          execution: null
        }
      };
    }

    return { success: true, response: trace.finalResponse, trace };
  } catch (err) {
    trace.error = err.message;
    return { success: false, trace, error: err.message };
  }
}


async function rerunLastIrg(options = {}) {
  return rerunLastIrgInternal({
    lastIrgReplay,
    moeIrg,
    normalizeIrgModeOverride,
    rememberLastIrgExecution,
    options
  });
}

async function runIrgContract(contractInput, options = {}) {
  return runIrgContractInternal({
    contractInput,
    options,
    getInputGateway: () => getInputGateway(deploymentManager),
    getAnyEnabledIrgGateway: () => getAnyEnabledIrgGateway(deploymentManager),
    moeIrg,
    normalizeIrgModeOverride,
    rememberLastIrgExecution,
    getLastIrgReplay: () => lastIrgReplay
  });
}

async function sendToAgent(agentId, message, options = {}) {
  const agent = deploymentManager?.getAgent(agentId);
  if (!agent) return { success: false, error: `Agent not found: ${agentId}` };

  const rlmAssistContext = await buildAgentRlmAssistContext({
    agent,
    currentInput: message,
    routingConfigByAgentId: new Map([[agent.id, { rlmAssist: agent.rlmAssist === true }]]),
    deterministicToolsRuntime,
    attachmentStore
  });

  const messages = [];
  if (agent.systemPrompt) messages.push({ role: 'system', content: agent.systemPrompt });
  if (rlmAssistContext) {
    messages.push({
      role: 'system',
      content:
        `RLM assist context for this hop:\n${String(rlmAssistContext)}\n\n` +
        `Use it as grounding context. If it conflicts with explicit user intent, follow user intent.`
    });
  }
  messages.push({ role: 'user', content: message });

  return transport.callAgent(agent, messages);
}

async function pingAgent(agentId) {
  const agent = deploymentManager?.getAgent(agentId);
  return transport.pingAgent(agent);
}

async function pingAllAgents() {
  const agents = deploymentManager?.getAgentsInOrder() || [];
  const results = {};

  for (const agent of agents) {
    results[agent.id] = await pingAgent(agent.id);
    results[agent.id].name = agent.name;
  }

  return results;
}

module.exports = {
  initialize,
  routeMessage,
  sendToAgent,
  pingAgent,
  pingAllAgents,
  rerunLastIrg,
  runIrgContract,
  listAvailableSerialPorts,
  startGateway,
  REQUEST_TIMEOUT,
  __test: {
    getRlmAttachmentSessionsForAgent,
    collectRlmAttachmentEvidenceFromStore
  }
};
