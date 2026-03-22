#!/usr/bin/env node
'use strict';

const assert = require('assert');
const moeIrg = require('./moe-irg');
const { runExpandedRegressionTests } = require('./moe-irg.regression-expanded.test');

async function testLlmPlanOverridesAndTrace() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [
      { key: 'gpio.red', value: '9', source: 'Runtime Bindings' },
      { key: 'gpio.blue', value: '10', source: 'Runtime Bindings' },
      { key: 'gpio.green', value: '11', source: 'Runtime Bindings' },
      { key: 'timing.period_ms', value: '700', source: 'Runtime Bindings' },
      { key: 'timing.cycles', value: '2', source: 'Runtime Bindings' }
    ],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'llm-plan-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program raspberry pi pico to blink red blue green.',
    llmPlan: 'gpio.red=2, gpio.blue=3, gpio.green=4, period_ms=400, cycles=8',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'request should be handled');
  assert.equal(result.success, true, 'request should succeed');
  assert.match(result.response, /Period:\s*400ms/i, 'response should use 400ms');
  assert.match(result.response, /Cycles:\s*8/i, 'response should use 8 cycles');
  assert.match(result.response, /plan_source=llm/i, 'resolution should report llm plan source');
  assert.match(result.response, /resolved_period_ms=400\s+\(llm\)/i, 'period source should be llm');
  assert.match(result.response, /resolved_cycles=8\s+\(llm\)/i, 'cycles source should be llm');
  assert.match(result.response, /red:\s*2\s+\(llm\)/i, 'red pin source should be llm');
  assert.match(result.execution.script, /for _ in range\(8\):/i, 'script should loop for 8 cycles');
  assert.match(result.execution.script, /time\.sleep_ms\(400\)/i, 'script should use 400ms timing');
}

async function testStructuredJsonLlmPlanSelectsDeterministicAction() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [
      { key: 'gpio.red', value: '3', source: 'Runtime Bindings' },
      { key: 'gpio.blue', value: '2', source: 'Runtime Bindings' },
      { key: 'gpio.green', value: '4', source: 'Runtime Bindings' }
    ],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'llm-plan-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program the pico to start calm, get urgent, then settle, with a pause near the end.',
    llmPlan: 'IRG_PLAN_JSON: {"action":"blink_multi_phase","params":{"phases":[{"colors":["green"],"periodMs":800},{"colors":["red","blue"],"periodMs":200,"offMs":120},{"colors":["blue"],"periodMs":500},{"pauseMs":300}],"cycles":3}}',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'structured plan request should be handled');
  assert.equal(result.success, true, 'structured plan request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'LLM JSON plan should select blink_multi_phase');
  assert.equal(result.contract.params.cycles, 3, 'LLM JSON cycles should be preserved');
  const finalPhase = result.contract.params.phases[result.contract.params.phases.length - 1];
  assert.equal(finalPhase.pauseMs, 300, 'LLM JSON pause phase should be preserved');
  assert.match(result.response, /#4\(pause,\s*300ms\)/i, 'response should include pause phase');
}

async function testStructuredJsonLegacyPhaseShapeIsRecovered() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [
      { key: 'gpio.red', value: '3', source: 'Runtime Bindings' },
      { key: 'gpio.blue', value: '2', source: 'Runtime Bindings' },
      { key: 'gpio.green', value: '4', source: 'Runtime Bindings' }
    ],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'llm-plan-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program the Pico to start calm, then urgent, then settle; include one simultaneous color moment and a short pause near the end, for 3 cycles.',
    llmPlan: 'IRG_PLAN_JSON: {"action":"blink_color_sequence","params":{"duration":3,"phases":[{"start":0,"colorSequence":"red,blue,green"},{"start":1000,"colorSequence":"red"},{"start":2000,"colorSequence":"blue"},{"start":3000,"colorSequence":"green"},{"start":4000,"colorSequence":"red,blue,green"}]}}',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'legacy-shape plan should be handled');
  assert.equal(result.success, true, 'legacy-shape plan should recover to a valid contract');
  assert.equal(result.contract.action, 'blink_multi_phase', 'legacy phases should map to blink_multi_phase');
  assert.equal(result.contract.params.cycles, 3, 'duration should map to cycles');
  assert.ok(result.contract.params.phases.length >= 5, 'legacy phases should map to multi-phase list');
}

async function testGemmaLooseSequencePayloadGetsIntentRepair() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [
      { key: 'gpio.red', value: '3', source: 'Runtime Bindings' },
      { key: 'gpio.blue', value: '2', source: 'Runtime Bindings' },
      { key: 'gpio.green', value: '4', source: 'Runtime Bindings' }
    ],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'llm-plan-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program the Pico to start calm, then urgent, then settle; include one simultaneous color moment and a short pause near the end, for 3 cycles.',
    llmPlan: 'IRG_PLAN_JSON: {"action":"blink_color_sequence","params":{"count":3,"colors":["red","blue","green"],"duration_ms":[2000,1500,2500],"pause_ms":500}}',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'loose gemma payload should be handled');
  assert.equal(result.success, true, 'loose gemma payload should succeed after repair');
  assert.equal(result.contract.action, 'blink_multi_phase', 'repair should upgrade to multi-phase');
  assert.equal(result.contract.params.cycles, 3, 'count alias should map to cycles');
  const pausePhase = result.contract.params.phases.find((phase) => Number.isFinite(Number(phase?.pauseMs)));
  assert.ok(pausePhase, 'repair should preserve/add pause phase');
  const hasGroup = result.contract.params.phases.some((phase) => Array.isArray(phase?.colors) && phase.colors.length > 1);
  assert.equal(hasGroup, true, 'repair should add at least one simultaneous color phase');
  assert.match(result.response, /Warning:\s*intent_repairs_applied:/i, 'response should disclose deterministic intent repairs');
}

async function testFewCyclesPhraseMapsToThree() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program raspberry pi pico to blink red blue green for a few cycles.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'few-cycles request should be handled');
  assert.equal(result.success, true, 'few-cycles request should succeed');
  assert.equal(result.contract.params.cycles, 3, '"few cycles" should resolve to 3');
}

async function testMoodArcPromptAppliesPhaseVariationAndPause() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [
      { key: 'gpio.red', value: '3', source: 'Runtime Bindings' },
      { key: 'gpio.blue', value: '2', source: 'Runtime Bindings' },
      { key: 'gpio.green', value: '4', source: 'Runtime Bindings' }
    ],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'llm-plan-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program the Pico to do this vibe: start calm, then get urgent, then settle down. Use red/ blue/green somehow, include at least one simultaneous color moment, add a short pause near the end, and run it for a few cycles.',
    llmPlan: 'IRG_PLAN_JSON: {"action":"blink_color_sequence","params":{"count":5,"colors":["red","blue","green"]}}',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'mood arc request should be handled');
  assert.equal(result.success, true, 'mood arc request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'mood arc should produce multi-phase');
  assert.equal(result.contract.params.cycles, 3, 'few cycles wording should align cycles to 3');
  const phases = Array.isArray(result.contract.params.phases) ? result.contract.params.phases : [];
  assert.ok(phases.length >= 8, 'mood arc should include expanded calm/urgent/settle pattern plus pause');
  const hasPause = phases.some((phase) => Number.isFinite(Number(phase?.pauseMs)));
  assert.equal(hasPause, true, 'mood arc should include pause near end');
  const hasSimultaneous = phases.some((phase) => Array.isArray(phase?.colors) && phase.colors.length > 1);
  assert.equal(hasSimultaneous, true, 'mood arc should include simultaneous color phase');
  const uniquePeriods = new Set(phases.filter((p) => Number.isFinite(Number(p?.periodMs))).map((p) => Number(p.periodMs)));
  assert.ok(uniquePeriods.size >= 4, 'mood arc should vary timing across phases');
  assert.equal(result.contract.params.moodVariation?.enabled, true, 'mood arc should enable per-cycle variation');
  assert.ok(Number(result.contract.params.moodVariation?.cycleRampPct) > 0, 'mood arc should enable per-cycle ramp');
  assert.match(result.execution.script, /def jitter_ms\(base_ms, pct\):/i, 'script should include timing jitter helper');
  assert.match(result.execution.script, /import urandom/i, 'script should include random source for per-cycle variation');
  assert.match(result.execution.script, /for cycle_idx in range\(/i, 'script should iterate cycles with index for ramping');
  assert.match(result.execution.script, /cycle_factor = 1\.0 - \(cycle_idx \* CYCLE_RAMP_PCT\)/i, 'script should apply per-cycle ramp factor');
}

async function testAggressiveSpeedRampPromptUsesHigherRamp() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [
      { key: 'gpio.red', value: '3', source: 'Runtime Bindings' },
      { key: 'gpio.blue', value: '2', source: 'Runtime Bindings' },
      { key: 'gpio.green', value: '4', source: 'Runtime Bindings' }
    ],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'llm-plan-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program the Pico to start calm and REALLY scale up to speed like drums in the beginning of Raining Blood, then settle down with a short pause near the end for a few cycles.',
    llmPlan: 'IRG_PLAN_JSON: {"action":"blink_color_sequence","params":{"colors":["red","blue","green"],"count":5}}',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'aggressive speed-ramp request should be handled');
  assert.equal(result.success, true, 'aggressive speed-ramp request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'aggressive speed-ramp should produce multi-phase');
  assert.ok(Number(result.contract.params.moodVariation?.cycleRampPct) >= 0.18, 'aggressive speed-ramp should use higher cycle ramp');
}

async function testCalmUrgentPerCyclePromptUsesRampProfile() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [
      { key: 'gpio.red', value: '3', source: 'Runtime Bindings' },
      { key: 'gpio.blue', value: '2', source: 'Runtime Bindings' },
      { key: 'gpio.green', value: '4', source: 'Runtime Bindings' }
    ],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'llm-plan-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program the Pico to do this vibe: start calm, then get urgent per cycle. Use red/ blue/green somehow, include at least one simultaneous color moment, add a short pause near the end, and run it for 10 cycles. Make each cycle slightly faster than the previous one.',
    llmPlan: 'IRG_PLAN_JSON: {"action":"blink_color_sequence","params":{"duration":1000,"colors":["red","blue"],"count":10}}',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'calm-urgent per-cycle request should be handled');
  assert.equal(result.success, true, 'calm-urgent per-cycle request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'calm-urgent per-cycle should produce multi-phase');
  assert.equal(result.contract.params.cycles, 10, 'explicit cycle count should be preserved');
  assert.ok(Number(result.contract.params.moodVariation?.cycleRampPct) >= 0.14, 'per-cycle wording should use stronger ramp');
  const phaseCount = Array.isArray(result.contract.params.phases) ? result.contract.params.phases.length : 0;
  assert.ok(phaseCount >= 6, 'profile should not collapse to trivial two-phase loop');
}

async function testConflictingPlanBindingsDoNotOverridePins() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [
      { key: 'gpio.red', value: '3', source: 'Runtime Bindings' },
      { key: 'gpio.blue', value: '2', source: 'Runtime Bindings' },
      { key: 'gpio.green', value: '4', source: 'Runtime Bindings' }
    ],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'llm-plan-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program raspberry pi pico to blink red blue green.',
    llmPlan: 'gpio.red=1, gpio.red=8, gpio.blue=2, gpio.blue=9, period_ms=300, cycles=4',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'conflicting plan request should be handled');
  assert.equal(result.success, true, 'conflicting plan request should still succeed');
  assert.match(result.response, /Period:\s*300ms/i, 'non-conflicting period should apply');
  assert.match(result.response, /Cycles:\s*4/i, 'non-conflicting cycles should apply');
  assert.match(result.response, /red:\s*3\s+\(bindings\)/i, 'conflicting red pin should fall back to binding');
  assert.match(result.response, /blue:\s*2\s+\(bindings\)/i, 'conflicting blue pin should fall back to binding');
}

async function testStrictLiveModeRequiresPlan() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: true, port: 'auto', baudRate: 115200 }
    },
    irg: {
      enabled: true,
      executeMode: 'live',
      entryMode: 'llm-plan-first',
      requireLlmPlanForLive: true
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Can you help me with hardware stuff?',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: true
  });

  assert.equal(result.handled, true, 'request should be handled when strict mode blocks');
  assert.equal(result.success, false, 'strict mode without plan should fail');
  assert.match(result.response, /requires an LLM execution plan/i, 'response should explain strict mode block');
}

async function testStrictLiveModeFallsBackWhenDeterministicParseExists() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [],
    irg: {
      enabled: true,
      executeMode: 'live',
      entryMode: 'llm-plan-first',
      requireLlmPlanForLive: true
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program raspberry pi pico to blink red blue green for 3 cycles.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: true,
    modeOverride: 'simulate'
  });

  assert.equal(result.handled, true, 'deterministic fallback should still be handled');
  assert.equal(result.success, true, 'deterministic fallback should succeed');
  assert.match(result.response, /IRG contract accepted/i, 'response should still execute deterministically');
}

async function testGatewayDefaultResolutionLabels() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'llm-plan-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program raspberry pi pico to blink red blue green.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'request should be handled');
  assert.equal(result.success, true, 'default gateway request should succeed');
  assert.match(result.response, /plan_source=gateway-default/i, 'resolution should report gateway-default');
  assert.match(result.response, /resolved_period_ms=500\s+\(gateway-default\)/i, 'period should come from gateway defaults');
  assert.match(result.response, /resolved_cycles=5\s+\(gateway-default\)/i, 'cycles should come from gateway defaults');
  assert.match(result.response, /red:\s*2\s+\(gateway-default\)/i, 'red pin should come from gateway defaults');
}

async function run() {
  await testLlmPlanOverridesAndTrace();
  await testStructuredJsonLlmPlanSelectsDeterministicAction();
  await testStructuredJsonLegacyPhaseShapeIsRecovered();
  await testGemmaLooseSequencePayloadGetsIntentRepair();
  await testFewCyclesPhraseMapsToThree();
  await testMoodArcPromptAppliesPhaseVariationAndPause();
  await testAggressiveSpeedRampPromptUsesHigherRamp();
  await testCalmUrgentPerCyclePromptUsesRampProfile();
  await testConflictingPlanBindingsDoNotOverridePins();
  await testStrictLiveModeRequiresPlan();
  await testStrictLiveModeFallsBackWhenDeterministicParseExists();
  await testGatewayDefaultResolutionLabels();
  await runExpandedRegressionTests();
  process.stdout.write('moe-irg regression tests passed\n');
}

run().catch((err) => {
  process.stderr.write(`moe-irg regression tests failed: ${err.stack || err.message}\n`);
  process.exitCode = 1;
});
