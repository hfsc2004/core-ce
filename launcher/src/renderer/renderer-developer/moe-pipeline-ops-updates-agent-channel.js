/**
 * MoE Pipeline Ops Updates - Agent Channel Source Updates
 * Extracted from moe-pipeline-ops-updates.js
 */
function updateAgentSystemPrompt(agentId, prompt) {
  const agent = window.modelOrderingState.moeItems.find(i => i.id === agentId && i.type === 'agent');
  if (agent) {
    agent.systemPrompt = prompt;
    console.log('[MoE] Updated system prompt:', agentId);
  }
}

function buildCliAgentPromptPresetBlock() {
  return [
    'CLI Agent tool policy:',
    '- Emit CLI tool requests only when needed.',
    '- Output tool calls on separate lines using exact format:',
    '  CLI_TOOL_JSON: {"tool":"run_command|write_file|run_tests|git_diff","args":{...}}',
    '- Allowed args:',
    '  run_command: {"cmd":"<shell command>","cwd":"<relative optional>"}',
    '  run_tests: {"cmd":"<test command>","cwd":"<relative optional>"}',
    '  write_file: {"path":"<relative file path>","content":"<full file content>"}',
    '  git_diff: {"cwd":"<relative optional>"}',
    '- Never wrap CLI_TOOL_JSON in markdown code fences.',
    '- Continue normal response text after tool lines when helpful.'
  ].join('\n');
}

function applyCliAgentPromptPreset(agentId) {
  const agent = window.modelOrderingState.moeItems.find(i => i.id === agentId && i.type === 'agent');
  if (!agent) return;
  const preset = buildCliAgentPromptPresetBlock();
  const current = String(agent.systemPrompt || '');
  if (/CLI_TOOL_JSON\s*:/i.test(current)) {
    return;
  }
  agent.systemPrompt = current.trim()
    ? `${current.trim()}\n\n${preset}`
    : preset;
  if (typeof markMoePipelineConfigChanged === 'function') {
    markMoePipelineConfigChanged('Agent system prompt');
  }
  renderModelOrdering();
}

function updateAgentRoutingRules(agentId, rawRules) {
  const agent = window.modelOrderingState.moeItems.find(i => i.id === agentId && i.type === 'agent');
  if (!agent) return;
  const lines = String(rawRules || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const rules = [];
  for (const line of lines) {
    const splitAt = line.indexOf('=>');
    if (splitAt < 0) continue;
    const match = line.slice(0, splitAt).trim();
    const target = line.slice(splitAt + 2).trim();
    if (!match || !target) continue;
    rules.push({ match, target });
  }
  agent.routingRules = rules;
  console.log('[MoE] Updated routing rules:', agentId, rules.length);
}

function updateChannelDirection(channelId, direction) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    channel.direction = direction;
    console.log('[MoE] Updated channel direction:', channelId, direction);
    renderModelOrdering();
  }
}

function updateChannelMode(channelId, mode) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    const normalized = String(mode || '').trim().toLowerCase();
    channel.mode = ['direct', 'broadcast', 'group'].includes(normalized) ? normalized : 'direct';
    console.log('[MoE] Updated channel mode:', channelId, channel.mode);
    renderModelOrdering();
  }
}

function updateChannelGroupId(channelId, groupId) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    channel.groupId = String(groupId || '').trim();
    console.log('[MoE] Updated channel groupId:', channelId, channel.groupId || '(none)');
  }
}

function normalizeAgentGroups(agent) {
  const groups = Array.isArray(agent?.groups) ? agent.groups : [];
  return groups
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function toggleChannelGroupMember(channelId, agentId, enabled) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (!channel) return;
  const groupId = String(channel.groupId || '').trim();
  if (!groupId) return;
  const agent = window.modelOrderingState.moeItems.find(i => i.id === agentId && i.type === 'agent');
  if (!agent) return;
  const groups = normalizeAgentGroups(agent);
  const has = groups.includes(groupId);
  if (enabled && !has) groups.push(groupId);
  if (!enabled && has) {
    const idx = groups.indexOf(groupId);
    if (idx >= 0) groups.splice(idx, 1);
  }
  agent.groups = groups;
  console.log('[MoE] Updated group membership:', agent.name || agent.id, groupId, enabled ? 'join' : 'leave');
}

function updateChannelFromAgent(channelId, fromAgentId) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    channel.fromAgentId = String(fromAgentId || '').trim();
    console.log('[MoE] Updated channel fromAgentId:', channelId, channel.fromAgentId || '(auto)');
  }
}

function updateChannelToAgent(channelId, toAgentId) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    channel.toAgentId = String(toAgentId || '').trim();
    console.log('[MoE] Updated channel toAgentId:', channelId, channel.toAgentId || '(auto)');
  }
}

function updateChannelWhen(channelId, whenValue) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    const normalized = String(whenValue || '').trim().toLowerCase();
    channel.when = ['always', 'on_success', 'on_failure', 'on_match'].includes(normalized) ? normalized : 'always';
    // Keep legacy field in sync for backward compatibility.
    channel.flowCondition = channel.when;
    console.log('[MoE] Updated channel when:', channelId, channel.when);
    renderModelOrdering();
  }
}

function updateChannelMatchRule(channelId, matchRule) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    channel.matchRule = String(matchRule || '');
    console.log('[MoE] Updated channel matchRule:', channelId, channel.matchRule || '(empty)');
  }
}

function updateChannelFlowCondition(channelId, flowCondition) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    const normalized = String(flowCondition || '').trim().toLowerCase();
    channel.flowCondition = ['always', 'on_success', 'on_failure', 'on_match'].includes(normalized) ? normalized : 'always';
    // Keep new field in sync for newer profiles.
    channel.when = channel.flowCondition;
    console.log('[MoE] Updated channel flow condition:', channelId, channel.flowCondition);
    renderModelOrdering();
  }
}

function updateChannelRetryCount(channelId, retryCount) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    const value = Number.parseInt(String(retryCount), 10);
    channel.retryCount = Number.isInteger(value) && value >= 0 ? Math.min(value, 10) : 0;
    console.log('[MoE] Updated channel retry count:', channelId, channel.retryCount);
  }
}

function updateChannelTimeoutMs(channelId, timeoutMs) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    const value = Number.parseInt(String(timeoutMs), 10);
    channel.timeoutMs = Number.isInteger(value) && value >= 1000 ? Math.min(value, 600000) : 120000;
    console.log('[MoE] Updated channel timeout:', channelId, channel.timeoutMs);
  }
}

function updateChannelFailurePolicy(channelId, policy) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    channel.onFailure = policy === 'continue' ? 'continue' : 'stop';
    console.log('[MoE] Updated channel failure policy:', channelId, channel.onFailure);
    renderModelOrdering();
  }
}

function updateGatewayPosition(gatewayId, position) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (gateway) {
    gateway.position = position;
    console.log('[MoE] Updated gateway position:', gatewayId, position);
    renderModelOrdering();
  }
}

function toggleGatewayAssignedAgent(gatewayId, agentId, enabled) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  if (!Array.isArray(gateway.assignedAgentIds)) gateway.assignedAgentIds = [];
  const id = String(agentId || '').trim();
  if (!id) return;
  const current = gateway.assignedAgentIds
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const set = new Set(current);
  if (enabled === true) set.add(id);
  else set.delete(id);
  gateway.assignedAgentIds = Array.from(set);
  console.log('[MoE] Updated gateway assigned agents:', gatewayId, gateway.assignedAgentIds);
  renderModelOrdering();
}

function toggleGatewaySource(gatewayId, sourceType, enabled) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (gateway && gateway.sources[sourceType]) {
    gateway.sources[sourceType].enabled = enabled;
    console.log('[MoE] Toggled gateway source:', gatewayId, sourceType, enabled);
    renderModelOrdering();
  }
}

function updateGatewaySourceConfig(gatewayId, sourceType, key, value) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (gateway && gateway.sources[sourceType]) {
    gateway.sources[sourceType][key] = value;
    console.log('[MoE] Updated gateway source config:', gatewayId, sourceType, key, value);
    renderModelOrdering();
  }
}


window.updateAgentSystemPrompt = updateAgentSystemPrompt;
window.applyCliAgentPromptPreset = applyCliAgentPromptPreset;
window.updateAgentRoutingRules = updateAgentRoutingRules;
window.updateChannelDirection = updateChannelDirection;
window.updateChannelMode = updateChannelMode;
window.updateChannelGroupId = updateChannelGroupId;
window.toggleChannelGroupMember = toggleChannelGroupMember;
window.updateChannelFromAgent = updateChannelFromAgent;
window.updateChannelToAgent = updateChannelToAgent;
window.updateChannelWhen = updateChannelWhen;
window.updateChannelMatchRule = updateChannelMatchRule;
window.updateChannelFlowCondition = updateChannelFlowCondition;
window.updateChannelRetryCount = updateChannelRetryCount;
window.updateChannelTimeoutMs = updateChannelTimeoutMs;
window.updateChannelFailurePolicy = updateChannelFailurePolicy;
window.updateGatewayPosition = updateGatewayPosition;
window.toggleGatewayAssignedAgent = toggleGatewayAssignedAgent;
window.toggleGatewaySource = toggleGatewaySource;
window.updateGatewaySourceConfig = updateGatewaySourceConfig;
