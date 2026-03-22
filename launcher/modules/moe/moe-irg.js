/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ==========================================================================
 * MOE / IRG BRIDGE
 * ==========================================================================
 */

const {
  DEFAULT_POLICY,
  mergePolicy,
  normalizeBindings,
  parsePlanBindings,
  applyBindingsToPolicy,
  buildResolutionTrace
} = require('./moe-irg-policy');
const {
  inferBlinkContract,
  inferColorSequenceContract,
  inferEsp32PushContract,
  inferEsp32WifiControlContract,
  applyPlanOverrides,
  parseLlmPlanContract
} = require('./moe-irg-infer');
const {
  validateContract,
  buildPicoMicroPythonProgram,
  buildEsp32SketchProgram,
  buildEsp32WifiHttpProgram
} = require('./moe-irg-contract');
const {
  executeLiveContract
} = require('./moe-irg-live');
const {
  analyzeDeterministicMatch,
  normalizeIrgFallbackMode,
  formatContractBlock,
  summarizeLiveExecutionOutput,
  repairContractFromIntent
} = require('./moe-irg-analysis');

function buildAmbiguousPiClarification(message) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const mentionsPi = /\braspberry\s*pi\b/.test(lower) || /\bpi\b/.test(lower);
  const mentionsPico = /\bpico\b/.test(lower);
  if (!mentionsPi || mentionsPico) return '';
  return (
    'Error\n' +
    'Reason: Ambiguous target "pi". Please specify which device.\n' +
    'Examples:\n' +
    '- "Program raspberry pi pico to blink red 200 ms on, 100 ms off, 5 cycles."\n' +
    '- "Program raspberry pi 4 gpio 18 using python gpiozero."\n' +
    '- "Program raspberry pi 5 gpio 18 using python gpiozero."\n' +
    'Note: IRG deterministic live deployment currently supports Raspberry Pi Pico and ESP32 paths.'
  );
}

function applyEsp32ContractPolicyOverrides(policy, contract) {
  const next = {
    ...(policy || {}),
    esp32: {
      ...((policy && policy.esp32) || {})
    }
  };
  const params = contract?.params || {};
  const fqbn = String(params.fqbn || '').trim();
  if (fqbn) next.esp32.fqbn = fqbn;

  const sketchName = String(params.sketchName || '').trim();
  if (sketchName) next.esp32.sketchName = sketchName;

  const compileTimeoutMs = Number(params.compileTimeoutMs);
  if (Number.isFinite(compileTimeoutMs) && compileTimeoutMs >= 10000) {
    next.esp32.compileTimeoutMs = Math.min(600000, Math.trunc(compileTimeoutMs));
  }

  const uploadTimeoutMs = Number(params.uploadTimeoutMs);
  if (Number.isFinite(uploadTimeoutMs) && uploadTimeoutMs >= 10000) {
    next.esp32.uploadTimeoutMs = Math.min(600000, Math.trunc(uploadTimeoutMs));
  }

  return next;
}

async function executeContract(contract, gatewayConfig = {}, options = {}) {
  let policy = options?.policy || mergePolicy(gatewayConfig);
  let effectiveGatewayConfig = gatewayConfig;
  if (policy.enabled === false || policy.executeMode === 'disabled') {
    return {
      success: false,
      blocked: true,
      reason: 'IRG disabled by gateway policy'
    };
  }

  const validation = validateContract(contract, policy);
  if (!validation.valid) {
    return {
      success: false,
      blocked: true,
      reason: `Validation failed: ${validation.errors.join('; ')}`,
      validation
    };
  }

  const target = String(contract?.target || '').toLowerCase();
  if (
    target === 'raspberry-pi-pico' && (
      contract.action === 'blink_color_sequence' ||
      contract.action === 'blink_pattern_sequence' ||
      contract.action === 'blink_color_group' ||
      contract.action === 'blink_multi_phase'
    )
  ) {
    contract.params.pins = {
      red: Number(policy?.pico?.colorPins?.red),
      blue: Number(policy?.pico?.colorPins?.blue),
      green: Number(policy?.pico?.colorPins?.green)
    };
  }

  const isEsp32Upload = target === 'esp32' && String(contract?.action || '') === 'push_esp32_code';
  const isEsp32Wifi = target === 'esp32' && String(contract?.action || '') === 'esp32_wifi_http';
  if (isEsp32Upload) {
    policy = applyEsp32ContractPolicyOverrides(policy, contract);
    const serialPort = String(contract?.params?.serialPort || '').trim();
    if (serialPort) {
      effectiveGatewayConfig = {
        ...(gatewayConfig || {}),
        sources: {
          ...((gatewayConfig && gatewayConfig.sources) || {}),
          serial: {
            ...(((gatewayConfig && gatewayConfig.sources) && gatewayConfig.sources.serial) || {}),
            enabled: true,
            port: serialPort
          }
        }
      };
    }
  }
  const script = isEsp32Upload
    ? buildEsp32SketchProgram(contract)
    : (isEsp32Wifi ? buildEsp32WifiHttpProgram(contract) : buildPicoMicroPythonProgram(contract));
  const expectedSerial = isEsp32Upload
    ? String(contract?.params?.verificationContains || 'Robot ready!')
    : (isEsp32Wifi ? 'HTTP 2xx' : 'IRG blink complete');
  if (policy.executeMode !== 'live') {
    return {
      success: true,
      mode: 'simulate',
      contract,
      script,
      target,
      verification: {
        expectedSerial
      }
    };
  }

  const liveExec = await executeLiveContract({
    contract,
    script,
    expectedSerial,
    gatewayConfig: effectiveGatewayConfig,
    policy
  });

  return {
    ...liveExec,
    contract,
    script
  };
}

async function tryHandleGatewayRequest({ message, gatewayConfig = {}, llmPlan = '', requireLlmPlan = false, modeOverride = '' } = {}) {
  const ambiguousPiError = buildAmbiguousPiClarification(message);
  if (ambiguousPiError) {
    return {
      handled: true,
      success: false,
      blocked: true,
      response: ambiguousPiError
    };
  }

  const basePolicy = mergePolicy(gatewayConfig);
  const llmPlanText = String(llmPlan || '').trim();
  const bindingEntries = normalizeBindings(gatewayConfig?.bindings);
  const planEntries = parsePlanBindings(llmPlan);
  const mergedEntries = [...bindingEntries, ...planEntries];
  const applied = applyBindingsToPolicy(basePolicy, mergedEntries);
  const policy = applied.policy;
  const normalizedModeOverride = String(modeOverride || '').trim().toLowerCase();
  if (normalizedModeOverride === 'simulate' || normalizedModeOverride === 'live' || normalizedModeOverride === 'disabled') {
    policy.executeMode = normalizedModeOverride;
  }
  const requirePlan = requireLlmPlan === true || policy?.requireLlmPlanForLive === true;
  const llmPlanContract = parseLlmPlanContract(llmPlanText, policy);
  if (policy.enabled === false || policy.executeMode === 'disabled') {
    return { handled: false };
  }

  const userMessage = String(message || '').trim();
  const combinedMessage = [userMessage, llmPlanText].filter(Boolean).join('\n');
  const esp32Contract = inferEsp32PushContract(userMessage, policy);
  const esp32WifiContract = esp32Contract ? null : inferEsp32WifiControlContract(userMessage, policy);
  const colorContract = (esp32Contract || esp32WifiContract) ? null : inferColorSequenceContract(userMessage, policy);
  const blinkContract = (esp32Contract || esp32WifiContract || colorContract) ? null : inferBlinkContract(userMessage, policy);
  const selectedContract = esp32Contract || esp32WifiContract || colorContract || blinkContract;
  const strictLiveRequiresPlan = requirePlan && String(policy.executeMode || '').toLowerCase() === 'live';
  const hasAnyLlmPlan = planEntries.length > 0 || !!llmPlanContract;
  if (strictLiveRequiresPlan && !hasAnyLlmPlan && !selectedContract) {
    return {
      handled: true,
      success: false,
      response:
        'Error\n' +
        'Reason: Live mode requires an LLM execution plan but none was detected.'
    };
  }
  if (!selectedContract && !llmPlanContract) return { handled: false };
  const effectiveContract = applyPlanOverrides(llmPlanContract || selectedContract, planEntries, policy);
  const llmPlanProvided = llmPlanText.length > 0;
  const deterministicAnalysis = analyzeDeterministicMatch({
    message: userMessage || combinedMessage,
    contract: effectiveContract
  });
  deterministicAnalysis.sourceText = userMessage || combinedMessage;
  const fallbackMode = normalizeIrgFallbackMode(gatewayConfig?.irg?.deterministicFallbackMode);
  const confidenceThresholdRaw = Number(gatewayConfig?.irg?.deterministicConfidenceThreshold);
  const confidenceThreshold = Number.isFinite(confidenceThresholdRaw)
    ? Math.max(0, Math.min(1, confidenceThresholdRaw))
    : 0.9;
  const hasGaps = deterministicAnalysis.gaps.length > 0;
  const lowConfidence = deterministicAnalysis.confidence < confidenceThreshold;
  const shouldFallback =
    fallbackMode === 'off'
      ? false
      : (fallbackMode === 'on-gaps'
        ? hasGaps
        : (hasGaps || lowConfidence));
  const needsLlmRefinement = !llmPlanProvided && shouldFallback;
  if (needsLlmRefinement) {
    return {
      handled: true,
      success: false,
      needsLlmRefinement: true,
      contract: effectiveContract,
      analysis: deterministicAnalysis,
      fallbackMode,
      confidenceThreshold,
      response:
        'IRG deterministic draft requires LLM refinement before execution.\n' +
        `fallback_mode=${fallbackMode}, confidence_threshold=${confidenceThreshold.toFixed(2)}, ` +
        `confidence=${deterministicAnalysis.confidence.toFixed(2)}, gaps=${deterministicAnalysis.gaps.join(', ') || 'none'}` +
        formatContractBlock(effectiveContract)
    };
  }
  if (llmPlanProvided) {
    const repaired = repairContractFromIntent({
      contract: effectiveContract,
      analysis: deterministicAnalysis,
      policy
    });
    if (repaired.repairs.length > 0) {
      effectiveContract.action = repaired.contract.action;
      effectiveContract.params = repaired.contract.params;
      deterministicAnalysis.repairs = repaired.repairs;
      const postRepair = analyzeDeterministicMatch({
        message: userMessage || combinedMessage,
        contract: effectiveContract
      });
      deterministicAnalysis.gaps = postRepair.gaps;
      deterministicAnalysis.confidence = postRepair.confidence;
    }
    const criticalGaps = deterministicAnalysis.gaps.filter((gap) => [
      'color_intent_lost',
      'simultaneous_group_missing',
      'pause_missing',
      'off_timing_missing',
      'repeat_structure_missing',
      'cycle_count_mismatch'
    ].includes(gap));
    const blockOnCriticalGaps = gatewayConfig?.irg?.blockOnCriticalGaps === true;
    if (criticalGaps.length > 0 && blockOnCriticalGaps) {
      return {
        handled: true,
        success: false,
        blocked: true,
        needsLlmRefinement: false,
        contract: effectiveContract,
        analysis: deterministicAnalysis,
        fallbackMode,
        confidenceThreshold,
        response:
          'Error\n' +
          'Reason: LLM refinement did not preserve required deterministic intent.\n' +
          `gaps=${criticalGaps.join(', ')}` +
          formatContractBlock(effectiveContract)
      };
    }
    if (criticalGaps.length > 0) {
      deterministicAnalysis.warning = `intent_gaps_present:${criticalGaps.join(',')}`;
    } else if (Array.isArray(deterministicAnalysis.repairs) && deterministicAnalysis.repairs.length > 0) {
      deterministicAnalysis.warning = `intent_repairs_applied:${deterministicAnalysis.repairs.join(',')}`;
    }
  } else if (strictLiveRequiresPlan && !hasAnyLlmPlan) {
    deterministicAnalysis.warning = 'llm_plan_missing_fallback_deterministic';
  }

  const execution = await executeContract(effectiveContract, gatewayConfig, { policy });
  if (!execution.success) {
    const contractSummary = {
      target: effectiveContract?.target || null,
      action: effectiveContract?.action || null,
      hasCode: Boolean(String(effectiveContract?.params?.code || '').trim()),
      codeLength: String(effectiveContract?.params?.code || '').length || 0
    };
    const diagnostics = summarizeLiveExecutionOutput(execution);
    return {
      handled: true,
      success: false,
      response:
        `Error\n` +
        `Reason: ${execution.reason}\n` +
        `Contract Summary: ${JSON.stringify(contractSummary)}` +
        (diagnostics ? `\n${diagnostics}` : '')
    };
  }

  const isEsp32 = String(effectiveContract?.target || '').toLowerCase() === 'esp32';
  const isEsp32Upload = isEsp32 && String(effectiveContract?.action || '') === 'push_esp32_code';
  const isEsp32Wifi = isEsp32 && String(effectiveContract?.action || '') === 'esp32_wifi_http';
  const isColorSequence = !isEsp32 && (
    effectiveContract.action === 'blink_color_sequence' ||
    effectiveContract.action === 'blink_pattern_sequence' ||
    effectiveContract.action === 'blink_color_group' ||
    effectiveContract.action === 'blink_multi_phase'
  );
  const trace = buildResolutionTrace(effectiveContract, policy, applied);
  let actionText = `Action: blink GPIO ${effectiveContract.params.gpio}`;
  if (isEsp32Upload) {
    actionText = 'Action: Upload ESP32 firmware sketch';
  } else if (isEsp32Wifi) {
    actionText = `Action: ESP32 Wi-Fi ${String(effectiveContract?.params?.method || 'GET').toUpperCase()} ${String(effectiveContract?.params?.path || '/').trim()}`;
  } else if (isColorSequence) {
    if (effectiveContract.action === 'blink_color_group') {
      actionText = `Group: ${effectiveContract.params.colors.join(' + ')}`;
    } else if (effectiveContract.action === 'blink_multi_phase') {
      actionText = `Phases: ${effectiveContract.params.phases.map((phase, idx) => {
        if (Number.isFinite(Number(phase?.pauseMs))) return `#${idx + 1}(pause, ${Number(phase.pauseMs)}ms)`;
        const onMs = Number(phase?.periodMs);
        const offMs = phase?.offMs == null ? onMs : Number(phase.offMs);
        if (Number.isFinite(offMs) && offMs !== onMs) {
          return `#${idx + 1}(${phase.colors.join(' + ')}, on ${onMs}ms / off ${offMs}ms)`;
        }
        return `#${idx + 1}(${phase.colors.join(' + ')}, ${onMs}ms)`;
      }).join(' -> ')}`;
    } else {
      actionText = `Sequence: ${effectiveContract.params.colors.join(' -> ')}`;
    }
  }
  const iterationText = isEsp32
    ? ''
    : (isColorSequence
    ? `Cycles: ${effectiveContract.params.cycles}`
    : `Iterations: ${effectiveContract.params.iterations}`);
  const patternText = effectiveContract.action === 'blink_pattern_sequence'
    ? `White Strobe: ${effectiveContract.params.whiteBurstCount} burst(s), ${effectiveContract.params.whiteBurstOnMs}ms on / ${effectiveContract.params.whiteBurstOffMs}ms off\n`
    : '';
  const resolutionLine = trace
    ? (isColorSequence
      ? `Resolution: plan_source=${trace.planSource}, resolved_period_ms=${trace.periodMs} (${trace.periodSource}), resolved_cycles=${trace.cycles} (${trace.cyclesSource}), resolved_pins=red:${trace.pins.red} (${trace.pinSources.red}), blue:${trace.pins.blue} (${trace.pinSources.blue}), green:${trace.pins.green} (${trace.pinSources.green})`
      : `Resolution: plan_source=${trace.planSource}, resolved_period_ms=${trace.periodMs} (${trace.periodSource}), resolved_iterations=${trace.iterations} (${trace.iterationsSource}), resolved_gpio=${trace.gpio} (${trace.gpioSource})`)
    : '';
  const response =
    `IRG contract accepted (${execution.mode}).\n` +
    `Target: ${isEsp32 ? (isEsp32Wifi ? 'ESP32 (Wi-Fi)' : 'ESP32') : 'Raspberry Pi Pico'}\n` +
    `${actionText}\n` +
    (isEsp32Upload
      ? `Toolchain: arduino-cli\n`
      : (isEsp32Wifi
        ? `Transport: HTTP\nEndpoint: http://${String(effectiveContract?.params?.host || '').trim()}:${Number(effectiveContract?.params?.port)}${String(effectiveContract?.params?.path || '').trim()}\n`
        : `Period: ${effectiveContract.action === 'blink_multi_phase' ? 'phase-defined' : `${effectiveContract.params.periodMs}ms`}\n`)) +
    (isEsp32 ? '' : patternText) +
    (iterationText ? `${iterationText}\n` : '') +
    `\nGenerated ${isEsp32Upload ? 'Arduino Sketch' : (isEsp32Wifi ? 'HTTP Request' : 'MicroPython')}:\n` +
    `~~~${isEsp32Upload ? 'cpp' : (isEsp32Wifi ? 'text' : 'python')}\n${execution.script}\n~~~\n` +
    formatContractBlock(effectiveContract) + '\n' +
    (deterministicAnalysis?.warning
      ? `Warning: ${deterministicAnalysis.warning}\n`
      : '') +
    (isEsp32Upload
      ? `Verification: upload completed; serial token (if configured) "${execution.verification.expectedSerial}" is not auto-captured yet.`
      : (isEsp32Wifi
        ? `Verification: HTTP request completed with status ${Number(execution?.metadata?.httpStatus) || '2xx'}.`
        : `Verification: expect serial line "${execution.verification.expectedSerial}".`)) +
    (!isEsp32 && resolutionLine ? `\n${resolutionLine}` : '') +
    (applied.resolution.length > 0
      ? `\nBindings Applied: ${applied.resolution.map((item) => `${item.field}=${item.value} (${item.source})`).join(', ')}`
      : '') +
    (execution.mode === 'live' && !isEsp32Wifi
      ? `\nSerial: ${execution?.serial?.resolvedPort || 'n/a'}`
      : '');

  return {
    handled: true,
    success: true,
    response,
    contract: effectiveContract,
    execution,
    analysis: deterministicAnalysis,
    needsLlmRefinement: false,
    fallbackMode,
    confidenceThreshold
  };
}

module.exports = {
  DEFAULT_POLICY,
  mergePolicy,
  inferBlinkContract,
  validateContract,
  executeContract,
  tryHandleGatewayRequest
};
