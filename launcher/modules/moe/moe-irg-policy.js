/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  executeMode: 'live',
  autoExecuteLive: false,
  requireLlmPlanForLive: false,
  live: {
    executor: 'mpremote',
    timeoutMs: 60000
  },
  targets: ['raspberry-pi-pico', 'esp32'],
  pico: {
    allowedGpioMin: 0,
    allowedGpioMax: 28,
    minPeriodMs: 50,
    maxPeriodMs: 10000,
    defaultGpio: 25,
    defaultPeriodMs: 500,
    defaultIterations: 20,
    maxIterations: 10000,
    defaultSequenceCycles: 5,
    colorPins: {
      red: 2,
      blue: 3,
      green: 4
    }
  },
  esp32: {
    fqbn: 'esp32:esp32:esp32',
    sketchName: 'psf_irg_esp32',
    compileTimeoutMs: 180000,
    uploadTimeoutMs: 120000,
    monitorBaudRate: 115200,
    wifiSsid: '',
    wifiPassword: '',
    wifiHost: '',
    wifiPort: 8080,
    wifiTimeoutMs: 5000,
    wifiDriveSpeed: 170,
    wifiDriveSwapSides: false,
    wifiDriveInvertLeft: false,
    wifiDriveInvertRight: false,
    wifiNumControlsEnabled: false,
    wifiAiDriveEnabled: false,
    wifiAiDriveAgentId: '',
    wifiAiDriveObjective: 'Explore safely and avoid obstacles.',
    wifiAiDriveTickMs: 420,
    wifiDriveMapForward: 'turn_left',
    wifiDriveMapReverse: 'turn_right',
    wifiDriveMapLeft: 'rev',
    wifiDriveMapRight: 'fwd',
    wifiObstacleFrontThreshold: 1500,
    wifiStaticEnabled: false,
    wifiStaticIp: '',
    wifiStaticCidr: 24,
    wifiStaticGatewayEnabled: false,
    wifiStaticGateway: ''
  }
});

function mergePolicy(gatewayConfig = {}) {
  const irg = gatewayConfig?.irg || {};
  const pico = irg?.pico || {};
  const esp32 = irg?.esp32 || {};
  const live = irg?.live || {};
  return {
    ...DEFAULT_POLICY,
    ...irg,
    live: {
      ...DEFAULT_POLICY.live,
      ...live
    },
    pico: {
      ...DEFAULT_POLICY.pico,
      ...pico
    },
    esp32: {
      ...DEFAULT_POLICY.esp32,
      ...esp32
    }
  };
}

function normalizeBindings(bindingInput) {
  const out = [];
  const list = Array.isArray(bindingInput) ? bindingInput : [];
  for (const entry of list) {
    const key = String(entry?.key || '').trim().toLowerCase();
    if (!key) continue;
    out.push({
      key,
      value: String(entry?.value ?? '').trim(),
      source: String(entry?.source || 'bindings')
    });
  }
  return out;
}

function normalizePlanKey(rawKey) {
  const key = String(rawKey || '').trim().toLowerCase().replace(/-/g, '_');
  if (!key) return '';
  if (key === 'period' || key === 'period_ms' || key === 'timing.period' || key === 'timing.period_ms') return 'timing.period_ms';
  if (key === 'cycle' || key === 'cycles' || key === 'timing.cycle' || key === 'timing.cycles') return 'timing.cycles';
  if (key === 'iteration' || key === 'iterations' || key === 'blink' || key === 'blinks' || key === 'times') return 'timing.iterations';
  if (key === 'gpio' || key === 'default_gpio' || key === 'gpio.default_gpio') return 'gpio.default';
  if (key === 'red_pin' || key === 'gpio_red') return 'gpio.red';
  if (key === 'blue_pin' || key === 'gpio_blue') return 'gpio.blue';
  if (key === 'green_pin' || key === 'gpio_green') return 'gpio.green';
  if (key === 'color.red' || key === 'pico.color.red') return 'gpio.red';
  if (key === 'color.blue' || key === 'pico.color.blue') return 'gpio.blue';
  if (key === 'color.green' || key === 'pico.color.green') return 'gpio.green';
  if (key === 'esp32.host' || key === 'esp32.wifi_host' || key === 'wifi.host') return 'esp32.wifi_host';
  if (key === 'esp32.port' || key === 'esp32.wifi_port' || key === 'wifi.port') return 'esp32.wifi_port';
  if (key === 'esp32.wifi_timeout_ms' || key === 'wifi.timeout_ms') return 'esp32.wifi_timeout_ms';
  if (key.startsWith('gpio.') || key.startsWith('timing.') || key.startsWith('pico.')) return key;
  return '';
}

function findCycleCount(text) {
  const raw = String(text || '');
  if (!raw) return null;
  const readLastInteger = (pattern) => {
    let last = null;
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(raw)) !== null) {
      const parsed = Number(match[1]);
      if (Number.isInteger(parsed) && parsed >= 1) {
        last = parsed;
      }
    }
    return last;
  };

  // Prefer explicit cycle wording over generic "times".
  const explicitCyclePatterns = [
    /\bcycle\s*count\s*[:=]?\s*(\d{1,6})\b/ig,
    /\bcycles?\s*[:=]?\s*(\d{1,6})\b/ig,
    /\b(?:run|repeat|rerun|execute|cycle)\s+(?:the\s+)?(?:full\s+)?(?:sequence|pattern|loop|this)?\s*(?:for\s+)?(\d{1,6})\s*(?:cycles?|times?|loops?)\b/ig,
    /\b(?:for\s+)?(\d{1,6})\s*(cycles?|loops?)\b/ig
  ];
  for (const pattern of explicitCyclePatterns) {
    const value = readLastInteger(pattern);
    if (value != null) {
      return value;
    }
  }

  // Fallback: "times" can mean local phase repeats; use the last value.
  const genericTimes = readLastInteger(/\b(?:for\s+)?(\d{1,6})\s*(times?)\b/ig);
  if (genericTimes != null) return genericTimes;

  // Semantic counts for natural language prompts.
  if (/\b(couple|a couple)\b.*\b(cycles?|times?|loops?)\b/i.test(raw) || /\b(cycles?|times?|loops?)\b.*\b(couple|a couple)\b/i.test(raw)) {
    return 2;
  }
  if (/\b(few|a few)\b.*\b(cycles?|times?|loops?)\b/i.test(raw) || /\b(cycles?|times?|loops?)\b.*\b(few|a few)\b/i.test(raw)) {
    return 3;
  }
  if (/\b(several)\b.*\b(cycles?|times?|loops?)\b/i.test(raw) || /\b(cycles?|times?|loops?)\b.*\b(several)\b/i.test(raw)) {
    return 4;
  }

  return null;
}

function parsePlanBindings(planText) {
  const text = String(planText || '').trim();
  if (!text) return [];
  const bindings = [];
  const seenValuesByKey = new Map();
  const pushBinding = (rawKey, rawValue) => {
    const key = normalizePlanKey(rawKey);
    const value = String(rawValue ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (!key || value === '') return;
    const normalizedValue = value.toLowerCase();
    if (!seenValuesByKey.has(key)) {
      seenValuesByKey.set(key, new Set([normalizedValue]));
    } else {
      seenValuesByKey.get(key).add(normalizedValue);
    }
    bindings.push({ key, value, source: 'llm-plan' });
  };

  const kvRegex = /([a-z][a-z0-9_.-]{1,})\s*[:=]\s*([^\s,;]+)/ig;
  let kvMatch;
  while ((kvMatch = kvRegex.exec(text)) !== null) {
    pushBinding(kvMatch[1], kvMatch[2]);
  }

  if (!bindings.some((entry) => entry.key === 'timing.period_ms')) {
    const msMatch = text.match(/\b(\d{1,5})\s*(ms|millisecond|milliseconds)\b/i);
    if (msMatch) pushBinding('timing.period_ms', msMatch[1]);
  }
  if (!bindings.some((entry) => entry.key === 'timing.cycles')) {
    const cyclesMatch = findCycleCount(text);
    if (cyclesMatch != null) pushBinding('timing.cycles', cyclesMatch);
  }
  if (!bindings.some((entry) => entry.key === 'timing.iterations')) {
    const iterationsMatch = text.match(/\b(\d{1,6})\s*(times|blinks|iterations)\b/i);
    if (iterationsMatch) pushBinding('timing.iterations', iterationsMatch[1]);
  }

  const deduped = new Map();
  for (const entry of bindings) {
    const uniqueValues = seenValuesByKey.get(entry.key);
    // If the plan emits conflicting values for the same key in one response,
    // treat it as ambiguous and ignore the key instead of "last value wins".
    if (uniqueValues && uniqueValues.size > 1) continue;
    deduped.set(entry.key, entry);
  }
  return Array.from(deduped.values());
}

function toNumberOrNull(value) {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function applyBindingsToPolicy(policy, bindings = []) {
  const next = {
    ...policy,
    pico: {
      ...policy.pico,
      colorPins: {
        ...policy?.pico?.colorPins
      }
    },
    esp32: {
      ...policy.esp32
    }
  };
  const resolution = [];
  const map = new Map(bindings.map((b) => [b.key, b]));

  const applyInteger = (keys, applyFn, label, min = null, max = null) => {
    for (const key of keys) {
      const hit = map.get(key);
      if (!hit) continue;
      const parsed = toNumberOrNull(hit.value);
      if (parsed == null) continue;
      const rounded = Math.round(parsed);
      if ((min != null && rounded < min) || (max != null && rounded > max)) continue;
      applyFn(rounded);
      resolution.push({ field: label, value: rounded, source: `bindings:${hit.source}:${key}` });
      return;
    }
  };

  applyInteger(['gpio.default', 'pico.default_gpio'], (v) => { next.pico.defaultGpio = v; }, 'defaultGpio', policy.pico.allowedGpioMin, policy.pico.allowedGpioMax);
  applyInteger(['gpio.red', 'gpio.red_pin', 'pico.color.red'], (v) => { next.pico.colorPins.red = v; }, 'redPin', policy.pico.allowedGpioMin, policy.pico.allowedGpioMax);
  applyInteger(['gpio.blue', 'gpio.blue_pin', 'pico.color.blue'], (v) => { next.pico.colorPins.blue = v; }, 'bluePin', policy.pico.allowedGpioMin, policy.pico.allowedGpioMax);
  applyInteger(['gpio.green', 'gpio.green_pin', 'pico.color.green'], (v) => { next.pico.colorPins.green = v; }, 'greenPin', policy.pico.allowedGpioMin, policy.pico.allowedGpioMax);
  applyInteger(['timing.period_ms', 'pico.default_period_ms'], (v) => { next.pico.defaultPeriodMs = v; }, 'defaultPeriodMs', policy.pico.minPeriodMs, policy.pico.maxPeriodMs);
  applyInteger(['timing.iterations', 'pico.default_iterations'], (v) => { next.pico.defaultIterations = v; }, 'defaultIterations', 1, policy.pico.maxIterations);
  applyInteger(['timing.cycles', 'pico.default_sequence_cycles'], (v) => { next.pico.defaultSequenceCycles = v; }, 'defaultSequenceCycles', 1, policy.pico.maxIterations);
  applyInteger(['esp32.wifi_port', 'esp32.port', 'wifi.port'], (v) => { next.esp32.wifiPort = v; }, 'esp32WifiPort', 1, 65535);
  applyInteger(['esp32.wifi_timeout_ms', 'wifi.timeout_ms'], (v) => { next.esp32.wifiTimeoutMs = v; }, 'esp32WifiTimeoutMs', 1000, 60000);

  const hostEntry = map.get('esp32.wifi_host') || map.get('esp32.host') || map.get('wifi.host');
  if (hostEntry && String(hostEntry.value || '').trim()) {
    const hostValue = String(hostEntry.value || '').trim();
    next.esp32.wifiHost = hostValue;
    resolution.push({ field: 'esp32WifiHost', value: hostValue, source: `bindings:${hostEntry.source}:${hostEntry.key}` });
  }

  return { policy: next, resolution };
}

function classifyFieldSource(appliedResolution = [], fieldName) {
  const hit = appliedResolution.find((entry) => entry.field === fieldName);
  if (!hit) return 'gateway-default';
  return String(hit.source || '').includes('bindings:llm-plan:') ? 'llm' : 'bindings';
}

function buildResolutionTrace(contract, policy, applied) {
  const resolution = Array.isArray(applied?.resolution) ? applied.resolution : [];
  if (!contract?.params) return null;
  if (
    contract.action === 'blink_color_sequence' ||
    contract.action === 'blink_pattern_sequence' ||
    contract.action === 'blink_color_group' ||
    contract.action === 'blink_multi_phase'
  ) {
    const periodSource = classifyFieldSource(resolution, 'defaultPeriodMs');
    const cyclesSource = classifyFieldSource(resolution, 'defaultSequenceCycles');
    const redSource = classifyFieldSource(resolution, 'redPin');
    const blueSource = classifyFieldSource(resolution, 'bluePin');
    const greenSource = classifyFieldSource(resolution, 'greenPin');
    const planSource = [periodSource, cyclesSource, redSource, blueSource, greenSource].includes('llm')
      ? 'llm'
      : ([periodSource, cyclesSource, redSource, blueSource, greenSource].includes('bindings') ? 'bindings' : 'gateway-default');
    return {
      planSource,
      periodMs: Number(contract.params.periodMs),
      periodSource,
      cycles: Number(contract.params.cycles),
      cyclesSource,
      pins: {
        red: Number(policy?.pico?.colorPins?.red),
        blue: Number(policy?.pico?.colorPins?.blue),
        green: Number(policy?.pico?.colorPins?.green)
      },
      pinSources: { red: redSource, blue: blueSource, green: greenSource }
    };
  }

  const periodSource = classifyFieldSource(resolution, 'defaultPeriodMs');
  const iterationsSource = classifyFieldSource(resolution, 'defaultIterations');
  const gpioSource = classifyFieldSource(resolution, 'defaultGpio');
  const planSource = [periodSource, iterationsSource, gpioSource].includes('llm')
    ? 'llm'
    : ([periodSource, iterationsSource, gpioSource].includes('bindings') ? 'bindings' : 'gateway-default');
  return {
    planSource,
    periodMs: Number(contract.params.periodMs),
    periodSource,
    iterations: Number(contract.params.iterations),
    iterationsSource,
    gpio: Number(contract.params.gpio),
    gpioSource
  };
}

module.exports = {
  DEFAULT_POLICY,
  mergePolicy,
  normalizeBindings,
  parsePlanBindings,
  applyBindingsToPolicy,
  buildResolutionTrace,
  findCycleCount
};
