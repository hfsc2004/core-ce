/**
 * MoE IRG plan parsing/normalization helpers.
 */

const { normalizeWifiPath, isAllowedEsp32WifiPath } = require('./moe-esp32-wifi');

function applyPlanOverrides(contract, planBindings = [], policy) {
  if (!contract || !Array.isArray(planBindings) || planBindings.length === 0) {
    return contract;
  }
  const byKey = new Map(planBindings.map((entry) => [entry.key, entry.value]));
  const numberOrNull = (key) => {
    const value = byKey.get(key);
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  };

  const next = JSON.parse(JSON.stringify(contract));
  const periodMs = numberOrNull('timing.period_ms');
  if (Number.isInteger(periodMs) && periodMs >= policy.pico.minPeriodMs && periodMs <= policy.pico.maxPeriodMs) {
    next.params.periodMs = periodMs;
  }

  if (next.action === 'blink_color_sequence' || next.action === 'blink_pattern_sequence') {
    const cycles = numberOrNull('timing.cycles') ?? numberOrNull('timing.iterations');
    if (Number.isInteger(cycles) && cycles >= 1 && cycles <= policy.pico.maxIterations) {
      next.params.cycles = cycles;
    }
  } else if (next.action === 'blink_color_group') {
    const cycles = numberOrNull('timing.cycles') ?? numberOrNull('timing.iterations');
    if (Number.isInteger(cycles) && cycles >= 1 && cycles <= policy.pico.maxIterations) {
      next.params.cycles = cycles;
    }
  } else if (next.action === 'blink_multi_phase') {
    const cycles = numberOrNull('timing.cycles') ?? numberOrNull('timing.iterations');
    if (Number.isInteger(cycles) && cycles >= 1 && cycles <= policy.pico.maxIterations) {
      next.params.cycles = cycles;
    }
  } else if (next.action === 'blink_gpio') {
    const iterations = numberOrNull('timing.iterations') ?? numberOrNull('timing.cycles');
    if (Number.isInteger(iterations) && iterations >= 1 && iterations <= policy.pico.maxIterations) {
      next.params.iterations = iterations;
    }
    const gpio = numberOrNull('gpio.default');
    if (Number.isInteger(gpio) && gpio >= policy.pico.allowedGpioMin && gpio <= policy.pico.allowedGpioMax) {
      next.params.gpio = gpio;
    }
  }
  return next;
}

function parseLlmPlanContract(planText, policy) {
  const text = String(planText || '').trim();
  if (!text) return null;
  const candidate = extractPlanJsonObject(text);
  if (!candidate || typeof candidate !== 'object') return null;
  return normalizePlanContract(candidate, policy);
}

function extractPlanJsonObject(text) {
  const markerMatch = text.match(/IRG_PLAN_JSON\s*:\s*([\s\S]+)/i);
  if (markerMatch) {
    const parsed = safeParseJsonObject(markerMatch[1]);
    if (parsed) return parsed;
  }

  const fencedMatches = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/ig));
  for (const match of fencedMatches) {
    const parsed = safeParseJsonObject(match[1]);
    if (parsed) return parsed;
  }

  return safeParseJsonObject(text);
}

function safeParseJsonObject(raw) {
  const source = String(raw || '').trim();
  if (!source.includes('{')) return null;
  const recovered = recoverJsonObjectSlice(source);
  if (!recovered) return null;
  try {
    const parsed = JSON.parse(recovered);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function recoverJsonObjectSlice(source) {
  const start = source.indexOf('{');
  if (start < 0) return null;
  const trimmed = source.slice(start).trim();
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(0, i + 1);
      }
    }
  }
  if (depth > 0) {
    return `${trimmed}${'}'.repeat(depth)}`;
  }
  return null;
}

function normalizePlanContract(candidate, policy) {
  const action = String(candidate?.action || '').trim().toLowerCase();
  if (!action) return null;
  const targetInput = String(candidate?.target || '').trim().toLowerCase();
  const target = /esp-?32/.test(targetInput) ? 'esp32' : 'raspberry-pi-pico';
  const params = candidate?.params && typeof candidate.params === 'object' ? candidate.params : {};
  const cyclesDefault = Number(policy?.pico?.defaultSequenceCycles) || 5;
  const periodDefault = Number(policy?.pico?.defaultPeriodMs) || 500;

  if (action === 'push_esp32_code' || action === 'upload_esp32_code' || action === 'flash_esp32_code') {
    const code = String(params?.code ?? params?.sketch ?? params?.program ?? '').trim();
    if (!code) return null;
    const language = String(params?.language || 'arduino-cpp').trim().toLowerCase();
    const verificationContains = String(params?.verificationContains ?? params?.verification ?? '').trim();
    const fqbn = String(params?.fqbn || '').trim();
    const serialPort = String(params?.serialPort ?? params?.port ?? '').trim();
    const sketchName = String(params?.sketchName || '').trim();
    const cameraBoardProfile = String(params?.cameraBoardProfile || '').trim().toLowerCase();
    const uploadMode = String(params?.uploadMode || '').trim().toLowerCase();
    const chip = String(params?.chip || '').trim().toLowerCase();
    const strictNoFallback = params?.strictNoFallback === true;
    const eraseFlashBeforeUpload = params?.eraseFlashBeforeUpload === true;
    const compileTimeoutMs = Number(params?.compileTimeoutMs);
    const uploadTimeoutMs = Number(params?.uploadTimeoutMs);
    const normalizedParams = {
      language: language || 'arduino-cpp',
      code,
      verificationContains: verificationContains || extractLikelyVerificationToken(code) || 'Robot ready!'
    };
    if (fqbn) normalizedParams.fqbn = fqbn;
    if (serialPort) normalizedParams.serialPort = serialPort;
    if (sketchName) normalizedParams.sketchName = sketchName;
    if (cameraBoardProfile) normalizedParams.cameraBoardProfile = cameraBoardProfile;
    if (uploadMode) normalizedParams.uploadMode = uploadMode;
    if (chip) normalizedParams.chip = chip;
    if (strictNoFallback) normalizedParams.strictNoFallback = true;
    if (eraseFlashBeforeUpload) normalizedParams.eraseFlashBeforeUpload = true;
    if (Number.isFinite(compileTimeoutMs) && compileTimeoutMs >= 10000) {
      normalizedParams.compileTimeoutMs = Math.min(600000, Math.trunc(compileTimeoutMs));
    }
    if (Number.isFinite(uploadTimeoutMs) && uploadTimeoutMs >= 10000) {
      normalizedParams.uploadTimeoutMs = Math.min(600000, Math.trunc(uploadTimeoutMs));
    }
    return {
      contractVersion: '1.0',
      target: 'esp32',
      action: 'push_esp32_code',
      params: normalizedParams,
      source: { inferred: false, llmSelectedTool: true }
    };
  }

  if (action === 'esp32_wifi_http') {
    const host = String(
      params?.host
      ?? params?.wifiHost
      ?? params?.hostname
      ?? ''
    ).trim();
    const port = toBoundedInt(
      params?.port ?? params?.wifiPort,
      Number(policy?.esp32?.wifiPort) || 8080,
      1,
      65535
    );
    const timeoutMs = toBoundedInt(
      params?.timeoutMs ?? params?.timeout_ms ?? params?.wifiTimeoutMs,
      Number(policy?.esp32?.wifiTimeoutMs) || 5000,
      1000,
      60000
    );
    const method = String(params?.method || 'GET').trim().toUpperCase();
    const pathRaw = String(params?.path || '/health').trim();
    const path = normalizeWifiPath(pathRaw || '/health');
    const intent = String(params?.intent || '').trim().toLowerCase();
    if (!host || !Number.isInteger(port) || !Number.isInteger(timeoutMs) || method !== 'GET' || !isAllowedEsp32WifiPath(path)) {
      return null;
    }
    return {
      contractVersion: '1.0',
      target: 'esp32',
      action: 'esp32_wifi_http',
      params: {
        host,
        port,
        method: 'GET',
        path,
        timeoutMs,
        intent: intent || (path.includes('/scan') ? 'scan' : (path.includes('/telemetry') ? 'telemetry' : (path.includes('/cmd') ? 'cmd' : 'health')))
      },
      source: { inferred: false, llmSelectedTool: true }
    };
  }

  if (action === 'blink_gpio') {
    const gpioRefRaw = params.gpio ?? params.pin ?? params.gpioPin ?? params.pinNumber;
    const hasExplicitGpioRef = String(gpioRefRaw ?? '').trim() !== '';
    const gpioRef = resolveGpioReference(gpioRefRaw, policy);
    if (hasExplicitGpioRef && !gpioRef) return null;

    const gpio = toBoundedInt(
      gpioRef?.gpio,
      policy?.pico?.defaultGpio,
      policy?.pico?.allowedGpioMin,
      policy?.pico?.allowedGpioMax
    );
    const periodMs = toBoundedInt(
      params.periodMs ?? params.period_ms ?? params.duration ?? params.duration_ms ?? params.onMs ?? params.on_ms,
      periodDefault,
      policy?.pico?.minPeriodMs,
      policy?.pico?.maxPeriodMs
    );
    const offMs = toBoundedInt(
      params.offMs ?? params.off_ms ?? params.delay ?? params.delay_ms ?? params.pauseMs ?? params.pause_ms,
      null,
      policy?.pico?.minPeriodMs,
      policy?.pico?.maxPeriodMs
    );
    const iterations = toBoundedInt(
      params.iterations ?? params.count ?? params.cycles ?? params.times,
      policy?.pico?.defaultIterations,
      1,
      policy?.pico?.maxIterations
    );
    if (!Number.isInteger(gpio) || !Number.isInteger(periodMs) || !Number.isInteger(iterations)) return null;

    const colorFromPin = gpioRef?.color || inferColorFromGpioPin(gpio, policy);
    if (colorFromPin && (Number.isInteger(offMs) || (hasExplicitGpioRef && String(gpioRefRaw).toLowerCase().includes('gpio.')))) {
      const phase = { colors: [colorFromPin], periodMs };
      if (Number.isInteger(offMs) && offMs !== periodMs) {
        phase.offMs = offMs;
      }
      return {
        contractVersion: '1.0',
        target,
        action: 'blink_multi_phase',
        params: {
          phases: [phase],
          periodMs,
          cycles: iterations
        },
        source: { inferred: false, llmSelectedTool: true, llmAliasNormalized: true }
      };
    }

    return {
      contractVersion: '1.0',
      target,
      action,
      params: { gpio, periodMs, iterations },
      source: { inferred: false, llmSelectedTool: true }
    };
  }

  if (action === 'blink_color_sequence' || action === 'blink_color_group') {
    const paramsPeriodValue = params.periodMs ?? params.period_ms ?? params.duration_ms;
    const paramsCyclesValue = params.cycles ?? params.count ?? params.iterations;
    const pauseMs = toBoundedInt(params.pauseMs ?? params.pause_ms, null, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
    const colors = normalizeColorArray(params.colors, action === 'blink_color_group' ? 2 : 1);
    const legacyPhases = colors ? null : normalizeLegacyPlanPhases(params.phases, policy);
    if (!colors && legacyPhases && legacyPhases.length >= 2) {
      const cycles = toBoundedInt(paramsCyclesValue, toBoundedInt(params.duration, cyclesDefault, 1, policy?.pico?.maxIterations), 1, policy?.pico?.maxIterations);
      const periodMs = toBoundedInt(paramsPeriodValue, Number(legacyPhases[0]?.periodMs || periodDefault), policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
      if (!Number.isInteger(cycles) || !Number.isInteger(periodMs)) return null;
      if (Number.isInteger(pauseMs)) {
        legacyPhases.push({ pauseMs });
      }
      return {
        contractVersion: '1.0',
        target,
        action: 'blink_multi_phase',
        params: { phases: legacyPhases, periodMs, cycles },
        source: { inferred: false, llmSelectedTool: true, llmLegacyShape: true }
      };
    }
    const periodMs = toBoundedInt(paramsPeriodValue, periodDefault, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
    const cycles = toBoundedInt(paramsCyclesValue, cyclesDefault, 1, policy?.pico?.maxIterations);
    const durationPhases = buildDurationDrivenPhases(colors, params.duration_ms, policy);
    if ((durationPhases && durationPhases.length >= 2) || Number.isInteger(pauseMs)) {
      const phases = durationPhases || colors.map((c) => ({ colors: [c], periodMs }));
      if (Number.isInteger(pauseMs)) {
        phases.push({ pauseMs });
      }
      return {
        contractVersion: '1.0',
        target,
        action: 'blink_multi_phase',
        params: { phases, periodMs: Number(phases[0]?.periodMs || periodMs), cycles },
        source: { inferred: false, llmSelectedTool: true, llmLegacyShape: true }
      };
    }
    if (!colors || !Number.isInteger(periodMs) || !Number.isInteger(cycles)) return null;
    return {
      contractVersion: '1.0',
      target,
      action,
      params: { colors, periodMs, cycles },
      source: { inferred: false, llmSelectedTool: true }
    };
  }

  if (action === 'blink_pattern_sequence') {
    const colors = normalizeColorArray(params.colors, 1);
    const periodMs = toBoundedInt(params.periodMs, periodDefault, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
    const cycles = toBoundedInt(params.cycles, cyclesDefault, 1, policy?.pico?.maxIterations);
    const whiteBurstCount = toBoundedInt(params.whiteBurstCount, 2, 1, 20);
    const whiteBurstOnMs = toBoundedInt(params.whiteBurstOnMs, periodMs, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
    const whiteBurstOffMs = toBoundedInt(params.whiteBurstOffMs, whiteBurstOnMs, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
    if (!colors || !Number.isInteger(periodMs) || !Number.isInteger(cycles) || !Number.isInteger(whiteBurstCount)
      || !Number.isInteger(whiteBurstOnMs) || !Number.isInteger(whiteBurstOffMs)) {
      return null;
    }
    return {
      contractVersion: '1.0',
      target,
      action,
      params: { colors, periodMs, cycles, whiteBurstCount, whiteBurstOnMs, whiteBurstOffMs },
      source: { inferred: false, llmSelectedTool: true }
    };
  }

  if (action === 'blink_multi_phase') {
    const phasesRaw = Array.isArray(params.phases) ? params.phases : [];
    if (phasesRaw.length < 2) return null;
    const phases = [];
    for (const rawPhase of phasesRaw) {
      const pauseMs = toBoundedInt(rawPhase?.pauseMs, null, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
      if (Number.isInteger(pauseMs)) {
        phases.push({ pauseMs });
        continue;
      }
      const colors = normalizeColorArray(rawPhase?.colors, 1);
      const periodMs = toBoundedInt(rawPhase?.periodMs, null, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
      if (!colors || !Number.isInteger(periodMs)) return null;
      const offMs = toBoundedInt(rawPhase?.offMs, periodMs, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
      const phase = { colors, periodMs };
      if (Number.isInteger(offMs) && offMs !== periodMs) {
        phase.offMs = offMs;
      }
      phases.push(phase);
    }
    const cycles = toBoundedInt(params.cycles, cyclesDefault, 1, policy?.pico?.maxIterations);
    const periodMs = toBoundedInt(params.periodMs, Number(phases[0]?.periodMs || periodDefault), policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
    if (!Number.isInteger(cycles) || !Number.isInteger(periodMs)) return null;
    return {
      contractVersion: '1.0',
      target,
      action,
      params: { phases, periodMs, cycles },
      source: { inferred: false, llmSelectedTool: true }
    };
  }

  return null;
}

function normalizeLegacyPlanPhases(phasesValue, policy) {
  if (!Array.isArray(phasesValue) || phasesValue.length < 2) return null;
  const sorted = [...phasesValue]
    .map((p, idx) => ({
      raw: p || {},
      start: Number.isFinite(Number(p?.start)) ? Number(p.start) : null,
      idx
    }))
    .sort((a, b) => {
      if (a.start == null && b.start == null) return a.idx - b.idx;
      if (a.start == null) return 1;
      if (b.start == null) return -1;
      return a.start - b.start;
    });

  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const phase = sorted[i].raw || {};
    const colors = normalizeColorArray(
      Array.isArray(phase?.colors)
        ? phase.colors
        : extractColorsFromText(phase?.colorSequence || phase?.sequence || phase?.color || ''),
      1
    );
    if (!colors) return null;
    const explicitPeriod = toBoundedInt(
      phase?.periodMs ?? phase?.onMs ?? phase?.durationMs,
      null,
      policy?.pico?.minPeriodMs,
      policy?.pico?.maxPeriodMs
    );
    let periodMs = explicitPeriod;
    if (!Number.isInteger(periodMs)) {
      const currentStart = sorted[i].start;
      const nextStart = i + 1 < sorted.length ? sorted[i + 1].start : null;
      const inferred = (currentStart != null && nextStart != null) ? Math.round(nextStart - currentStart) : null;
      periodMs = toBoundedInt(inferred, policy?.pico?.defaultPeriodMs, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs);
    }
    if (!Number.isInteger(periodMs)) return null;
    out.push({ colors, periodMs });
  }
  return out.length >= 2 ? out : null;
}

function buildDurationDrivenPhases(colors, durationValue, policy) {
  if (!Array.isArray(colors) || colors.length === 0) return null;
  if (!Array.isArray(durationValue) || durationValue.length === 0) return null;
  const durations = durationValue
    .map((value) => toBoundedInt(value, null, policy?.pico?.minPeriodMs, policy?.pico?.maxPeriodMs))
    .filter((value) => Number.isInteger(value));
  if (durations.length === 0) return null;
  const phases = [];
  for (let i = 0; i < colors.length; i += 1) {
    const periodMs = durations[Math.min(i, durations.length - 1)];
    phases.push({
      colors: [colors[i]],
      periodMs
    });
  }
  return phases;
}

function extractColorsFromText(value) {
  const text = String(value || '');
  if (!text) return [];
  return Array.from(text.matchAll(/\b(red|blue|green|white)\b/ig)).map((m) => String(m[1] || '').toLowerCase());
}

function normalizeColorArray(colorsValue, minLength = 1) {
  if (!Array.isArray(colorsValue)) return null;
  const allowed = new Set(['red', 'blue', 'green', 'white']);
  const colors = colorsValue
    .map((c) => String(c || '').trim().toLowerCase())
    .filter((c) => allowed.has(c));
  if (colors.length < minLength) return null;
  return colors;
}

function inferColorFromGpioPin(pin, policy) {
  const value = Number(pin);
  if (!Number.isFinite(value)) return '';
  const colorPins = policy?.pico?.colorPins || {};
  if (Number(colorPins.red) === value) return 'red';
  if (Number(colorPins.blue) === value) return 'blue';
  if (Number(colorPins.green) === value) return 'green';
  return '';
}

function resolveGpioReference(value, policy) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return {
    gpio: policy?.pico?.defaultGpio,
    color: inferColorFromGpioPin(policy?.pico?.defaultGpio, policy)
  };

  const colorTokenMap = {
    'gpio.red': 'red',
    'pin.red': 'red',
    red: 'red',
    'gpio.blue': 'blue',
    'pin.blue': 'blue',
    blue: 'blue',
    'gpio.green': 'green',
    'pin.green': 'green',
    green: 'green'
  };

  const mappedColor = colorTokenMap[raw];
  if (mappedColor) {
    const mappedPin = Number(policy?.pico?.colorPins?.[mappedColor]);
    if (!Number.isInteger(mappedPin)) return null;
    return { gpio: mappedPin, color: mappedColor };
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    const gpio = Math.round(parsed);
    const min = Number(policy?.pico?.allowedGpioMin);
    const max = Number(policy?.pico?.allowedGpioMax);
    if (Number.isFinite(min) && gpio < min) return null;
    if (Number.isFinite(max) && gpio > max) return null;
    return { gpio, color: inferColorFromGpioPin(gpio, policy) };
  }

  return null;
}

function toBoundedInt(value, fallback, min, max) {
  const raw = value == null ? '' : String(value).trim();
  const parsed = raw === '' ? NaN : Number(raw);
  const chosen = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  if (!Number.isFinite(Number(chosen))) return null;
  const num = Number(chosen);
  if (Number.isFinite(Number(min)) && num < Number(min)) return null;
  if (Number.isFinite(Number(max)) && num > Number(max)) return null;
  return Math.round(num);
}

function extractLikelyVerificationToken(code) {
  const text = String(code || '');
  if (!text) return '';
  const match = text.match(/Serial\.(?:println|print)\(\s*"([^"]{3,120})"\s*\)/i);
  return match ? String(match[1] || '').trim() : '';
}

module.exports = {
  applyPlanOverrides,
  parseLlmPlanContract
};
