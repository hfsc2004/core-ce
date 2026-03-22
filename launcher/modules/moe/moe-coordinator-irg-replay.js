/**
 * MoE coordinator IRG contract replay helpers.
 */

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function rerunLastIrgInternal({ lastIrgReplay, moeIrg, normalizeIrgModeOverride, rememberLastIrgExecution, options = {} }) {
  if (!lastIrgReplay?.contract || !lastIrgReplay?.gatewayConfig) {
    return {
      success: false,
      error: 'No prior IRG execution available to rerun.'
    };
  }
  const contract = deepClone(lastIrgReplay.contract);
  const gatewayConfig = deepClone(lastIrgReplay.gatewayConfig);
  const modeOverride = normalizeIrgModeOverride(options?.irgModeOverride);
  const planPayload = {
    contractVersion: contract.contractVersion || '1.0',
    target: contract.target || 'raspberry-pi-pico',
    action: contract.action,
    params: contract.params
  };
  const irgResult = await moeIrg.tryHandleGatewayRequest({
    message: '',
    gatewayConfig,
    llmPlan: `IRG_PLAN_JSON: ${JSON.stringify(planPayload)}`,
    requireLlmPlan: false,
    modeOverride
  });
  if (!irgResult.handled) {
    return {
      success: false,
      error: 'No replayable IRG contract available.'
    };
  }
  if (!irgResult.success) {
    return {
      success: false,
      response: irgResult.response,
      error: String(irgResult.response || 'IRG replay error')
    };
  }
  rememberLastIrgExecution({
    contract: irgResult.contract || contract,
    gatewayConfig
  });
  const trace = {
    conversationId: options.conversationId || `replay-${Date.now()}`,
    startedAt: new Date().toISOString(),
    steps: [{
      agentId: 'irg-gateway',
      agentName: gatewayConfig.name || 'IRG Gateway',
      modelName: 'deterministic-irg-replay',
      input: 'Rerun last IRG execution',
      output: irgResult.response,
      durationMs: 0,
      success: true,
      route: {
        mode: 'irg-replay',
        reason: 'replayed-last-contract'
      }
    }],
    finalResponse: irgResult.response,
    completedAt: new Date().toISOString(),
    totalDurationMs: 0,
    mode: 'irg-replay'
  };
  return {
    success: true,
    response: irgResult.response,
    trace,
    irg: {
      handled: true,
      contract: irgResult.contract || contract,
      execution: irgResult.execution || null,
      replayed: true,
      capturedAt: lastIrgReplay?.capturedAt || null
    }
  };
}

async function runIrgContractInternal({ contractInput, options = {}, getInputGateway, getAnyEnabledIrgGateway, moeIrg, normalizeIrgModeOverride, rememberLastIrgExecution, getLastIrgReplay }) {
  const contract = deepClone(contractInput || {});
  if (!contract || typeof contract !== 'object' || !contract.action || !contract.params) {
    return {
      success: false,
      error: 'Invalid contract payload.'
    };
  }
  const gatewayConfig = getInputGateway() || getAnyEnabledIrgGateway();
  if (!gatewayConfig) {
    return {
      success: false,
      error: 'No active IRG gateway available.'
    };
  }
  const modeOverride = normalizeIrgModeOverride(options?.irgModeOverride);
  const planPayload = {
    action: contract.action,
    params: contract.params
  };
  const irgResult = await moeIrg.tryHandleGatewayRequest({
    message: '',
    gatewayConfig,
    llmPlan: `IRG_PLAN_JSON: ${JSON.stringify(planPayload)}`,
    requireLlmPlan: false,
    modeOverride
  });
  if (!irgResult.handled) {
    return {
      success: false,
      error: 'Contract did not map to a runnable IRG action.'
    };
  }
  if (!irgResult.success) {
    return {
      success: false,
      response: irgResult.response,
      error: String(irgResult.response || 'IRG contract run error')
    };
  }
  rememberLastIrgExecution({
    contract: irgResult.contract || contract,
    gatewayConfig
  });
  const trace = {
    conversationId: options.conversationId || `contract-run-${Date.now()}`,
    startedAt: new Date().toISOString(),
    steps: [{
      agentId: 'irg-gateway',
      agentName: gatewayConfig.name || 'IRG Gateway',
      modelName: 'deterministic-irg-contract-run',
      input: 'Run provided IRG contract',
      output: irgResult.response,
      durationMs: 0,
      success: true,
      route: {
        mode: 'irg-contract-run',
        reason: 'user-selected-contract'
      }
    }],
    finalResponse: irgResult.response,
    completedAt: new Date().toISOString(),
    totalDurationMs: 0,
    mode: 'irg-contract-run'
  };
  return {
    success: true,
    response: irgResult.response,
    trace,
    irg: {
      handled: true,
      contract: irgResult.contract || contract,
      execution: irgResult.execution || null,
      replayed: false,
      capturedAt: getLastIrgReplay?.()?.capturedAt || null
    }
  };
}

module.exports = {
  rerunLastIrgInternal,
  runIrgContractInternal
};
