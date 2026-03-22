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

function updateChannelFlowCondition(channelId, flowCondition) {
  const channel = window.modelOrderingState.moeItems.find(i => i.id === channelId && i.type === 'channel');
  if (channel) {
    channel.flowCondition = flowCondition;
    console.log('[MoE] Updated channel flow condition:', channelId, flowCondition);
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
window.updateAgentRoutingRules = updateAgentRoutingRules;
window.updateChannelDirection = updateChannelDirection;
window.updateChannelFlowCondition = updateChannelFlowCondition;
window.updateChannelRetryCount = updateChannelRetryCount;
window.updateChannelTimeoutMs = updateChannelTimeoutMs;
window.updateChannelFailurePolicy = updateChannelFailurePolicy;
window.updateGatewayPosition = updateGatewayPosition;
window.toggleGatewaySource = toggleGatewaySource;
window.updateGatewaySourceConfig = updateGatewaySourceConfig;
