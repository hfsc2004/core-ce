/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const DEFAULT_CHANNEL_POLICY = Object.freeze({
  flowCondition: 'always',
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
  if (flow === 'on_success' || flow === 'on_failure') return flow;
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

function getChannelPoliciesForAgentEdges(agentCount, status, requestTimeout) {
  const count = Math.max(0, Number(agentCount || 0) - 1);
  if (count === 0) return [];
  const channels = Array.isArray(status?.channels) ? status.channels : [];
  const policies = [];
  for (let i = 0; i < count; i++) {
    const c = channels[i] || {};
    policies.push({
      ...DEFAULT_CHANNEL_POLICY,
      id: c.id || null,
      label: c.label || '',
      flowCondition: normalizeFlowCondition(c.flowCondition),
      retryCount: normalizeRetryCount(c.retryCount),
      timeoutMs: normalizeTimeoutMs(c.timeoutMs, requestTimeout),
      onFailure: normalizeFailurePolicy(c.onFailure)
    });
  }
  return policies;
}

function shouldPassThroughEdge(edgePolicy, previousStepSuccess) {
  const flow = normalizeFlowCondition(edgePolicy?.flowCondition);
  if (flow === 'on_success') return previousStepSuccess === true;
  if (flow === 'on_failure') return previousStepSuccess === false;
  return true;
}

module.exports = {
  DEFAULT_CHANNEL_POLICY,
  buildRoutingConfigMap,
  resolveNextAgentIndex,
  getChannelPoliciesForAgentEdges,
  shouldPassThroughEdge
};
