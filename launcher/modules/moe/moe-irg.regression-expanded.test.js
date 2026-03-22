#!/usr/bin/env node
'use strict';

const assert = require('assert');
const moeIrg = require('./moe-irg');

async function testWhiteStrobePatternContract() {
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
    message: 'Program raspberry pi pico to strobe white twice quickly and then cycle red blue green for 5 cycles.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'pattern request should be handled');
  assert.equal(result.success, true, 'pattern request should succeed');
  assert.equal(result.contract.action, 'blink_pattern_sequence', 'should select pattern sequence contract');
  assert.match(result.response, /White Strobe:\s*2 burst\(s\),\s*100ms on \/ 100ms off/i, 'response should include strobe settings');
  assert.match(result.execution.script, /for _ in range\(5\):/i, 'script should run 5 cycles');
  assert.match(result.execution.script, /for _ in range\(2\):/i, 'script should perform 2 white bursts');
  assert.match(result.execution.script, /set_color\('white'\)/i, 'script should strobe white');
}

async function testColorStrobeSequenceParsing() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program raspberry pi pico to strobe blue twice quickly for 50 ms, off for 50 ms, then strobe red twice quickly for 50 ms, off for 50 ms. Run the full sequence for 15 cycles.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'strobe color sequence should be handled');
  assert.equal(result.success, true, 'strobe color sequence should succeed');
  assert.equal(result.contract.action, 'blink_color_sequence', 'should remain a color sequence contract');
  assert.deepEqual(result.contract.params.colors, ['blue', 'blue', 'red', 'red'], 'should preserve color order and twice repeats');
  assert.match(result.response, /Sequence:\s*blue\s*->\s*blue\s*->\s*red\s*->\s*red/i, 'response should show expanded sequence order');
  assert.match(result.response, /Period:\s*50ms/i, 'response should resolve 50ms');
  assert.match(result.response, /Cycles:\s*15/i, 'response should resolve 15 cycles');
  assert.match(result.execution.script, /colors = \['blue', 'blue', 'red', 'red'\]/i, 'script should include expanded strobe sequence');
  assert.match(result.execution.script, /for _ in range\(15\):/i, 'script should loop 15 cycles');
}

async function testMixedColorAndWhiteStrobeParsing() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'Program raspberry pi pico to strobe blue twice quickly for 150 ms, off for 150 ms, then strobe red twice quickly for 150 ms, off for 150 ms. Strobe white twice quickly (red and blue on together for 50 ms, off for 50 ms, repeat once). Run the full sequence for 15 cycles using runtime bindings and deployable MicroPython only.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'mixed strobe request should be handled');
  assert.equal(result.success, true, 'mixed strobe request should succeed');
  assert.equal(result.contract.action, 'blink_pattern_sequence', 'mixed strobe should select pattern sequence');
  assert.deepEqual(result.contract.params.colors, ['blue', 'blue', 'red', 'red'], 'base colors should stay blue/blue/red/red without white-clause leakage');
  assert.equal(result.contract.params.whiteBurstCount, 2, 'white burst count should be 2');
  assert.equal(result.contract.params.whiteBurstOnMs, 50, 'white burst on-time should use white clause timing');
  assert.equal(result.contract.params.whiteBurstOffMs, 50, 'white burst off-time should use white clause timing');
  assert.match(result.response, /Sequence:\s*blue\s*->\s*blue\s*->\s*red\s*->\s*red/i, 'response sequence should stay ordered');
  assert.match(result.response, /White Strobe:\s*2 burst\(s\),\s*50ms on \/ 50ms off/i, 'response should reflect white 50/50 timing');
  assert.match(result.execution.script, /colors = \['blue', 'blue', 'red', 'red'\]/i, 'script should contain the correct base sequence');
  assert.match(result.execution.script, /for _ in range\(2\):\n\s*set_color\('white'\)\n\s*time\.sleep_ms\(50\)/i, 'script should strobe white at 50ms');
}

async function testCyclePhraseVariants() {
  const gatewayConfig = {
    name: 'User Gateway',
    sources: {
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    bindings: [
      { key: 'timing.cycles', value: '1', source: 'Runtime Bindings' }
    ],
    irg: {
      enabled: true,
      executeMode: 'simulate',
      entryMode: 'deterministic-first'
    }
  };

  const singleCycleWord = await moeIrg.tryHandleGatewayRequest({
    message: 'Program raspberry pi pico to blink red blue green for 8 cycle.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });
  assert.equal(singleCycleWord.handled, true, 'single-cycle-word request should be handled');
  assert.equal(singleCycleWord.success, true, 'single-cycle-word request should succeed');
  assert.match(singleCycleWord.response, /Cycles:\s*8/i, 'singular "cycle" should resolve to 8 cycles');
  assert.match(singleCycleWord.execution.script, /for _ in range\(8\):/i, 'script should loop for 8 cycles');

  const cycleCountPhrase = await moeIrg.tryHandleGatewayRequest({
    message: 'Program raspberry pi pico to blink red blue green, cycle count 12.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });
  assert.equal(cycleCountPhrase.handled, true, 'cycle-count request should be handled');
  assert.equal(cycleCountPhrase.success, true, 'cycle-count request should succeed');
  assert.match(cycleCountPhrase.response, /Cycles:\s*12/i, '"cycle count" should resolve to 12 cycles');
  assert.match(cycleCountPhrase.execution.script, /for _ in range\(12\):/i, 'script should loop for 12 cycles');

  const nestedRepeatWithOuterCycle = await moeIrg.tryHandleGatewayRequest({
    message: 'program the pico to turn on blue for 50ms, off 50 ms, 3 times, then pause for 150ms. Cycle 10 times.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });
  assert.equal(nestedRepeatWithOuterCycle.handled, true, 'nested-repeat request should be handled');
  assert.equal(nestedRepeatWithOuterCycle.success, true, 'nested-repeat request should succeed');
  assert.match(nestedRepeatWithOuterCycle.response, /Cycles:\s*10/i, 'outer cycle phrase should win over inner "3 times"');
  assert.match(nestedRepeatWithOuterCycle.execution.script, /for (?:_|cycle_idx) in range\(10\):/i, 'script should loop for 10 cycles');
}

async function testSimultaneousColorGroupPhrase() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'program the pico to turn on red, blue, green for 150ms, and then off for 150ms. Cycle this for 5 times.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'group phrase should be handled');
  assert.equal(result.success, true, 'group phrase should succeed');
  assert.equal(result.contract.action, 'blink_color_group', 'should resolve to simultaneous color group');
  assert.deepEqual(result.contract.params.colors, ['red', 'blue', 'green'], 'should preserve all requested colors');
  assert.match(result.response, /Group:\s*red\s*\+\s*blue\s*\+\s*green/i, 'response should show group output');
  assert.match(result.execution.script, /def apply_group\(group\):/i, 'script should include apply_group helper');
  assert.match(result.execution.script, /apply_group\(group\)/i, 'script should apply group colors together each cycle');
  assert.match(result.execution.script, /for _ in range\(5\):/i, 'script should run 5 cycles');
}

async function testMultiPhaseMixedGroupAndSingleColorTiming() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'program pico to turn on red, and green for 150ms. Then blue for 250ms. Cycle 5 times.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'multi-phase request should be handled');
  assert.equal(result.success, true, 'multi-phase request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'should resolve to blink_multi_phase');
  assert.equal(result.contract.params.cycles, 5, 'should resolve cycles');
  assert.deepEqual(result.contract.params.phases[0], { colors: ['red', 'green'], periodMs: 150 }, 'first phase should be red+green@150');
  assert.deepEqual(result.contract.params.phases[1], { colors: ['blue'], periodMs: 250 }, 'second phase should be blue@250');
  assert.match(result.response, /Phases:\s*#1\(red \+ green,\s*150ms\)\s*->\s*#2\(blue,\s*250ms\)/i, 'response should show phase plan');
  assert.match(result.execution.script, /\"colors\":\[(?:\"|')red(?:\"|'),(?:\"|')green(?:\"|')\],\"on_ms\":150,\"off_ms\":150/i, 'script should include first phase on/off');
  assert.match(result.execution.script, /\"colors\":\[(?:\"|')blue(?:\"|')\],\"on_ms\":250,\"off_ms\":250/i, 'script should include second phase on/off');
}

async function testMultiPhasePhraseRespectsTwiceRepeat() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'program pico to turn on red and blue for 150ms twice, then red for 250ms, then green for 250ms, then blue for 250ms. cycle 5 times.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'twice multi-phase request should be handled');
  assert.equal(result.success, true, 'twice multi-phase request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'should resolve to blink_multi_phase');
  assert.equal(result.contract.params.phases.length, 5, 'first phase should be repeated twice');
  assert.deepEqual(result.contract.params.phases[0], { colors: ['red', 'blue'], periodMs: 150 }, 'phase 1 should be red+blue@150');
  assert.deepEqual(result.contract.params.phases[1], { colors: ['red', 'blue'], periodMs: 150 }, 'phase 2 should repeat red+blue@150');
  assert.deepEqual(result.contract.params.phases[2], { colors: ['red'], periodMs: 250 }, 'phase 3 should be red@250');
  assert.deepEqual(result.contract.params.phases[3], { colors: ['green'], periodMs: 250 }, 'phase 4 should be green@250');
  assert.deepEqual(result.contract.params.phases[4], { colors: ['blue'], periodMs: 250 }, 'phase 5 should be blue@250');
}

async function testMultiPhaseOffClauseAppliesRepeatToPriorPhase() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'program the pico to turn on red and blue for 150ms, and then off for 150ms twice, then green for 250ms, then red for 250ms, then blue for 250ms. cycle 5 times.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'off-clause multi-phase request should be handled');
  assert.equal(result.success, true, 'off-clause multi-phase request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'should resolve to blink_multi_phase');
  assert.equal(result.contract.params.phases.length, 5, 'first phase should be duplicated due to off-clause twice');
  assert.deepEqual(result.contract.params.phases[0], { colors: ['red', 'blue'], periodMs: 150, offMs: 150 }, 'phase 1 should be red+blue@150 with off 150');
  assert.deepEqual(result.contract.params.phases[1], { colors: ['red', 'blue'], periodMs: 150, offMs: 150 }, 'phase 2 should duplicate red+blue@150 with off 150');
  assert.deepEqual(result.contract.params.phases[2], { colors: ['green'], periodMs: 250 }, 'phase 3 should be green@250');
  assert.deepEqual(result.contract.params.phases[3], { colors: ['red'], periodMs: 250 }, 'phase 4 should be red@250');
  assert.deepEqual(result.contract.params.phases[4], { colors: ['blue'], periodMs: 250 }, 'phase 5 should be blue@250');
}

async function testMultiPhaseCommaSeparatedTailPhases() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'program the pico to turn on the red and blue for 150ms, then off for 150ms, twice, then green for 250ms, blue for 250ms, and red for 150ms. cycle 5 times.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'comma-tail multi-phase request should be handled');
  assert.equal(result.success, true, 'comma-tail multi-phase request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'should resolve to blink_multi_phase');
  assert.equal(result.contract.params.phases.length, 5, 'should produce five phases');
  assert.deepEqual(result.contract.params.phases[0], { colors: ['red', 'blue'], periodMs: 150, offMs: 150 }, 'phase 1 should be red+blue@150 with off 150');
  assert.deepEqual(result.contract.params.phases[1], { colors: ['red', 'blue'], periodMs: 150, offMs: 150 }, 'phase 2 should duplicate red+blue@150 from "twice" with off 150');
  assert.deepEqual(result.contract.params.phases[2], { colors: ['green'], periodMs: 250 }, 'phase 3 should be green@250');
  assert.deepEqual(result.contract.params.phases[3], { colors: ['blue'], periodMs: 250 }, 'phase 4 should be blue@250');
  assert.deepEqual(result.contract.params.phases[4], { colors: ['red'], periodMs: 150 }, 'phase 5 should be red@150');
}

async function testMultiPhaseIncludesPauseModifier() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'program pico to turn on red and blue for 150ms twice, then green for 250ms, then red for 150ms, and then blue for 150ms, then pause 250ms. cycle 5 times.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'pause multi-phase request should be handled');
  assert.equal(result.success, true, 'pause multi-phase request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'should resolve to blink_multi_phase');
  assert.equal(result.contract.params.phases.length, 6, 'should include pause as final phase');
  const finalPhase = result.contract.params.phases[result.contract.params.phases.length - 1];
  assert.equal(finalPhase.pauseMs, 250, 'final phase should be pause 250ms');
  assert.match(result.response, /#6\(pause,\s*250ms\)/i, 'response should show pause phase');
  assert.match(result.execution.script, /if phase\['kind'\] == 'pause':/i, 'script should handle pause phase');
}

async function testMultiPhaseIncludesWaitModifierAlias() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'program pico to turn on red for 150ms, then blue for 150ms, then wait 250ms. cycle 3 times.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'wait alias request should be handled');
  assert.equal(result.success, true, 'wait alias request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'wait alias should resolve to blink_multi_phase');
  const finalPhase = result.contract.params.phases[result.contract.params.phases.length - 1];
  assert.equal(finalPhase.pauseMs, 250, 'final phase should be parsed as pause 250ms from wait');
}

async function testMultiPhaseAsymmetricOnOffTiming() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'program pico to turn on red and blue for 50ms, then off for 200ms, then green for 250ms, then pause for 500ms. cycle 4 times.',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'asymmetric on/off request should be handled');
  assert.equal(result.success, true, 'asymmetric on/off request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'should resolve to blink_multi_phase');
  assert.deepEqual(result.contract.params.phases[0], { colors: ['red', 'blue'], periodMs: 50, offMs: 200 }, 'phase 1 should include explicit offMs');
  assert.match(result.response, /on 50ms \/ off 200ms/i, 'response should show asymmetric phase timing');
  assert.match(result.execution.script, /\"on_ms\":50,\"off_ms\":200/i, 'script should encode on/off per phase');
}

async function testMultiPhaseCommaOnlySimultaneousGroupAndPause() {
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
      entryMode: 'deterministic-first'
    }
  };

  const result = await moeIrg.tryHandleGatewayRequest({
    message: 'program pico to turn on green for 200ms, off for 200ms, turn on blue and red for 50ms, turn off for 50ms, twice, pause for 200ms. cycle 3 times',
    llmPlan: '',
    gatewayConfig,
    requireLlmPlan: false
  });

  assert.equal(result.handled, true, 'comma-only multi-phase request should be handled');
  assert.equal(result.success, true, 'comma-only multi-phase request should succeed');
  assert.equal(result.contract.action, 'blink_multi_phase', 'should resolve to blink_multi_phase');
  assert.equal(result.contract.params.cycles, 3, 'outer cycle count should resolve to 3');
  assert.deepEqual(result.contract.params.phases[0], { colors: ['green'], periodMs: 200, offMs: 200 }, 'phase 1 should be green@200/off200');
  assert.deepEqual(result.contract.params.phases[1], { colors: ['blue', 'red'], periodMs: 50, offMs: 50 }, 'phase 2 should be blue+red@50/off50');
  assert.deepEqual(result.contract.params.phases[2], { colors: ['blue', 'red'], periodMs: 50, offMs: 50 }, 'phase 3 should repeat blue+red@50/off50');
  const finalPhase = result.contract.params.phases[result.contract.params.phases.length - 1];
  assert.equal(finalPhase.pauseMs, 200, 'final phase should be pause 200ms');
  assert.match(result.response, /Phases:/i, 'response should render multi-phase output');
  assert.ok(
    result.execution.script.includes('"colors":["blue","red"],"on_ms":50,"off_ms":50'),
    'script should keep simultaneous blue+red phase'
  );
  assert.match(result.execution.script, /for (?:_|cycle_idx) in range\(3\):/i, 'script should run 3 outer cycles');
}

async function runExpandedRegressionTests() {
  await testWhiteStrobePatternContract();
  await testCyclePhraseVariants();
  await testColorStrobeSequenceParsing();
  await testMixedColorAndWhiteStrobeParsing();
  await testSimultaneousColorGroupPhrase();
  await testMultiPhaseMixedGroupAndSingleColorTiming();
  await testMultiPhasePhraseRespectsTwiceRepeat();
  await testMultiPhaseOffClauseAppliesRepeatToPriorPhase();
  await testMultiPhaseCommaSeparatedTailPhases();
  await testMultiPhaseIncludesPauseModifier();
  await testMultiPhaseIncludesWaitModifierAlias();
  await testMultiPhaseAsymmetricOnOffTiming();
  await testMultiPhaseCommaOnlySimultaneousGroupAndPause();
}

module.exports = {
  runExpandedRegressionTests
};
