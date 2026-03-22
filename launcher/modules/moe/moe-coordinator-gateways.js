/**
 * MoE coordinator gateway + endpoint helpers.
 */

const moeIrg = require('./moe-irg');
const gatewayAdapters = require('./moe-gateway-adapters');
const endpointRegistryModule = require('./moe-endpoint-registry');

function buildEndpointRegistry(config, agents) {
  const registryConfig = config?.endpointRegistry;
  if (!registryConfig || registryConfig.enabled !== true) {
    return endpointRegistryModule.createEndpointRegistry({ enabled: false }, agents);
  }
  return endpointRegistryModule.createEndpointRegistry(registryConfig, agents);
}

function resolveExecutionTarget(agent, endpointRegistry, requestTimeout) {
  if (!endpointRegistry?.enabled) {
    return {
      agent,
      worker: null,
      meta: {
        mode: 'local-direct',
        reason: 'registry-disabled',
        role: null,
        workerId: null,
        endpoint: agent?.endpoint || null
      }
    };
  }

  const worker = endpointRegistry.resolveForAgent(agent, { timeoutMs: requestTimeout });
  if (!worker?.endpoint) {
    return {
      agent,
      worker: null,
      meta: {
        mode: 'local-direct',
        reason: 'no-worker-match',
        role: null,
        workerId: null,
        endpoint: agent?.endpoint || null
      }
    };
  }

  return {
    worker,
    agent: {
      ...agent,
      endpoint: worker.endpoint,
      modelId: worker.modelId || agent.modelId,
      modelName: worker.modelName || agent.modelName
    },
    meta: {
      mode: 'registry-worker',
      reason: worker.source || 'registry',
      role: worker.role || null,
      workerId: worker.id || null,
      endpoint: worker.endpoint
    }
  };
}

function startGateway(gatewayConfig) {
  const runtime = gatewayAdapters.buildGatewayRuntime(gatewayConfig);
  if (runtime?.serial?.warning) {
    console.warn(`[MoE Coordinator] ${runtime.serial.warning}`);
  }

  return {
    ...runtime,
    message: 'Gateway initialized',
    irgPolicy: moeIrg.mergePolicy(gatewayConfig)
  };
}

function listAvailableSerialPorts() {
  return gatewayAdapters.listSerialPorts();
}

function getInputGateway(deploymentManager) {
  if (!deploymentManager?.isActive?.()) return null;
  const status = deploymentManager.getStatus?.();
  const bindings = collectEnabledBindings(status?.bindings);
  const gateways = Object.entries(status?.gateways || {});
  for (const [id, gateway] of gateways) {
    if ((gateway?.position || '').toLowerCase() !== 'input') continue;
    return { id, ...gateway, bindings };
  }
  return null;
}

function getAnyEnabledIrgGateway(deploymentManager) {
  if (!deploymentManager?.isActive?.()) return null;
  const status = deploymentManager.getStatus?.();
  const bindings = collectEnabledBindings(status?.bindings);
  const gateways = Object.entries(status?.gateways || {});
  for (const [id, gateway] of gateways) {
    if (!gateway || gateway.enabled === false) continue;
    if (gateway?.irg?.enabled === false) continue;
    return { id, ...gateway, bindings };
  }
  return null;
}

function collectEnabledBindings(blocks) {
  const out = [];
  const list = Array.isArray(blocks) ? blocks : [];
  for (const block of list) {
    if (!block || block.enabled === false) continue;
    const entries = Array.isArray(block.entries) ? block.entries : [];
    for (const entry of entries) {
      const key = String(entry?.key || '').trim();
      if (!key) continue;
      out.push({
        key,
        value: String(entry?.value ?? ''),
        source: block.name || block.id || 'bindings'
      });
    }
  }
  return out;
}

function normalizeIrgEntryMode(value) {
  return String(value || '').trim().toLowerCase() === 'llm-plan-first'
    ? 'llm-plan-first'
    : 'deterministic-first';
}

function normalizeIrgModeOverride(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'simulate' || mode === 'live' || mode === 'disabled') return mode;
  return '';
}

function isLikelyHardwareIntent(message) {
  const text = String(message || '').toLowerCase();
  return /(pico|raspberry pi|esp32|arduino|gpio|serial|blink|flash|upload|plc|microcontroller|firmware|pin)/.test(text);
}

function buildHardwarePlanContext(gateway) {
  const serial = gateway?.sources?.serial || {};
  const irg = gateway?.irg || {};
  const bindings = Array.isArray(gateway?.bindings) ? gateway.bindings : [];
  const bindingLines = bindings.length > 0
    ? bindings.map((entry) => `- ${entry.key}=${entry.value}`).join('\n')
    : '- (none)';
  return [
    `gateway.name=${gateway?.name || 'input-gateway'}`,
    `gateway.position=${gateway?.position || 'input'}`,
    `serial.enabled=${serial?.enabled === true}`,
    `serial.port=${serial?.port || 'auto'}`,
    `serial.baudRate=${serial?.baudRate || 115200}`,
    `irg.executeMode=${irg?.executeMode || 'live'}`,
    `irg.allowedActions=blink_gpio|blink_color_sequence|blink_color_group|blink_pattern_sequence|blink_multi_phase|push_esp32_code`,
    `irg.jsonSchema=IRG_PLAN_JSON: {"action":"...","params":{...}}`,
    'bindings:',
    bindingLines
  ].join('\n');
}

module.exports = {
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
};
