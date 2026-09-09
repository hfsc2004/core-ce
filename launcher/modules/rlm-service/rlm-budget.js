/**
 * RLM budget normalization.
 */

function clampInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function normalizeModelBehavior(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (raw === 'thinking' || raw === 'non_thinking' || raw === 'unknown') return raw;
  return 'unknown';
}

function normalizeProfile(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (raw === 'fast' || raw === 'balanced' || raw === 'deep' || raw === 'industrial_safe') return raw;
  return 'balanced';
}

function defaultsForProfile(profile, modelBehavior) {
  const behavior = normalizeModelBehavior(modelBehavior);
  const key = normalizeProfile(profile);
  const thinking = {
    fast: { maxRootIterations: 2, maxRecursionDepth: 1, maxSubcalls: 4, maxRuntimeMs: 30000 },
    balanced: { maxRootIterations: 4, maxRecursionDepth: 1, maxSubcalls: 16, maxRuntimeMs: 90000 },
    deep: { maxRootIterations: 8, maxRecursionDepth: 2, maxSubcalls: 64, maxRuntimeMs: 300000 },
    industrial_safe: { maxRootIterations: 3, maxRecursionDepth: 1, maxSubcalls: 8, maxRuntimeMs: 60000 }
  };
  const nonThinking = {
    fast: { maxRootIterations: 3, maxRecursionDepth: 1, maxSubcalls: 8, maxRuntimeMs: 45000 },
    balanced: { maxRootIterations: 6, maxRecursionDepth: 2, maxSubcalls: 32, maxRuntimeMs: 120000 },
    deep: { maxRootIterations: 12, maxRecursionDepth: 3, maxSubcalls: 128, maxRuntimeMs: 600000 },
    industrial_safe: { maxRootIterations: 4, maxRecursionDepth: 1, maxSubcalls: 12, maxRuntimeMs: 60000 }
  };
  const unknown = {
    fast: { maxRootIterations: 3, maxRecursionDepth: 1, maxSubcalls: 8, maxRuntimeMs: 30000 },
    balanced: { maxRootIterations: 6, maxRecursionDepth: 2, maxSubcalls: 32, maxRuntimeMs: 120000 },
    deep: { maxRootIterations: 12, maxRecursionDepth: 3, maxSubcalls: 128, maxRuntimeMs: 600000 },
    industrial_safe: { maxRootIterations: 4, maxRecursionDepth: 1, maxSubcalls: 12, maxRuntimeMs: 60000 }
  };
  const table = behavior === 'thinking' ? thinking : (behavior === 'non_thinking' ? nonThinking : unknown);
  return table[key] || table.balanced;
}

function normalizeRlmBudget(raw = {}, options = {}) {
  const profile = normalizeProfile(options.profile || raw.profile);
  const modelBehavior = normalizeModelBehavior(options.modelBehavior || raw.modelBehavior);
  const defaults = defaultsForProfile(profile, modelBehavior);
  return {
    profile,
    modelBehavior,
    maxRuntimeMs: clampInt(raw.maxRuntimeMs, defaults.maxRuntimeMs, 1000, 3600000),
    maxRootIterations: clampInt(raw.maxRootIterations, defaults.maxRootIterations, 1, 64),
    maxReplExecMs: clampInt(raw.maxReplExecMs, 5000, 250, 120000),
    maxRecursionDepth: clampInt(raw.maxRecursionDepth, defaults.maxRecursionDepth, 0, 12),
    maxSubcalls: clampInt(raw.maxSubcalls, defaults.maxSubcalls, 0, 1000),
    maxParallelSubcalls: clampInt(raw.maxParallelSubcalls, 1, 1, 32),
    maxPromptSliceChars: clampInt(raw.maxPromptSliceChars, 12000, 512, 200000),
    maxStdoutCharsPerIteration: clampInt(raw.maxStdoutCharsPerIteration, 4000, 256, 100000),
    maxStderrCharsPerIteration: clampInt(raw.maxStderrCharsPerIteration, 2000, 256, 50000),
    maxEnvironmentValueBytes: clampInt(raw.maxEnvironmentValueBytes, 1024 * 1024, 4096, 100 * 1024 * 1024),
    maxTotalEnvironmentBytes: clampInt(raw.maxTotalEnvironmentBytes, 16 * 1024 * 1024, 4096, 512 * 1024 * 1024),
    maxFinalOutputChars: clampInt(raw.maxFinalOutputChars, 24000, 512, 1000000),
    maxTokensPerSubcall: clampInt(raw.maxTokensPerSubcall, 1024, 64, 32768),
    maxTotalTokens: clampInt(raw.maxTotalTokens, 65536, 1024, 10000000)
  };
}

module.exports = {
  normalizeModelBehavior,
  normalizeProfile,
  normalizeRlmBudget
};
