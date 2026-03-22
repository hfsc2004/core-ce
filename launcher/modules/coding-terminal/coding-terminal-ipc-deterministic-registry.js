/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const registryTelemetry = new Map();

function ensureTelemetryRow(key = '') {
  const id = String(key || '').trim() || 'unknown';
  if (!registryTelemetry.has(id)) {
    registryTelemetry.set(id, {
      key: id,
      attempts: 0,
      hits: 0,
      errors: 0,
      lastHitAt: 0,
      lastErrorAt: 0
    });
  }
  return registryTelemetry.get(id);
}

function markAttempt(key) {
  const row = ensureTelemetryRow(key);
  row.attempts += 1;
}

function markHit(key) {
  const row = ensureTelemetryRow(key);
  row.hits += 1;
  row.lastHitAt = Date.now();
}

function markError(key) {
  const row = ensureTelemetryRow(key);
  row.errors += 1;
  row.lastErrorAt = Date.now();
}

function tryDeterministicRegistry({
  entries = [],
  prepareHelpers,
  shortHash,
  turnContext,
  message,
  dispatch,
  config = {},
  onMatch = null,
  defaultGrounding = null
} = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const ordered = entries
    .filter(Boolean)
    .sort((a, b) => Number(a?.priority || 1000) - Number(b?.priority || 1000));
  for (const entry of ordered) {
    if (!entry || typeof entry.build !== 'function') continue;
    const key = String(entry.key || '').trim() || 'unknown';
    const isEnabled = typeof entry.enabledByConfig === 'function'
      ? entry.enabledByConfig(config)
      : true;
    if (!isEnabled) continue;
    markAttempt(key);
    let deterministic = null;
    try {
      deterministic = entry.build();
    } catch {
      markError(key);
      continue;
    }
    if (!deterministic) continue;
    markHit(key);
    const mode = String(entry.mode || 'inspect').trim().toLowerCase() || 'inspect';
    const reason = String(entry.reason || '').trim() || 'deterministic-dispatch';
    const modelName = String(entry.modelName || '').trim() || `deterministic-${reason}`;
    const grounding = Object.prototype.hasOwnProperty.call(entry, 'grounding')
      ? entry.grounding
      : defaultGrounding;
    const dispatchOverrides = (entry.dispatch && typeof entry.dispatch === 'object')
      ? entry.dispatch
      : {};
    if (typeof onMatch === 'function') {
      try {
        onMatch({
          key,
          category: String(entry.category || 'general'),
          priority: Number(entry.priority || 1000),
          reason,
          mode
        });
      } catch {}
    }
    return prepareHelpers.buildDeterministicPrepareResult({
      modelName,
      deterministic,
      shortHash,
      turnContext,
      message,
      grounding,
      dispatch: {
        mode,
        used: false,
        reason,
        rewriteIntent: dispatch.rewriteIntent,
        inspectIntent: dispatch.inspectIntent,
        ...dispatchOverrides
      }
    });
  }
  return null;
}

function buildDeterministicEntries({ message, projectPath, builders = {} } = {}) {
  return [
    {
      key: 'plan.create',
      category: 'planner',
      priority: 100,
      reason: 'deterministic-plan-create',
      modelName: 'deterministic-plan-create',
      mode: 'inspect',
      build: () => builders.buildDeterministicPlanCreate?.({ message, projectPath })
    },
    {
      key: 'plan.validate',
      category: 'planner',
      priority: 110,
      reason: 'deterministic-plan-validate',
      modelName: 'deterministic-plan-validate',
      mode: 'inspect',
      build: () => builders.buildDeterministicPlanValidate?.({ message })
    },
    {
      key: 'plan.execute_step',
      category: 'planner',
      priority: 120,
      reason: 'deterministic-plan-execute-step',
      modelName: 'deterministic-plan-execute-step',
      mode: 'generate',
      build: () => builders.buildDeterministicPlanExecuteStep?.({ message })
    },
    {
      key: 'plan.verify',
      category: 'planner',
      priority: 130,
      reason: 'deterministic-plan-verify',
      modelName: 'deterministic-plan-verify',
      mode: 'inspect',
      build: () => builders.buildDeterministicPlanVerify?.({ message })
    },
    {
      key: 'run.start',
      category: 'plan-run',
      priority: 200,
      reason: 'deterministic-plan-run-start',
      modelName: 'deterministic-plan-run-start',
      mode: 'inspect',
      build: () => builders.buildDeterministicPlanRunStart?.({ message })
    },
    {
      key: 'run.step',
      category: 'plan-run',
      priority: 210,
      reason: 'deterministic-plan-run-step',
      modelName: 'deterministic-plan-run-step',
      mode: 'generate',
      build: () => builders.buildDeterministicPlanRunStep?.({ message })
    },
    {
      key: 'run.auto',
      category: 'plan-run',
      priority: 220,
      reason: 'deterministic-plan-run-auto',
      modelName: 'deterministic-plan-run-auto',
      mode: 'generate',
      build: () => builders.buildDeterministicPlanRunAuto?.({ message })
    },
    {
      key: 'run.status',
      category: 'plan-run',
      priority: 230,
      reason: 'deterministic-plan-run-status',
      modelName: 'deterministic-plan-run-status',
      mode: 'inspect',
      build: () => builders.buildDeterministicPlanRunStatus?.({ message })
    },
    {
      key: 'run.verify',
      category: 'plan-run',
      priority: 240,
      reason: 'deterministic-plan-run-verify',
      modelName: 'deterministic-plan-run-verify',
      mode: 'inspect',
      build: () => builders.buildDeterministicPlanRunVerify?.({ message })
    },
    {
      key: 'tool.run_tests',
      category: 'tool',
      priority: 300,
      reason: 'deterministic-tool-run-tests',
      modelName: 'deterministic-tool-run-tests',
      mode: 'inspect',
      build: () => builders.buildDeterministicToolRunTests?.({ message, projectPath })
    },
    {
      key: 'tool.read_file',
      category: 'tool',
      priority: 310,
      reason: 'deterministic-tool-read-file',
      modelName: 'deterministic-tool-read-file',
      mode: 'inspect',
      build: () => builders.buildDeterministicToolReadFile?.({ message, projectPath })
    },
    {
      key: 'tool.write_file',
      category: 'tool',
      priority: 320,
      reason: 'deterministic-tool-write-file',
      modelName: 'deterministic-tool-write-file',
      mode: 'generate',
      build: () => builders.buildDeterministicToolWriteFile?.({ message, projectPath })
    },
    {
      key: 'tool.verify',
      category: 'tool',
      priority: 330,
      reason: 'deterministic-tool-verify',
      modelName: 'deterministic-tool-verify',
      mode: 'inspect',
      build: () => builders.buildDeterministicToolVerify?.({ message, projectPath })
    }
  ];
}

function resolveDeterministicPrepare({
  prepareHelpers,
  shortHash,
  turnContext,
  message,
  projectPath,
  dispatch,
  config = {},
  onMatch = null,
  builders = {}
} = {}) {
  const entries = buildDeterministicEntries({ message, projectPath, builders });
  return tryDeterministicRegistry({
    entries,
    prepareHelpers,
    shortHash,
    turnContext,
    message,
    dispatch,
    config,
    onMatch,
    defaultGrounding: null
  });
}

function listDeterministicRegistryDefinitions() {
  const entries = buildDeterministicEntries({ message: '', projectPath: '', builders: {} });
  return entries.map((entry) => ({
    key: String(entry?.key || ''),
    category: String(entry?.category || 'general'),
    priority: Number(entry?.priority || 1000),
    mode: String(entry?.mode || 'inspect')
  }));
}

function getDeterministicRegistryTelemetry(limit = 200) {
  return Array.from(registryTelemetry.values())
    .sort((a, b) => Number(b.hits || 0) - Number(a.hits || 0))
    .slice(0, Math.max(1, Number(limit) || 200))
    .map((row) => ({ ...row }));
}

module.exports = {
  resolveDeterministicPrepare,
  listDeterministicRegistryDefinitions,
  getDeterministicRegistryTelemetry
};
