/**
 * MoE IRG color/phase inference helpers.
 */

const { findCycleCount } = require('./moe-irg-policy');

function inferColorSequenceContract(message, policy) {
  const text = String(message || '').trim();
  const picoMention = /(raspberry\s*pi\s*pico|\bpico\b)/i.test(text);
  const hardwareMention = /(gpio|pin|machine\.pin|from\s+machine\s+import\s+pin|microcontroller|serial)/i.test(text);
  const blinkMention = /(blink|flash|cycle|sequence|toggle)/i.test(text);
  if (!(picoMention || hardwareMention) || !blinkMention) return null;

  const periodMsMatch = text.match(/\b(\d{1,5})\s*(ms|millisecond|milliseconds)\b/i);
  const periodSMatc = text.match(/\b(\d{1,3})(?:\.(\d{1,3}))?\s*(s|sec|second|seconds)\b/i);
  const cyclesValue = findCycleCount(text);

  let periodMs = policy.pico.defaultPeriodMs;
  if (periodMsMatch) {
    periodMs = Number(periodMsMatch[1]);
  } else if (periodSMatc) {
    const whole = Number(periodSMatc[1]);
    const fraction = periodSMatc[2] ? Number(`0.${periodSMatc[2]}`) : 0;
    periodMs = Math.round((whole + fraction) * 1000);
  }

  const cycles = cyclesValue != null ? Number(cyclesValue) : policy.pico.defaultSequenceCycles;
  const whiteStrobeSpec = parseWhiteStrobeSpec(text, policy);
  const multiPhase = inferMultiPhaseColorContract(text, policy, cycles, whiteStrobeSpec);
  if (multiPhase) {
    return multiPhase;
  }
  const groupColors = extractSimultaneousColorGroup(text);
  if (groupColors.length > 0 && !whiteStrobeSpec) {
    return {
      contractVersion: '1.0',
      target: 'raspberry-pi-pico',
      action: 'blink_color_group',
      params: { colors: groupColors, periodMs, cycles },
      source: {
        inferred: true,
        hasExplicitPeriod: !!periodMsMatch || !!periodSMatc,
        hasExplicitCycles: cyclesValue != null
      }
    };
  }

  const colors = extractColorSequenceWithRepeats(text);
  if (colors.length === 0) return null;

  const whiteMentioned = /\bwhite\b/i.test(text);
  const strobeMentioned = /\b(strobe|burst)\b/i.test(text);
  const quickMentioned = /\b(quick|quickly)\b/i.test(text);
  const burstCountMatch = text.match(/\b(2|two|twice|3|three|4|four)\s+(quick\s+)?(white\s+)?(bursts?|strobes?)\b/i);
  const explicitBurstCount = burstCountMatch
    ? ({ two: 2, twice: 2, three: 3, four: 4 }[String(burstCountMatch[1]).toLowerCase()] || Number(burstCountMatch[1]) || 2)
    : null;
  const msValues = Array.from(text.matchAll(/\b(\d{1,5})\s*(ms|millisecond|milliseconds)\b/ig)).map((m) => Number(m[1]));
  const defaultQuickMs = Math.max(policy.pico.minPeriodMs, 100);
  const whiteOnMs = whiteStrobeSpec
    ? whiteStrobeSpec.onMs
    : (msValues.length >= 2
      ? Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, msValues[0]))
      : (quickMentioned ? defaultQuickMs : periodMs));
  const whiteOffMs = whiteStrobeSpec
    ? whiteStrobeSpec.offMs
    : (msValues.length >= 2
      ? Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, msValues[1]))
      : whiteOnMs);
  const wantsWhiteBurstPattern = !!whiteStrobeSpec
    || (whiteMentioned && (strobeMentioned || burstCountMatch || /\bwhite\s+twice\b/i.test(text)));
  if (wantsWhiteBurstPattern) {
    const baseColors = colors.filter((c) => c !== 'white');
    return {
      contractVersion: '1.0',
      target: 'raspberry-pi-pico',
      action: 'blink_pattern_sequence',
      params: {
        colors: baseColors.length > 0 ? baseColors : ['red', 'blue', 'green'],
        periodMs,
        cycles,
        whiteBurstCount: whiteStrobeSpec?.count || explicitBurstCount || 2,
        whiteBurstOnMs: whiteOnMs,
        whiteBurstOffMs: whiteOffMs
      },
      source: {
        inferred: true,
        hasExplicitPeriod: !!periodMsMatch || !!periodSMatc,
        hasExplicitCycles: cyclesValue != null,
        hasExplicitWhiteBurstTiming: whiteStrobeSpec?.hasExplicitTiming || msValues.length >= 2,
        hasExplicitWhiteBurstCount: whiteStrobeSpec?.hasExplicitCount || explicitBurstCount != null
      }
    };
  }

  return {
    contractVersion: '1.0',
    target: 'raspberry-pi-pico',
    action: 'blink_color_sequence',
    params: { colors, periodMs, cycles },
    source: {
      inferred: true,
      hasExplicitPeriod: !!periodMsMatch || !!periodSMatc,
      hasExplicitCycles: cyclesValue != null
    }
  };
}

function inferMultiPhaseColorContract(text, policy, cycles, whiteStrobeSpec) {
  const raw = String(text || '').trim();
  if (!raw || whiteStrobeSpec) return null;
  if (/\b(strobe|burst)\b/i.test(raw)) return null;
  const hasThen = /\bthen\b/i.test(raw);
  const hasCommaOrSemicolon = /[,;]/.test(raw);
  const hasPhaseLanguage = /\b(turn\s+on|off|pause|wait)\b/i.test(raw);
  if (!hasThen && !(hasCommaOrSemicolon && hasPhaseLanguage)) return null;

  const parts = (hasThen
    ? raw.split(/\bthen\b/i)
    : raw.split(/,|;/i))
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const phases = [];
  let sawDifferentPeriod = false;
  let lastPeriod = null;

  for (const part of parts) {
    const explicitPhaseEntries = extractExplicitPhaseEntries(part, policy);
    if (explicitPhaseEntries.length > 0) {
      const repeatCount = explicitPhaseEntries.length === 1 ? Math.max(1, inferRepeatCount(part)) : 1;
      for (let r = 0; r < repeatCount; r += 1) {
        for (const entry of explicitPhaseEntries) {
          const phase = {
            colors: [...entry.colors],
            periodMs: entry.periodMs
          };
          if (Number.isFinite(Number(entry.offMs))) {
            phase.offMs = Number(entry.offMs);
          }
          phases.push(phase);
        }
      }
      if (explicitPhaseEntries.length > 1) {
        const firstPeriod = explicitPhaseEntries[0]?.periodMs;
        if (lastPeriod != null && firstPeriod != null && lastPeriod !== firstPeriod) sawDifferentPeriod = true;
        if (firstPeriod != null) lastPeriod = firstPeriod;
        for (let i = 1; i < explicitPhaseEntries.length; i += 1) {
          const p = explicitPhaseEntries[i]?.periodMs;
          if (p != null && lastPeriod != null && p !== lastPeriod) sawDifferentPeriod = true;
          if (p != null) lastPeriod = p;
        }
      } else {
        const p = explicitPhaseEntries[0]?.periodMs;
        if (p != null && lastPeriod != null && p !== lastPeriod) sawDifferentPeriod = true;
        if (p != null) lastPeriod = p;
      }
      continue;
    }

    const colors = Array.from(part.matchAll(/\b(red|blue|white|green)\b/ig))
      .map((m) => String(m[1] || '').toLowerCase())
      .filter(Boolean);
    if (colors.length === 0) {
      if (/\boff\b/i.test(part) && phases.length > 0) {
        let target = null;
        for (let i = phases.length - 1; i >= 0; i -= 1) {
          const candidate = phases[i];
          if (Array.isArray(candidate?.colors) && candidate.colors.length > 0 && Number.isFinite(Number(candidate?.periodMs))) {
            target = candidate;
            break;
          }
        }
        const repeatCount = Math.max(1, inferRepeatCount(part));
        const offMs = extractOffMs(part, policy);
        if (target && Number.isFinite(offMs)) {
          target.offMs = offMs;
        }
        if (target) {
          for (let i = 1; i < repeatCount; i += 1) {
            const phase = {
              colors: [...target.colors],
              periodMs: Number(target.periodMs)
            };
            if (Number.isFinite(Number(target.offMs))) {
              phase.offMs = Number(target.offMs);
            }
            phases.push(phase);
          }
        }
      }
      const repeatCount = Math.max(1, inferRepeatCount(part));
      const isLoopControl = /\b(cycle|cycles|loop|loops)\b/i.test(part);
      const isRepeatOnlyModifier = repeatCount > 1
        && !isLoopControl
        && !/\boff\b/i.test(part)
        && !/\b(pause|wait)\b/i.test(part);
      if (isRepeatOnlyModifier && phases.length > 0) {
        let target = null;
        for (let i = phases.length - 1; i >= 0; i -= 1) {
          const candidate = phases[i];
          if (Array.isArray(candidate?.colors) && candidate.colors.length > 0 && Number.isFinite(Number(candidate?.periodMs))) {
            target = candidate;
            break;
          }
        }
        if (target) {
          for (let i = 1; i < repeatCount; i += 1) {
            const phase = {
              colors: [...target.colors],
              periodMs: Number(target.periodMs)
            };
            if (Number.isFinite(Number(target.offMs))) {
              phase.offMs = Number(target.offMs);
            }
            phases.push(phase);
          }
        }
      }
      const pauseMs = extractPauseMs(part, policy);
      if (pauseMs != null) {
        phases.push({ pauseMs });
      }
      continue;
    }

    const msMatch = part.match(/\b(\d{1,5})\s*(ms|millisecond|milliseconds)\b/i);
    const secMatch = msMatch ? null : part.match(/\b(\d{1,3})(?:\.(\d{1,3}))?\s*(s|sec|second|seconds)\b/i);
    let periodMs = policy.pico.defaultPeriodMs;
    if (msMatch) {
      periodMs = Number(msMatch[1]);
    } else if (secMatch) {
      const whole = Number(secMatch[1]);
      const fraction = secMatch[2] ? Number(`0.${secMatch[2]}`) : 0;
      periodMs = Math.round((whole + fraction) * 1000);
    }
    if (lastPeriod != null && lastPeriod !== periodMs) {
      sawDifferentPeriod = true;
    }
    lastPeriod = periodMs;

    const unique = [];
    const seen = new Set();
    for (const c of colors) {
      if (seen.has(c)) continue;
      seen.add(c);
      unique.push(c);
    }

    const repeatCount = Math.max(1, inferRepeatCount(part));
    const offMs = extractOffMs(part, policy);
    for (let i = 0; i < repeatCount; i += 1) {
      const phase = {
        colors: unique,
        periodMs
      };
      if (Number.isFinite(offMs)) {
        phase.offMs = offMs;
      }
      phases.push(phase);
    }
  }

  if (phases.length < 2) return null;
  const hasGroupedPhase = phases.some((phase) => Array.isArray(phase.colors) && phase.colors.length > 1);
  const hasPausePhase = phases.some((phase) => Number.isFinite(Number(phase?.pauseMs)));
  if (!hasGroupedPhase && !sawDifferentPeriod && !hasPausePhase) return null;

  return {
    contractVersion: '1.0',
    target: 'raspberry-pi-pico',
    action: 'blink_multi_phase',
    params: {
      phases,
      periodMs: Number(phases[0]?.periodMs || policy.pico.defaultPeriodMs),
      cycles
    },
    source: {
      inferred: true,
      hasExplicitCycles: true,
      hasPhaseTiming: true
    }
  };
}

function extractExplicitPhaseEntries(part, policy) {
  const out = [];
  const raw = String(part || '');
  if (!raw) return out;

  const re = /(?:^|,|\band\b)\s*(?:then\s+)?(?:turn\s+on\s+)?(?:the\s+)?(.+?)\s+for\s+(\d{1,5})(?:\s*(ms|millisecond|milliseconds))?\b/ig;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const colorsRaw = String(m[1] || '').toLowerCase();
    const msRaw = Number(m[2]);
    const unit = String(m[3] || 'ms').toLowerCase();
    if (!Number.isFinite(msRaw)) continue;
    const periodMs = unit.startsWith('ms')
      ? msRaw
      : Math.round(msRaw * 1000);
    const colors = Array.from(colorsRaw.matchAll(/\b(red|blue|white|green)\b/ig))
      .map((x) => String(x[1] || '').toLowerCase())
      .filter(Boolean);
    if (colors.length === 0) continue;
    const unique = [];
    const seen = new Set();
    for (const c of colors) {
      if (seen.has(c)) continue;
      seen.add(c);
      unique.push(c);
    }
    const phase = {
      colors: unique,
      periodMs: Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, periodMs))
    };
    const offMs = extractOffMs(raw, policy);
    if (Number.isFinite(offMs)) {
      phase.offMs = offMs;
    }
    out.push(phase);
  }
  return out;
}

function extractOffMs(part, policy) {
  const raw = String(part || '');
  if (!/\boff\b/i.test(raw)) return null;
  const msMatch = raw.match(/\boff\b(?:\s+for)?\s+(\d{1,5})\s*(ms|millisecond|milliseconds)\b/i);
  if (msMatch) {
    const ms = Number(msMatch[1]);
    if (Number.isFinite(ms)) {
      return Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, ms));
    }
  }
  const secMatch = raw.match(/\boff\b(?:\s+for)?\s+(\d{1,3})(?:\.(\d{1,3}))?\s*(s|sec|second|seconds)\b/i);
  if (secMatch) {
    const whole = Number(secMatch[1]);
    const fraction = secMatch[2] ? Number(`0.${secMatch[2]}`) : 0;
    const ms = Math.round((whole + fraction) * 1000);
    if (Number.isFinite(ms)) {
      return Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, ms));
    }
  }
  return null;
}

function extractPauseMs(part, policy) {
  const raw = String(part || '');
  if (!/\b(pause|wait)\b/i.test(raw)) return null;
  const msNearPause = raw.match(/\b(?:pause|wait)\b(?:\s+for)?\s+(\d{1,5})\s*(ms|millisecond|milliseconds)\b/i);
  if (msNearPause) {
    const ms = Number(msNearPause[1]);
    if (Number.isFinite(ms)) {
      return Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, ms));
    }
  }
  const secNearPause = raw.match(/\b(?:pause|wait)\b(?:\s+for)?\s+(\d{1,3})(?:\.(\d{1,3}))?\s*(s|sec|second|seconds)\b/i);
  if (secNearPause) {
    const whole = Number(secNearPause[1]);
    const fraction = secNearPause[2] ? Number(`0.${secNearPause[2]}`) : 0;
    const ms = Math.round((whole + fraction) * 1000);
    if (Number.isFinite(ms)) {
      return Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, ms));
    }
  }
  const msMatch = raw.match(/\b(\d{1,5})\s*(ms|millisecond|milliseconds)\b/i);
  if (msMatch) {
    const ms = Number(msMatch[1]);
    if (Number.isFinite(ms)) {
      return Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, ms));
    }
  }
  const secMatch = raw.match(/\b(\d{1,3})(?:\.(\d{1,3}))?\s*(s|sec|second|seconds)\b/i);
  if (secMatch) {
    const whole = Number(secMatch[1]);
    const fraction = secMatch[2] ? Number(`0.${secMatch[2]}`) : 0;
    const ms = Math.round((whole + fraction) * 1000);
    if (Number.isFinite(ms)) {
      return Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, ms));
    }
  }
  return null;
}

function extractSimultaneousColorGroup(text) {
  const raw = String(text || '').toLowerCase();
  if (!raw) return [];

  if (
    /->/.test(raw) ||
    /\bfollowed\s+by\b/.test(raw) ||
    /\band\s+then\s+(?!off\b)/.test(raw) ||
    /\bthen\s+(red|blue|green|white)\b/.test(raw) ||
    /\b(red|blue|green|white)\s+then\s+(red|blue|green|white)\b/.test(raw)
  ) {
    return [];
  }

  let clause = raw;
  clause = clause.split(/\bfor\s+\d{1,5}\s*(?:ms|millisecond|milliseconds|s|sec|second|seconds)\b/i)[0] || clause;
  clause = clause.split(/\bthen\s+off\b/i)[0] || clause;
  clause = clause.split(/[.!?]/)[0] || clause;

  if (!/\b(turn|set|switch|keep)\s+(on)\b/.test(clause) && !/\bon\b/.test(clause)) {
    return [];
  }

  const colors = Array.from(clause.matchAll(/\b(red|blue|white|green)\b/ig))
    .map((m) => String(m[1] || '').toLowerCase());
  if (colors.length < 2) return [];

  if (!(/[,+]/.test(clause) || /\band\b/.test(clause) || /\btogether\b/.test(clause) || /\bsimultaneous/.test(clause) || /\ball\s+colors?\b/.test(clause))) {
    return [];
  }

  const seen = new Set();
  const unique = [];
  for (const color of colors) {
    if (seen.has(color)) continue;
    seen.add(color);
    unique.push(color);
  }
  return unique;
}

function parseWhiteStrobeSpec(text, policy) {
  const raw = String(text || '');
  if (!raw) return null;
  const clauses = raw.split(/[.!?]/).map((s) => s.trim()).filter(Boolean);
  const defaultQuickMs = Math.max(policy.pico.minPeriodMs, 100);
  for (const clause of clauses) {
    if (!/\bwhite\b/i.test(clause) || !/\b(strobe|burst)\b/i.test(clause)) continue;
    const msValues = Array.from(clause.matchAll(/\b(\d{1,5})\s*(ms|millisecond|milliseconds)\b/ig)).map((m) => Number(m[1]));
    const onMsRaw = msValues.length >= 1 ? msValues[0] : defaultQuickMs;
    const offMsRaw = msValues.length >= 2 ? msValues[1] : onMsRaw;
    const count = inferRepeatCount(clause);
    return {
      count,
      onMs: Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, onMsRaw)),
      offMs: Math.max(policy.pico.minPeriodMs, Math.min(policy.pico.maxPeriodMs, offMsRaw)),
      hasExplicitTiming: msValues.length >= 2,
      hasExplicitCount: /\b(twice|two|2x|double|thrice|three|3|four|4|repeat\s+once|repeat\s+twice)\b/i.test(clause)
    };
  }
  return null;
}

function extractColorSequenceWithRepeats(text) {
  const raw = String(text || '');
  if (!raw) return [];

  const segments = raw.split(/\b(?:and\s+then|then|after\s+that|followed\s+by|->)\b|[.!?]/i);
  const repeated = [];
  for (const segment of segments) {
    const isWhiteStrobeSegment = /\bwhite\b/i.test(segment) && /\b(strobe|burst)\b/i.test(segment);
    const segmentColors = isWhiteStrobeSegment
      ? ['white']
      : Array.from(segment.matchAll(/\b(red|blue|white|green)\b/ig))
        .map((m) => String(m[1] || '').toLowerCase())
        .filter(Boolean);
    if (segmentColors.length === 0) continue;
    const repeatCount = inferRepeatCount(segment);
    for (const color of segmentColors) {
      for (let i = 0; i < repeatCount; i += 1) {
        repeated.push(color);
      }
    }
  }
  if (repeated.length > 0) return repeated;

  return Array.from(raw.matchAll(/\b(red|blue|white|green)\b/ig))
    .map((m) => String(m[1] || '').toLowerCase())
    .filter(Boolean);
}

function inferRepeatCount(segment) {
  const value = String(segment || '').toLowerCase();
  if (!value) return 1;
  const repeatMatch = value.match(/\brepeat(?:ed)?\s*(\d{1,4})\s*(times?)?\b/);
  if (repeatMatch) {
    const parsed = Number(repeatMatch[1]);
    if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  }
  if (/\b(four|4)\b/.test(value)) return 4;
  if (/\b(thrice|three|3)\b/.test(value)) return 3;
  if (/\b(twice|twine|two|2x|double|2\s*times?)\b/.test(value)) return 2;
  return 1;
}

module.exports = {
  inferColorSequenceContract
};
