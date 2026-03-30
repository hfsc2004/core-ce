/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const DEFAULT_CHANNEL_POLICY = Object.freeze({
  flowCondition: 'always',
  when: 'always',
  fromAgentId: '',
  toAgentId: '',
  matchRule: '',
  retryCount: 0,
  timeoutMs: 120000,
  onFailure: 'stop',
  id: null,
  label: ''
});

function normalizeRoutingMode(value) {
  return String(value || '').trim().toLowerCase() === 'static' ? 'static' : 'dynamic';
}

function normalizeRlmAssist(value) {
  return value === true;
}

function buildRoutingConfigMap(items, deployedAgents = []) {
  const map = new Map();
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item || item.type !== 'agent' || !item.id) continue;
    map.set(item.id, {
      routingMode: normalizeRoutingMode(item.routingMode),
      routingRules: Array.isArray(item.routingRules) ? item.routingRules : [],
      rlmAssist: normalizeRlmAssist(item.rlmAssist)
    });
  }
  for (const agent of (Array.isArray(deployedAgents) ? deployedAgents : [])) {
    if (!agent?.id) continue;
    if (!map.has(agent.id)) {
      map.set(agent.id, {
        routingMode: normalizeRoutingMode(agent.routingMode),
        routingRules: Array.isArray(agent.routingRules) ? agent.routingRules : [],
        rlmAssist: normalizeRlmAssist(agent.rlmAssist)
      });
      continue;
    }
    const hit = map.get(agent.id) || {};
    if ((!Array.isArray(hit.routingRules) || hit.routingRules.length === 0) && Array.isArray(agent.routingRules) && agent.routingRules.length > 0) {
      hit.routingRules = agent.routingRules;
    }
    if (!hit.routingMode && agent.routingMode) {
      hit.routingMode = normalizeRoutingMode(agent.routingMode);
    }
    if (typeof hit.rlmAssist !== 'boolean') {
      hit.rlmAssist = normalizeRlmAssist(agent.rlmAssist);
    }
    map.set(agent.id, hit);
  }
  return map;
}

function resolveStaticRouteTarget(rules, currentInput, currentOutput) {
  const list = Array.isArray(rules) ? rules : [];
  if (list.length === 0) return 'end';
  for (const rawRule of list) {
    const matchRaw = String(rawRule?.match || '').trim();
    const targetRaw = String(rawRule?.target || '').trim();
    if (!matchRaw || !targetRaw) continue;
    if (routingRuleMatches(matchRaw, currentInput, currentOutput)) {
      return targetRaw;
    }
  }
  return 'end';
}

function routingRuleMatches(matchRaw, currentInput, currentOutput) {
  const match = String(matchRaw || '').trim();
  if (!match) return false;
  if (match === '*') return true;
  const input = String(currentInput || '');
  const output = String(currentOutput || '');
  const haystacks = [output, input];
  const lowerHaystacks = haystacks.map((v) => v.toLowerCase());
  const matchLower = match.toLowerCase();
  if (matchLower.startsWith('contains:')) {
    const needle = match.slice('contains:'.length).trim().toLowerCase();
    if (!needle) return false;
    return lowerHaystacks.some((value) => value.includes(needle));
  }
  if (matchLower.startsWith('regex:')) {
    const rawPattern = match.slice('regex:'.length).trim();
    const parsed = parseRegexLiteral(rawPattern);
    if (!parsed) return false;
    return haystacks.some((value) => parsed.test(value));
  }
  return lowerHaystacks.some((value) => value.includes(matchLower));
}

function parseRegexLiteral(rawPattern) {
  const raw = String(rawPattern || '').trim();
  const m = raw.match(/^\/(.+)\/([a-z]*)$/i);
  if (!m) return null;
  try {
    return new RegExp(m[1], m[2]);
  } catch {
    return null;
  }
}

function extractDynamicRouteTarget(output) {
  const text = String(output || '');
  const patterns = [
    /(?:NEXT_AGENT|ROUTE_TO|NEXT_HOP)\s*[:=]\s*([^\n\r]+)/i,
    /\[\s*next\s*:\s*([^\]]+)\]/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;
    const value = String(match[1] || '').trim().replace(/^["']|["']$/g, '');
    if (value) return value;
  }
  return '';
}

function resolveTargetToAgentIndex(targetRaw, agents, orderedAgentIds, sequentialIndex) {
  const target = String(targetRaw || '').trim();
  if (!target) {
    return {
      nextIndex: sequentialIndex,
      agentId: Number.isInteger(sequentialIndex) ? orderedAgentIds[sequentialIndex] : null,
      reason: 'default-sequential'
    };
  }
  const normalized = target.toLowerCase();
  if (['next', 'continue', 'sequential'].includes(normalized)) {
    return {
      nextIndex: sequentialIndex,
      agentId: Number.isInteger(sequentialIndex) ? orderedAgentIds[sequentialIndex] : null,
      reason: 'explicit-next'
    };
  }
  if (['end', 'stop', 'finish', 'none'].includes(normalized)) {
    return { nextIndex: null, agentId: null, reason: 'explicit-end' };
  }
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= agents.length) {
    const idx = numeric - 1;
    return { nextIndex: idx, agentId: orderedAgentIds[idx], reason: 'numeric-index' };
  }
  const byIdIndex = orderedAgentIds.findIndex((id) => String(id || '').toLowerCase() === normalized);
  if (byIdIndex >= 0) {
    return { nextIndex: byIdIndex, agentId: orderedAgentIds[byIdIndex], reason: 'agent-id' };
  }
  const byNameIndex = agents.findIndex((agent) => String(agent?.name || '').trim().toLowerCase() === normalized);
  if (byNameIndex >= 0) {
    return { nextIndex: byNameIndex, agentId: orderedAgentIds[byNameIndex], reason: 'agent-name' };
  }
  return {
    nextIndex: sequentialIndex,
    agentId: Number.isInteger(sequentialIndex) ? orderedAgentIds[sequentialIndex] : null,
    reason: 'fallback-sequential'
  };
}

function resolveNextAgentIndex({ currentAgent, currentAgentIndex, currentInput, currentOutput, agents, orderedAgentIds, routingConfigByAgentId }) {
  const sequentialIndex = currentAgentIndex + 1 < agents.length ? currentAgentIndex + 1 : null;
  const cfg = routingConfigByAgentId.get(currentAgent.id) || {};
  const mode = normalizeRoutingMode(cfg.routingMode || currentAgent.routingMode);
  if (mode === 'static') {
    const staticRules = Array.isArray(cfg.routingRules) && cfg.routingRules.length > 0
      ? cfg.routingRules
      : (Array.isArray(currentAgent.routingRules) ? currentAgent.routingRules : []);
    const target = resolveStaticRouteTarget(staticRules, currentInput, currentOutput);
    const resolved = resolveTargetToAgentIndex(target, agents, orderedAgentIds, sequentialIndex);
    return {
      mode: 'static',
      target: target || 'end',
      nextIndex: resolved.nextIndex,
      resolvedAgentId: resolved.agentId,
      reason: resolved.reason
    };
  }
  const target = extractDynamicRouteTarget(currentOutput);
  const resolved = resolveTargetToAgentIndex(target, agents, orderedAgentIds, sequentialIndex);
  return {
    mode: 'dynamic',
    target: target || 'next',
    nextIndex: resolved.nextIndex,
    resolvedAgentId: resolved.agentId,
    reason: resolved.reason
  };
}

function normalizeFlowCondition(value) {
  const flow = String(value || '').trim().toLowerCase();
  if (flow === 'on_success' || flow === 'on_failure' || flow === 'on_match') return flow;
  return 'always';
}

function normalizeFailurePolicy(value) {
  return String(value || '').trim().toLowerCase() === 'continue' ? 'continue' : 'stop';
}

function normalizeRetryCount(value) {
  const retry = Number.parseInt(String(value ?? 0), 10);
  if (!Number.isInteger(retry) || retry < 0) return 0;
  return Math.min(retry, 10);
}

function normalizeTimeoutMs(value, fallbackTimeoutMs) {
  const timeout = Number.parseInt(String(value ?? fallbackTimeoutMs), 10);
  if (!Number.isInteger(timeout) || timeout < 1000) return fallbackTimeoutMs;
  return Math.min(timeout, 600000);
}

function normalizeChannelPolicy(raw, requestTimeout) {
  const mode = String(raw?.mode || 'direct').trim().toLowerCase();
  const normalizedMode = ['direct', 'broadcast', 'group'].includes(mode) ? mode : 'direct';
  const when = normalizeFlowCondition(raw?.when || raw?.flowCondition);
  return {
    ...DEFAULT_CHANNEL_POLICY,
    id: raw?.id || null,
    mode: normalizedMode,
    label: raw?.label || '',
    fromAgentId: String(raw?.fromAgentId || '').trim(),
    toAgentId: String(raw?.toAgentId || '').trim(),
    groupId: String(raw?.groupId || '').trim(),
    when,
    flowCondition: when, // legacy alias
    matchRule: String(raw?.matchRule || '').trim(),
    retryCount: normalizeRetryCount(raw?.retryCount),
    timeoutMs: normalizeTimeoutMs(raw?.timeoutMs, requestTimeout),
    onFailure: normalizeFailurePolicy(raw?.onFailure)
  };
}

function getChannelPoliciesForAgentEdges(agentCount, status, requestTimeout, orderedAgentIds = []) {
  const count = Math.max(0, Number(agentCount || 0) - 1);
  if (count === 0) {
    return {
      sequential: [],
      outgoingByFromAgentId: new Map(),
      edgePolicyByPair: new Map()
    };
  }
  const channels = Array.isArray(status?.channels) ? status.channels : [];
  const sequential = [];
  const outgoingByFromAgentId = new Map();
  const edgePolicyByPair = new Map();

  channels.forEach((raw, idx) => {
    const normalized = normalizeChannelPolicy(raw, requestTimeout);
    const fromId = normalized.fromAgentId;
    const toId = normalized.toAgentId;
    if (fromId && toId) {
      if (!orderedAgentIds.includes(fromId) || !orderedAgentIds.includes(toId)) return;
      const list = outgoingByFromAgentId.get(fromId) || [];
      list.push(normalized);
      outgoingByFromAgentId.set(fromId, list);
      edgePolicyByPair.set(`${fromId}=>${toId}`, normalized);
      return;
    }
    if (idx < count) sequential.push(normalized);
  });

  while (sequential.length < count) {
    sequential.push({ ...DEFAULT_CHANNEL_POLICY });
  }

  return {
    sequential,
    outgoingByFromAgentId,
    edgePolicyByPair
  };
}

function getEdgePolicyForTransition(channelContext, previousAgentId, currentAgentId, previousAgentIndex) {
  const ctx = channelContext || {};
  if (previousAgentId && currentAgentId) {
    const pair = `${previousAgentId}=>${currentAgentId}`;
    if (ctx.edgePolicyByPair instanceof Map && ctx.edgePolicyByPair.has(pair)) {
      return ctx.edgePolicyByPair.get(pair) || DEFAULT_CHANNEL_POLICY;
    }
  }
  if (Number.isInteger(previousAgentIndex) && previousAgentIndex >= 0) {
    const seq = Array.isArray(ctx.sequential) ? ctx.sequential : [];
    if (seq[previousAgentIndex]) return seq[previousAgentIndex];
  }
  return DEFAULT_CHANNEL_POLICY;
}

function resolveChannelConstrainedNext({
  channelContext,
  currentAgentId,
  proposedNextIndex,
  orderedAgentIds,
  agents,
  currentInput,
  currentOutput,
  previousStepSuccess
}) {
  const ctx = channelContext || {};
  const outgoing = (ctx.outgoingByFromAgentId instanceof Map)
    ? (ctx.outgoingByFromAgentId.get(String(currentAgentId || '')) || [])
    : [];
  if (!Array.isArray(outgoing) || outgoing.length === 0) {
    return {
      nextIndex: proposedNextIndex,
      edgePolicy: DEFAULT_CHANNEL_POLICY,
      reason: 'no-explicit-outgoing-channel'
    };
  }

  const proposedAgentId = Number.isInteger(proposedNextIndex) ? orderedAgentIds[proposedNextIndex] : null;
  const orderedCandidates = [];
  if (proposedAgentId) {
    for (const candidate of outgoing) {
      if (String(candidate?.toAgentId || '') === String(proposedAgentId)) {
        orderedCandidates.push(candidate);
      }
    }
  }
  for (const candidate of outgoing) {
    if (!orderedCandidates.includes(candidate)) orderedCandidates.push(candidate);
  }

  for (const candidate of orderedCandidates) {
    if (!shouldPassThroughEdge(candidate, previousStepSuccess, currentInput, currentOutput)) continue;
    let targetAgentId = String(candidate.toAgentId || '');
    if (candidate.mode === 'broadcast') {
      const proposedId = Number.isInteger(proposedNextIndex) ? String(orderedAgentIds[proposedNextIndex] || '') : '';
      targetAgentId = proposedId || String(orderedAgentIds.find((id) => String(id || '') !== String(currentAgentId || '')) || '');
    } else if (candidate.mode === 'group') {
      const groupId = String(candidate.groupId || '').trim();
      const list = Array.isArray(agents) ? agents : [];
      const groupEligible = list.filter((agent) => {
        if (String(agent?.id || '') === String(currentAgentId || '')) return false;
        const groups = Array.isArray(agent?.groups) ? agent.groups.map((g) => String(g || '').trim()) : [];
        return groupId && groups.includes(groupId);
      });
      if (groupEligible.length > 0) {
        targetAgentId = String(groupEligible[0].id || '');
      }
    }
    const idx = orderedAgentIds.findIndex((id) => String(id || '') === targetAgentId);
    if (idx < 0) continue;
    return {
      nextIndex: idx,
      edgePolicy: candidate,
      reason: 'explicit-channel'
    };
  }

  return {
    nextIndex: null,
    edgePolicy: DEFAULT_CHANNEL_POLICY,
    reason: 'explicit-channel-blocked'
  };
}

function shouldPassThroughEdge(edgePolicy, previousStepSuccess, currentInput = '', currentOutput = '') {
  const flow = normalizeFlowCondition(edgePolicy?.when || edgePolicy?.flowCondition);
  if (flow === 'on_success') return previousStepSuccess === true;
  if (flow === 'on_failure') return previousStepSuccess === false;
  if (flow === 'on_match') {
    const rule = String(edgePolicy?.matchRule || '').trim();
    if (!rule) return false;
    if (!String(currentInput || '').trim() && !String(currentOutput || '').trim()) return true;
    return routingRuleMatches(rule, currentInput, currentOutput);
  }
  return true;
}

module.exports = {
  DEFAULT_CHANNEL_POLICY,
  buildRoutingConfigMap,
  resolveNextAgentIndex,
  getChannelPoliciesForAgentEdges,
  getEdgePolicyForTransition,
  resolveChannelConstrainedNext,
  shouldPassThroughEdge
};
