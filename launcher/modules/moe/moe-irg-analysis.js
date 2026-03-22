/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

function inferRequestedSignals(message = '') {
  const text = String(message || '');
  const cycleMatch = text.match(/\b(?:for\s+)?(\d+)\s*(?:cycles?|times?)\b/i)
    || text.match(/\bcycle\s*(\d+)\b/i);
  const requestedCycleCount = cycleMatch ? Number(cycleMatch[1]) : null;
  const mentionedColors = Array.from(text.matchAll(/\b(red|blue|green|white)\b/ig))
    .map((m) => String(m[1] || '').toLowerCase());
  const requestedColors = Array.from(new Set(mentionedColors));
  const asksPause = /\b(pause|wait)\b/i.test(text);
  const asksOff = /\boff\b/i.test(text);
  const asksSimultaneous = /\b(red|blue|green|white)\b[\s,]*(?:and|,)[\s,]*\b(red|blue|green|white)\b/i.test(text)
    || /\b(together|simultaneous|simultaneously|all colors?)\b/i.test(text);
  const asksRepeat = /\b(twice|thrice|repeat|2x|3x|double)\b/i.test(text);
  return {
    requestedCycleCount,
    requestedColors,
    asksPause,
    asksOff,
    asksSimultaneous,
    asksRepeat
  };
}

function hasRepeatedStructure(contract = {}) {
  const action = String(contract?.action || '');
  if (action === 'blink_pattern_sequence') return Number(contract?.params?.whiteBurstCount) > 1;
  if (action === 'blink_color_sequence') {
    const colors = Array.isArray(contract?.params?.colors) ? contract.params.colors : [];
    for (let i = 1; i < colors.length; i += 1) {
      if (String(colors[i]) === String(colors[i - 1])) return true;
    }
    return false;
  }
  if (action === 'blink_multi_phase') {
    const phases = Array.isArray(contract?.params?.phases) ? contract.params.phases : [];
    for (let i = 1; i < phases.length; i += 1) {
      if (JSON.stringify(phases[i]) === JSON.stringify(phases[i - 1])) return true;
    }
    return false;
  }
  return false;
}

function analyzeDeterministicMatch({ message = '', contract = null } = {}) {
  if (String(contract?.target || '').toLowerCase() === 'esp32') {
    return {
      confidence: 1,
      gaps: [],
      requested: {},
      resolved: {
        action: String(contract?.action || ''),
        cycles: null
      }
    };
  }
  const signals = inferRequestedSignals(message);
  const gaps = [];
  const action = String(contract?.action || '');
  const hasPause = action === 'blink_multi_phase'
    && (Array.isArray(contract?.params?.phases) ? contract.params.phases : []).some((p) => Number.isFinite(Number(p?.pauseMs)));
  const hasSimultaneous = action === 'blink_color_group'
    || action === 'blink_pattern_sequence'
    || (action === 'blink_multi_phase'
      && (Array.isArray(contract?.params?.phases) ? contract.params.phases : []).some((p) => Array.isArray(p?.colors) && p.colors.length > 1));
  const hasOffTiming = action === 'blink_multi_phase'
    ? (Array.isArray(contract?.params?.phases) ? contract.params.phases : []).some((p) => Number.isFinite(Number(p?.offMs)))
    : (action === 'blink_color_sequence' || action === 'blink_color_group' || action === 'blink_pattern_sequence');
  const hasRepeat = hasRepeatedStructure(contract);

  let resolvedCycles = null;
  if (action === 'blink_gpio') {
    resolvedCycles = Number(contract?.params?.iterations);
  } else if (
    action === 'blink_color_sequence' ||
    action === 'blink_color_group' ||
    action === 'blink_pattern_sequence' ||
    action === 'blink_multi_phase'
  ) {
    resolvedCycles = Number(contract?.params?.cycles);
  }

  if (signals.asksPause && !hasPause) gaps.push('pause_missing');
  if (signals.requestedColors.length >= 1 && action === 'blink_gpio') gaps.push('color_intent_lost');
  if (signals.asksSimultaneous && !hasSimultaneous) gaps.push('simultaneous_group_missing');
  if (signals.asksOff && !hasOffTiming) gaps.push('off_timing_missing');
  if (signals.asksRepeat && !hasRepeat) gaps.push('repeat_structure_missing');
  if (Number.isInteger(signals.requestedCycleCount) && Number.isFinite(resolvedCycles) && Number(resolvedCycles) !== Number(signals.requestedCycleCount)) {
    gaps.push('cycle_count_mismatch');
  }

  const confidence = Math.max(0, 1 - (gaps.length * 0.25));
  return {
    confidence,
    gaps,
    requested: signals,
    resolved: {
      action,
      cycles: Number.isFinite(resolvedCycles) ? resolvedCycles : null
    }
  };
}

function normalizeIrgFallbackMode(rawMode) {
  const mode = String(rawMode || '').trim().toLowerCase();
  if (mode === 'off') return 'off';
  if (mode === 'on-gaps') return 'on-gaps';
  if (mode === 'on-gaps-or-low-confidence') return 'on-gaps-or-low-confidence';
  return 'on-gaps-or-low-confidence';
}

function formatContractBlock(contract) {
  return `\nContract:\n~~~json\n${JSON.stringify(contract || {}, null, 2)}\n~~~`;
}

function summarizeLiveExecutionOutput(execution = {}) {
  const lines = [];
  const compile = String(execution?.output?.compile || '').trim();
  const upload = String(execution?.output?.upload || '').trim();
  const httpOut = String(execution?.output?.http || '').trim();
  const resolvedPort = String(execution?.serial?.resolvedPort || '').trim();
  const fqbn = String(execution?.metadata?.fqbn || '').trim();
  const endpoint = String(execution?.metadata?.endpoint || '').trim();
  const httpStatus = Number(execution?.metadata?.httpStatus);

  const clip = (text, maxChars = 1800) => {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    const head = text.slice(0, Math.floor(maxChars * 0.66));
    const tail = text.slice(-Math.floor(maxChars * 0.34));
    return `${head}\n...[truncated middle]...\n${tail}`;
  };

  if (resolvedPort) lines.push(`Serial: ${resolvedPort}`);
  if (fqbn) lines.push(`FQBN: ${fqbn}`);
  if (endpoint) lines.push(`Endpoint: ${endpoint}`);
  if (Number.isInteger(httpStatus)) lines.push(`HTTP Status: ${httpStatus}`);
  if (compile) lines.push(`Compile Output:\n${clip(compile)}`);
  if (upload) lines.push(`Upload Output:\n${clip(upload)}`);
  if (httpOut) lines.push(`HTTP Output:\n${clip(httpOut)}`);
  return lines.join('\n');
}

function cloneContract(contract) {
  return JSON.parse(JSON.stringify(contract || {}));
}

function toMultiPhaseContract(contract, policy) {
  const next = cloneContract(contract);
  const action = String(next?.action || '');
  const params = next?.params || {};
  const defaultPeriod = Number(policy?.pico?.defaultPeriodMs) || 500;
  const cycles = Number.isInteger(Number(params?.cycles))
    ? Number(params.cycles)
    : (Number.isInteger(Number(params?.iterations)) ? Number(params.iterations) : (Number(policy?.pico?.defaultSequenceCycles) || 5));
  const phases = [];
  if (action === 'blink_multi_phase') return next;
  if (action === 'blink_color_sequence' || action === 'blink_pattern_sequence') {
    const colors = Array.isArray(params.colors) ? params.colors : [];
    const periodMs = Number(params.periodMs) || defaultPeriod;
    for (const color of colors) phases.push({ colors: [String(color).toLowerCase()], periodMs });
  } else if (action === 'blink_color_group') {
    const colors = Array.isArray(params.colors) ? params.colors.map((c) => String(c).toLowerCase()) : [];
    const periodMs = Number(params.periodMs) || defaultPeriod;
    if (colors.length > 0) phases.push({ colors, periodMs });
  } else if (action === 'blink_gpio') {
    phases.push({ colors: ['green'], periodMs: Number(params.periodMs) || defaultPeriod });
  }
  next.action = 'blink_multi_phase';
  next.params = {
    phases: phases.length > 0 ? phases : [{ colors: ['green'], periodMs: defaultPeriod }, { colors: ['red'], periodMs: defaultPeriod }],
    periodMs: Number(phases[0]?.periodMs || defaultPeriod),
    cycles
  };
  return next;
}

function repairContractFromIntent({ contract, analysis, policy }) {
  if (!contract || !analysis?.requested) return { contract, repairs: [] };
  let next = cloneContract(contract);
  const repairs = [];
  const requested = analysis.requested;
  const action = String(next?.action || '');
  const sourceText = String(analysis?.sourceText || '').toLowerCase();

  if (Number.isInteger(requested.requestedCycleCount) && requested.requestedCycleCount > 0) {
    if (action === 'blink_gpio') {
      if (Number(next?.params?.iterations) !== requested.requestedCycleCount) {
        next.params.iterations = requested.requestedCycleCount;
        repairs.push('cycle_count_aligned');
      }
    } else if (next?.params) {
      if (Number(next.params.cycles) !== requested.requestedCycleCount) {
        next.params.cycles = requested.requestedCycleCount;
        repairs.push('cycle_count_aligned');
      }
    }
  }

  const contractHasPause = (c) => String(c?.action || '') === 'blink_multi_phase'
    && (Array.isArray(c?.params?.phases) ? c.params.phases : []).some((p) => Number.isFinite(Number(p?.pauseMs)));
  const contractHasSimultaneous = (c) => {
    const actionName = String(c?.action || '');
    if (actionName === 'blink_color_group' || actionName === 'blink_pattern_sequence') return true;
    if (actionName !== 'blink_multi_phase') return false;
    return (Array.isArray(c?.params?.phases) ? c.params.phases : [])
      .some((p) => Array.isArray(p?.colors) && p.colors.length > 1);
  };

  if (requested.asksPause && !contractHasPause(next)) {
    next = toMultiPhaseContract(next, policy);
    const basePause = Number(next?.params?.periodMs) || Number(policy?.pico?.defaultPeriodMs) || 500;
    const pauseMs = Math.max(Number(policy?.pico?.minPeriodMs) || 50, Math.min(Number(policy?.pico?.maxPeriodMs) || 10000, basePause));
    next.params.phases.push({ pauseMs });
    repairs.push('pause_added');
  }

  if (requested.asksSimultaneous && !contractHasSimultaneous(next)) {
    next = toMultiPhaseContract(next, policy);
    const phases = Array.isArray(next?.params?.phases) ? next.params.phases : [];
    let first = -1;
    let second = -1;
    for (let i = 0; i < phases.length; i += 1) {
      const colors = Array.isArray(phases[i]?.colors) ? phases[i].colors : [];
      if (colors.length !== 1) continue;
      if (first < 0) first = i;
      else {
        second = i;
        break;
      }
    }
    if (first >= 0 && second >= 0) {
      const c1 = String(phases[first].colors[0]).toLowerCase();
      const c2 = String(phases[second].colors[0]).toLowerCase();
      const merged = c1 === c2 ? [c1] : [c1, c2];
      phases[first] = {
        colors: merged,
        periodMs: Number(phases[first]?.periodMs) || Number(next?.params?.periodMs) || Number(policy?.pico?.defaultPeriodMs) || 500
      };
      phases.splice(second, 1);
      repairs.push('simultaneous_group_added');
    }
  }

  const asksAggressiveSpeedRamp = /\b(scale\s*up|ramp\s*up|speed\s*up|accelerat(?:e|ing)|really\s+scale|drums?|raining\s+blood)\b/.test(sourceText);
  const asksPerCycleRamp = /\b(per\s+cycle|each\s+cycle|every\s+cycle)\b/.test(sourceText)
    || /\bfaster\s+than\s+the\s+previous\b/.test(sourceText)
    || /\bslightly\s+faster\b/.test(sourceText);
  const asksCalm = /\bcalm\b/.test(sourceText);
  const asksUrgent = /\burgent\b/.test(sourceText) || asksAggressiveSpeedRamp || /\b(speed\s*up|faster|accelerat(?:e|ing))\b/.test(sourceText);
  const asksSettle = /\bsettle(?:\s+down)?\b/.test(sourceText);
  const asksMoodArc = asksCalm && asksUrgent;

  if (asksMoodArc) {
    const phasesNow = Array.isArray(next?.params?.phases) ? next.params.phases : [];
    const hasPauseNow = contractHasPause(next);
    const hasSimultaneousNow = contractHasSimultaneous(next);
    const periodValues = phasesNow.filter((phase) => Number.isFinite(Number(phase?.periodMs))).map((phase) => Number(phase.periodMs));
    const hasTimingVariation = new Set(periodValues).size >= 2;
    const hasStructuredArcAlready = String(next?.action || '') === 'blink_multi_phase'
      && phasesNow.length >= 3
      && hasPauseNow
      && hasSimultaneousNow
      && hasTimingVariation;
    if (hasStructuredArcAlready) return { contract: next, repairs };

    next = toMultiPhaseContract(next, policy);
    const minMs = Number(policy?.pico?.minPeriodMs) || 50;
    const maxMs = Number(policy?.pico?.maxPeriodMs) || 10000;
    const clampMs = (value) => Math.max(minMs, Math.min(maxMs, Math.round(value)));
    const calmMs = clampMs(950);
    const calmOffMs = clampMs(280);
    const urgentOnMs = clampMs(asksAggressiveSpeedRamp ? 85 : 120);
    const urgentOffMs = clampMs(asksAggressiveSpeedRamp ? 55 : 80);
    const urgentSingleOnMs = clampMs(asksAggressiveSpeedRamp ? 65 : 90);
    const urgentSingleOffMs = clampMs(asksAggressiveSpeedRamp ? 45 : 70);
    const settleMs = clampMs(760);
    const settleOffMs = clampMs(260);
    const settleBlendMs = clampMs(640);
    const settleBlendOffMs = clampMs(300);
    const shortPauseMs = clampMs(500);

    const moodPhases = asksAggressiveSpeedRamp
      ? [
        { colors: ['green'], periodMs: clampMs(900), offMs: clampMs(260) },
        { colors: ['blue'], periodMs: clampMs(780), offMs: clampMs(220) },
        { colors: ['red'], periodMs: clampMs(180), offMs: clampMs(120) },
        { colors: ['blue'], periodMs: clampMs(145), offMs: clampMs(100) },
        { colors: ['red', 'blue'], periodMs: clampMs(110), offMs: clampMs(75) },
        { colors: ['red'], periodMs: clampMs(85), offMs: clampMs(58) },
        { colors: ['blue'], periodMs: clampMs(70), offMs: clampMs(50) },
        { colors: ['red', 'blue'], periodMs: clampMs(60), offMs: clampMs(45) },
        ...(asksSettle
          ? [
            { colors: ['blue'], periodMs: clampMs(700), offMs: clampMs(240) },
            { colors: ['green', 'blue'], periodMs: clampMs(620), offMs: clampMs(280) }
          ]
          : [])
      ]
      : [
        { colors: ['green'], periodMs: calmMs, offMs: calmOffMs },
        { colors: ['blue'], periodMs: clampMs(820), offMs: clampMs(260) },
        { colors: ['red', 'blue'], periodMs: urgentOnMs, offMs: urgentOffMs },
        { colors: ['red'], periodMs: urgentSingleOnMs, offMs: urgentSingleOffMs },
        { colors: ['blue'], periodMs: urgentSingleOnMs, offMs: urgentSingleOffMs },
        { colors: ['red', 'blue'], periodMs: urgentOnMs, offMs: urgentOffMs },
        ...(asksSettle
          ? [
            { colors: ['blue'], periodMs: settleMs, offMs: settleOffMs },
            { colors: ['green', 'blue'], periodMs: settleBlendMs, offMs: settleBlendOffMs }
          ]
          : [])
      ];

    const hadPause = (Array.isArray(next?.params?.phases) ? next.params.phases : []).some((p) => Number.isFinite(Number(p?.pauseMs)));
    if (requested.asksPause || hadPause) moodPhases.push({ pauseMs: shortPauseMs });

    next.params.phases = moodPhases;
    next.params.periodMs = calmMs;
    if (!next.params.moodVariation || typeof next.params.moodVariation !== 'object') {
      next.params.moodVariation = {
        enabled: true,
        onJitterPct: 0.22,
        offJitterPct: 0.20,
        pauseJitterPct: 0.15,
        cycleRampPct: asksAggressiveSpeedRamp ? 0.18 : (asksPerCycleRamp ? 0.14 : 0.10),
        minRampFactor: asksAggressiveSpeedRamp ? 0.38 : (asksPerCycleRamp ? 0.50 : 0.60)
      };
      repairs.push('mood_cycle_variation_enabled');
    }
    repairs.push('mood_arc_applied');
  }
  return { contract: next, repairs };
}

module.exports = {
  inferRequestedSignals,
  hasRepeatedStructure,
  analyzeDeterministicMatch,
  normalizeIrgFallbackMode,
  formatContractBlock,
  summarizeLiveExecutionOutput,
  cloneContract,
  toMultiPhaseContract,
  repairContractFromIntent
};
