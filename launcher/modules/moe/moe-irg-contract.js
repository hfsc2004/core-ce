/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { isAllowedEsp32WifiPath } = require('./moe-esp32-wifi');

function validateContract(contract, policy) {
  const errors = [];
  const target = String(contract?.target || '').trim().toLowerCase();
  if (!contract || (target !== 'raspberry-pi-pico' && target !== 'esp32')) {
    return { valid: false, errors: ['Unsupported contract'] };
  }
  if (target === 'esp32') {
    if (contract.action === 'push_esp32_code') {
      const code = String(contract?.params?.code || '').trim();
      if (!code) errors.push('params.code is required for esp32 push');
      if (code.length > 500000) errors.push('params.code exceeds maximum size (500000 chars)');
      const language = String(contract?.params?.language || 'arduino-cpp').trim().toLowerCase();
      const allowedLang = new Set(['arduino-cpp', 'cpp', 'c++', 'ino']);
      if (!allowedLang.has(language)) errors.push(`unsupported language "${language}"`);
      return { valid: errors.length === 0, errors };
    }
    if (contract.action === 'esp32_wifi_http') {
      const host = String(contract?.params?.host || '').trim();
      const path = String(contract?.params?.path || '').trim();
      const method = String(contract?.params?.method || 'GET').trim().toUpperCase();
      const port = Number(contract?.params?.port);
      const timeoutMs = Number(contract?.params?.timeoutMs);
      if (!host) errors.push('params.host is required for esp32 wifi command');
      if (!path || !path.startsWith('/')) errors.push('params.path must start with "/"');
      if (path && !isAllowedEsp32WifiPath(path)) errors.push('params.path is not an allowed esp32 wifi endpoint');
      if (method !== 'GET') errors.push('params.method must be GET');
      if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('params.port must be between 1 and 65535');
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) errors.push('params.timeoutMs must be between 1000 and 60000');
      return { valid: errors.length === 0, errors };
    }
    return { valid: false, errors: [`Unsupported action for esp32: ${contract.action}`] };
  }

  if (contract.action === 'blink_gpio') {
    const periodMs = Number(contract?.params?.periodMs);
    if (!Number.isFinite(periodMs) || periodMs < policy.pico.minPeriodMs || periodMs > policy.pico.maxPeriodMs) {
      errors.push(`periodMs must be between ${policy.pico.minPeriodMs} and ${policy.pico.maxPeriodMs}`);
    }
    const gpio = Number(contract?.params?.gpio);
    const iterations = Number(contract?.params?.iterations);
    if (!Number.isInteger(gpio) || gpio < policy.pico.allowedGpioMin || gpio > policy.pico.allowedGpioMax) {
      errors.push(`gpio must be between ${policy.pico.allowedGpioMin} and ${policy.pico.allowedGpioMax}`);
    }
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > policy.pico.maxIterations) {
      errors.push(`iterations must be between 1 and ${policy.pico.maxIterations}`);
    }
  } else if (contract.action === 'blink_color_sequence' || contract.action === 'blink_pattern_sequence' || contract.action === 'blink_color_group') {
    const periodMs = Number(contract?.params?.periodMs);
    if (!Number.isFinite(periodMs) || periodMs < policy.pico.minPeriodMs || periodMs > policy.pico.maxPeriodMs) {
      errors.push(`periodMs must be between ${policy.pico.minPeriodMs} and ${policy.pico.maxPeriodMs}`);
    }
    const colors = Array.isArray(contract?.params?.colors) ? contract.params.colors : [];
    const cycles = Number(contract?.params?.cycles);
    if (colors.length === 0) errors.push('colors must include at least one color');
    const allowedColors = new Set(['red', 'blue', 'white', 'green']);
    for (const color of colors) {
      if (!allowedColors.has(String(color || '').toLowerCase())) {
        errors.push(`unsupported color "${color}"`);
      }
    }
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > policy.pico.maxIterations) {
      errors.push(`cycles must be between 1 and ${policy.pico.maxIterations}`);
    }
    if (contract.action === 'blink_pattern_sequence') {
      const whiteBurstCount = Number(contract?.params?.whiteBurstCount);
      const whiteBurstOnMs = Number(contract?.params?.whiteBurstOnMs);
      const whiteBurstOffMs = Number(contract?.params?.whiteBurstOffMs);
      if (!Number.isInteger(whiteBurstCount) || whiteBurstCount < 1 || whiteBurstCount > 20) {
        errors.push('whiteBurstCount must be an integer between 1 and 20');
      }
      if (!Number.isFinite(whiteBurstOnMs) || whiteBurstOnMs < policy.pico.minPeriodMs || whiteBurstOnMs > policy.pico.maxPeriodMs) {
        errors.push(`whiteBurstOnMs must be between ${policy.pico.minPeriodMs} and ${policy.pico.maxPeriodMs}`);
      }
      if (!Number.isFinite(whiteBurstOffMs) || whiteBurstOffMs < policy.pico.minPeriodMs || whiteBurstOffMs > policy.pico.maxPeriodMs) {
        errors.push(`whiteBurstOffMs must be between ${policy.pico.minPeriodMs} and ${policy.pico.maxPeriodMs}`);
      }
    }
    const redPin = Number(policy?.pico?.colorPins?.red);
    const bluePin = Number(policy?.pico?.colorPins?.blue);
    const greenPin = Number(policy?.pico?.colorPins?.green);
    for (const [name, pin] of [['red', redPin], ['blue', bluePin], ['green', greenPin]]) {
      if (!Number.isInteger(pin) || pin < policy.pico.allowedGpioMin || pin > policy.pico.allowedGpioMax) {
        errors.push(`${name} pin must be between ${policy.pico.allowedGpioMin} and ${policy.pico.allowedGpioMax}`);
      }
    }
  } else if (contract.action === 'blink_multi_phase') {
    const phases = Array.isArray(contract?.params?.phases) ? contract.params.phases : [];
    const cycles = Number(contract?.params?.cycles);
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > policy.pico.maxIterations) {
      errors.push(`cycles must be between 1 and ${policy.pico.maxIterations}`);
    }
    if (phases.length < 2) {
      errors.push('phases must include at least two phase entries');
    }
    const allowedColors = new Set(['red', 'blue', 'white', 'green']);
    for (const phase of phases) {
      const pauseMs = Number(phase?.pauseMs);
      if (Number.isFinite(pauseMs)) {
        if (pauseMs < policy.pico.minPeriodMs || pauseMs > policy.pico.maxPeriodMs) {
          errors.push(`pauseMs must be between ${policy.pico.minPeriodMs} and ${policy.pico.maxPeriodMs}`);
        }
        continue;
      }
      const phaseColors = Array.isArray(phase?.colors) ? phase.colors : [];
      const phasePeriod = Number(phase?.periodMs);
      const offMsRaw = phase?.offMs;
      const offMs = offMsRaw == null ? phasePeriod : Number(offMsRaw);
      if (phaseColors.length === 0) {
        errors.push('each phase must include at least one color');
        continue;
      }
      if (!Number.isFinite(phasePeriod) || phasePeriod < policy.pico.minPeriodMs || phasePeriod > policy.pico.maxPeriodMs) {
        errors.push(`phase periodMs must be between ${policy.pico.minPeriodMs} and ${policy.pico.maxPeriodMs}`);
      }
      if (!Number.isFinite(offMs) || offMs < policy.pico.minPeriodMs || offMs > policy.pico.maxPeriodMs) {
        errors.push(`phase offMs must be between ${policy.pico.minPeriodMs} and ${policy.pico.maxPeriodMs}`);
      }
      for (const color of phaseColors) {
        if (!allowedColors.has(String(color || '').toLowerCase())) {
          errors.push(`unsupported color "${color}"`);
        }
      }
    }
    const redPin = Number(policy?.pico?.colorPins?.red);
    const bluePin = Number(policy?.pico?.colorPins?.blue);
    const greenPin = Number(policy?.pico?.colorPins?.green);
    for (const [name, pin] of [['red', redPin], ['blue', bluePin], ['green', greenPin]]) {
      if (!Number.isInteger(pin) || pin < policy.pico.allowedGpioMin || pin > policy.pico.allowedGpioMax) {
        errors.push(`${name} pin must be between ${policy.pico.allowedGpioMin} and ${policy.pico.allowedGpioMax}`);
      }
    }
    const moodVariation = contract?.params?.moodVariation;
    if (moodVariation != null) {
      if (typeof moodVariation !== 'object' || Array.isArray(moodVariation)) {
        errors.push('moodVariation must be an object when provided');
      } else {
        const pctFields = ['onJitterPct', 'offJitterPct', 'pauseJitterPct'];
        for (const field of pctFields) {
          if (moodVariation[field] == null) continue;
          const value = Number(moodVariation[field]);
          if (!Number.isFinite(value) || value < 0 || value > 0.9) {
            errors.push(`${field} must be between 0 and 0.9`);
          }
        }
        if (moodVariation.cycleRampPct != null) {
          const value = Number(moodVariation.cycleRampPct);
          if (!Number.isFinite(value) || value < 0 || value > 0.5) {
            errors.push('cycleRampPct must be between 0 and 0.5');
          }
        }
        if (moodVariation.minRampFactor != null) {
          const value = Number(moodVariation.minRampFactor);
          if (!Number.isFinite(value) || value < 0.2 || value > 1.0) {
            errors.push('minRampFactor must be between 0.2 and 1.0');
          }
        }
      }
    }
  } else {
    errors.push(`Unsupported action: ${contract.action}`);
  }

  return { valid: errors.length === 0, errors };
}

function buildPicoMicroPythonProgram(contract) {
  if (contract.action === 'blink_pattern_sequence') {
    return buildPicoPatternSequenceProgram(contract);
  }
  if (contract.action === 'blink_color_group') {
    return buildPicoColorGroupProgram(contract);
  }
  if (contract.action === 'blink_multi_phase') {
    return buildPicoMultiPhaseProgram(contract);
  }
  if (contract.action === 'blink_color_sequence') {
    return buildPicoColorSequenceProgram(contract);
  }

  const gpio = Number(contract.params.gpio);
  const periodMs = Number(contract.params.periodMs);
  const iterations = Number(contract.params.iterations);
  return [
    'from machine import Pin',
    'import time',
    '',
    `led = Pin(${gpio}, Pin.OUT)`,
    `for _ in range(${iterations}):`,
    '    led.on()',
    `    time.sleep_ms(${periodMs})`,
    '    led.off()',
    `    time.sleep_ms(${periodMs})`,
    '',
    'print("IRG blink complete")'
  ].join('\n');
}

function buildPicoColorSequenceProgram(contract) {
  const periodMs = Number(contract.params.periodMs);
  const cycles = Number(contract.params.cycles);
  const colors = (Array.isArray(contract.params.colors) ? contract.params.colors : []).map((c) => String(c).toLowerCase());
  const pins = contract?.params?.pins || {};
  const redPin = Number(pins.red);
  const bluePin = Number(pins.blue);
  const greenPin = Number(pins.green);
  const colorListLiteral = `[${colors.map((c) => `'${c}'`).join(', ')}]`;

  return [
    'from machine import Pin',
    'import time',
    '',
    `red = Pin(${redPin}, Pin.OUT)`,
    `blue = Pin(${bluePin}, Pin.OUT)`,
    `green = Pin(${greenPin}, Pin.OUT)`,
    '',
    'def all_off():',
    '    red.off()',
    '    blue.off()',
    '    green.off()',
    '',
    'def set_color(name):',
    '    all_off()',
    "    if name == 'red':",
    '        red.on()',
    "    elif name == 'blue':",
    '        blue.on()',
    "    elif name == 'white':",
    '        red.on()',
    '        blue.on()',
    "    elif name == 'green':",
    '        green.on()',
    '',
    `colors = ${colorListLiteral}`,
    `for _ in range(${cycles}):`,
    '    for color in colors:',
    '        set_color(color)',
    `        time.sleep_ms(${periodMs})`,
    '        all_off()',
    `        time.sleep_ms(${periodMs})`,
    '',
    'print("IRG blink complete")'
  ].join('\n');
}

function buildPicoColorGroupProgram(contract) {
  const periodMs = Number(contract.params.periodMs);
  const cycles = Number(contract.params.cycles);
  const colors = (Array.isArray(contract.params.colors) ? contract.params.colors : []).map((c) => String(c).toLowerCase());
  const pins = contract?.params?.pins || {};
  const redPin = Number(pins.red);
  const bluePin = Number(pins.blue);
  const greenPin = Number(pins.green);
  const colorListLiteral = `[${colors.map((c) => `'${c}'`).join(', ')}]`;

  return [
    'from machine import Pin',
    'import time',
    '',
    `red = Pin(${redPin}, Pin.OUT)`,
    `blue = Pin(${bluePin}, Pin.OUT)`,
    `green = Pin(${greenPin}, Pin.OUT)`,
    '',
    'def all_off():',
    '    red.off()',
    '    blue.off()',
    '    green.off()',
    '',
    'def apply_group(group):',
    '    all_off()',
    '    for name in group:',
    "        if name == 'red':",
    '            red.on()',
    "        elif name == 'blue':",
    '            blue.on()',
    "        elif name == 'white':",
    '            red.on()',
    '            blue.on()',
    "        elif name == 'green':",
    '            green.on()',
    '',
    `group = ${colorListLiteral}`,
    `for _ in range(${cycles}):`,
    '    apply_group(group)',
    `    time.sleep_ms(${periodMs})`,
    '    all_off()',
    `    time.sleep_ms(${periodMs})`,
    '',
    'print("IRG blink complete")'
  ].join('\n');
}

function buildPicoPatternSequenceProgram(contract) {
  const periodMs = Number(contract.params.periodMs);
  const cycles = Number(contract.params.cycles);
  const colors = (Array.isArray(contract.params.colors) ? contract.params.colors : []).map((c) => String(c).toLowerCase());
  const whiteBurstCount = Number(contract.params.whiteBurstCount);
  const whiteBurstOnMs = Number(contract.params.whiteBurstOnMs);
  const whiteBurstOffMs = Number(contract.params.whiteBurstOffMs);
  const pins = contract?.params?.pins || {};
  const redPin = Number(pins.red);
  const bluePin = Number(pins.blue);
  const greenPin = Number(pins.green);
  const colorListLiteral = `[${colors.map((c) => `'${c}'`).join(', ')}]`;

  return [
    'from machine import Pin',
    'import time',
    '',
    `red = Pin(${redPin}, Pin.OUT)`,
    `blue = Pin(${bluePin}, Pin.OUT)`,
    `green = Pin(${greenPin}, Pin.OUT)`,
    '',
    'def all_off():',
    '    red.off()',
    '    blue.off()',
    '    green.off()',
    '',
    'def set_color(name):',
    '    all_off()',
    "    if name == 'red':",
    '        red.on()',
    "    elif name == 'blue':",
    '        blue.on()',
    "    elif name == 'white':",
    '        red.on()',
    '        blue.on()',
    "    elif name == 'green':",
    '        green.on()',
    '',
    `colors = ${colorListLiteral}`,
    `for _ in range(${cycles}):`,
    `    for _ in range(${whiteBurstCount}):`,
    "        set_color('white')",
    `        time.sleep_ms(${whiteBurstOnMs})`,
    '        all_off()',
    `        time.sleep_ms(${whiteBurstOffMs})`,
    '    for color in colors:',
    '        set_color(color)',
    `        time.sleep_ms(${periodMs})`,
    '        all_off()',
    `        time.sleep_ms(${periodMs})`,
    '',
    'print("IRG blink complete")'
  ].join('\n');
}

function buildPicoMultiPhaseProgram(contract) {
  const cycles = Number(contract.params.cycles);
  const phases = (Array.isArray(contract.params.phases) ? contract.params.phases : [])
    .map((phase) => {
      const pauseMs = Number(phase?.pauseMs);
      if (Number.isFinite(pauseMs)) {
        return { kind: 'pause', pauseMs: Math.round(pauseMs) };
      }
      const onMs = Number(phase?.periodMs);
      const offMs = phase?.offMs == null ? onMs : Number(phase?.offMs);
      return {
        kind: 'group',
        colors: Array.isArray(phase?.colors) ? phase.colors.map((c) => String(c).toLowerCase()) : [],
        onMs,
        offMs
      };
    })
    .filter((phase) => (phase.kind === 'pause' && Number.isFinite(phase.pauseMs) && phase.pauseMs > 0)
      || (phase.kind === 'group' && Array.isArray(phase.colors) && phase.colors.length > 0 && Number.isFinite(phase.onMs) && Number.isFinite(phase.offMs)));
  const pins = contract?.params?.pins || {};
  const redPin = Number(pins.red);
  const bluePin = Number(pins.blue);
  const greenPin = Number(pins.green);
  const moodVariation = (contract?.params?.moodVariation && typeof contract.params.moodVariation === 'object')
    ? contract.params.moodVariation
    : {};
  const variationEnabled = moodVariation.enabled === true;
  const onJitterPct = Number.isFinite(Number(moodVariation.onJitterPct))
    ? Math.max(0, Math.min(0.9, Number(moodVariation.onJitterPct)))
    : 0;
  const offJitterPct = Number.isFinite(Number(moodVariation.offJitterPct))
    ? Math.max(0, Math.min(0.9, Number(moodVariation.offJitterPct)))
    : 0;
  const pauseJitterPct = Number.isFinite(Number(moodVariation.pauseJitterPct))
    ? Math.max(0, Math.min(0.9, Number(moodVariation.pauseJitterPct)))
    : 0;
  const cycleRampPct = Number.isFinite(Number(moodVariation.cycleRampPct))
    ? Math.max(0, Math.min(0.5, Number(moodVariation.cycleRampPct)))
    : 0;
  const minRampFactor = Number.isFinite(Number(moodVariation.minRampFactor))
    ? Math.max(0.2, Math.min(1.0, Number(moodVariation.minRampFactor)))
    : 0.6;
  const phaseLiteral = `[${phases.map((phase) => {
    if (phase.kind === 'pause') return `{"kind":"pause","pause_ms":${Math.round(phase.pauseMs)}}`;
    return `{"kind":"group","colors":${JSON.stringify(phase.colors)},"on_ms":${Math.round(phase.onMs)},"off_ms":${Math.round(phase.offMs)}}`;
  }).join(', ')}]`;

  return [
    'from machine import Pin',
    'import time',
    variationEnabled ? 'import urandom' : '',
    '',
    `red = Pin(${redPin}, Pin.OUT)`,
    `blue = Pin(${bluePin}, Pin.OUT)`,
    `green = Pin(${greenPin}, Pin.OUT)`,
    '',
    'def all_off():',
    '    red.off()',
    '    blue.off()',
    '    green.off()',
    '',
    'def apply_group(group):',
    '    all_off()',
    '    for name in group:',
    "        if name == 'red':",
    '            red.on()',
    "        elif name == 'blue':",
    '            blue.on()',
    "        elif name == 'white':",
    '            red.on()',
    '            blue.on()',
    "        elif name == 'green':",
    '            green.on()',
    '',
    variationEnabled ? `ON_JITTER_PCT = ${onJitterPct}` : '',
    variationEnabled ? `OFF_JITTER_PCT = ${offJitterPct}` : '',
    variationEnabled ? `PAUSE_JITTER_PCT = ${pauseJitterPct}` : '',
    variationEnabled ? `CYCLE_RAMP_PCT = ${cycleRampPct}` : '',
    variationEnabled ? `MIN_RAMP_FACTOR = ${minRampFactor}` : '',
    variationEnabled ? 'MIN_SLEEP_MS = 50' : '',
    variationEnabled ? '' : '',
    variationEnabled ? 'def jitter_ms(base_ms, pct):' : '',
    variationEnabled ? '    if pct <= 0:' : '',
    variationEnabled ? '        return base_ms' : '',
    variationEnabled ? '    span = int(base_ms * pct)' : '',
    variationEnabled ? '    if span < 1:' : '',
    variationEnabled ? '        return base_ms' : '',
    variationEnabled ? '    delta = (urandom.getrandbits(16) % (span * 2 + 1)) - span' : '',
    variationEnabled ? '    out = base_ms + delta' : '',
    variationEnabled ? '    if out < MIN_SLEEP_MS:' : '',
    variationEnabled ? '        out = MIN_SLEEP_MS' : '',
    variationEnabled ? '    return out' : '',
    variationEnabled ? '' : '',
    `phases = ${phaseLiteral}`,
    `for cycle_idx in range(${cycles}):`,
    variationEnabled ? '    cycle_factor = 1.0 - (cycle_idx * CYCLE_RAMP_PCT)' : '',
    variationEnabled ? '    if cycle_factor < MIN_RAMP_FACTOR:' : '',
    variationEnabled ? '        cycle_factor = MIN_RAMP_FACTOR' : '',
    '    for phase in phases:',
    "        if phase['kind'] == 'pause':",
    '            all_off()',
    variationEnabled
      ? "            time.sleep_ms(jitter_ms(int(phase['pause_ms'] * cycle_factor), PAUSE_JITTER_PCT))"
      : "            time.sleep_ms(phase['pause_ms'])",
    '            continue',
    "        apply_group(phase['colors'])",
    variationEnabled
      ? "        time.sleep_ms(jitter_ms(int(phase['on_ms'] * cycle_factor), ON_JITTER_PCT))"
      : "        time.sleep_ms(phase['on_ms'])",
    '        all_off()',
    variationEnabled
      ? "        time.sleep_ms(jitter_ms(int(phase['off_ms'] * cycle_factor), OFF_JITTER_PCT))"
      : "        time.sleep_ms(phase['off_ms'])",
    '',
    'print("IRG blink complete")'
  ].filter(Boolean).join('\n');
}

function buildEsp32SketchProgram(contract) {
  return String(contract?.params?.code || '').replace(/\r\n/g, '\n').trim();
}

function buildEsp32WifiHttpProgram(contract) {
  const host = String(contract?.params?.host || '').trim();
  const port = Number(contract?.params?.port);
  const path = String(contract?.params?.path || '').trim();
  const method = String(contract?.params?.method || 'GET').trim().toUpperCase();
  return `${method} http://${host}:${port}${path}`;
}

module.exports = {
  validateContract,
  buildPicoMicroPythonProgram,
  buildEsp32SketchProgram,
  buildEsp32WifiHttpProgram
};
