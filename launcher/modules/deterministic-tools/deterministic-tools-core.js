/**
 * ============================================================================
 * DETERMINISTIC TOOLS CORE RUNTIME
 * ============================================================================
 *
 * Shared deterministic tooling runtime for all PSF surfaces:
 * - PSF Terminal
 * - Coding Terminal
 * - MoE/IRG
 *
 * Provides:
 * - Tool registry (name -> deterministic handler)
 * - Policy gate (allow/deny by surface/role)
 * - Trace records (auditable execution history)
 *
 * @module deterministic-tools-core
 * @version 1.1.2 - March 5, 2026
 * @license SEE LICENSE.txt
 * ============================================================================
 */

const DEFAULT_POLICY = Object.freeze({
  defaultAllow: true,
  denyBySurface: {},
  allowBySurface: {},
  denyByRole: {},
  allowByRole: {}
});

function createRuntime(options = {}) {
  const registry = new Map();
  const traces = [];
  const maxTraces = normalizeInt(options.maxTraces, 500, 50, 5000);
  let policy = normalizePolicy(options.policy || {});

  function registerTool(definition = {}) {
    const tool = normalizeToolDefinition(definition);
    if (!tool) {
      return { success: false, message: 'Invalid tool definition' };
    }
    registry.set(tool.name, tool);
    return { success: true, tool: serializeTool(tool) };
  }

  function registerTools(toolDefs = []) {
    const defs = Array.isArray(toolDefs) ? toolDefs : [];
    const out = [];
    for (const def of defs) {
      out.push(registerTool(def));
    }
    return {
      success: out.every((r) => r.success),
      total: out.length,
      registered: out.filter((r) => r.success).length
    };
  }

  async function executeTool(request = {}) {
    const start = Date.now();
    const traceId = `dtool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const toolName = String(request.toolName || '').trim();
    const args = isObject(request.args) ? request.args : {};
    const context = isObject(request.context) ? request.context : {};
    const surface = normalizeName(context.surface || 'unknown');
    const role = normalizeName(context.role || 'unknown');

    const tool = registry.get(toolName);
    if (!tool) {
      const result = {
        success: false,
        error: `Tool not found: ${toolName}`,
        traceId
      };
      appendTrace({
        traceId, toolName, surface, role, args, success: false, error: result.error, startedAt: start
      });
      return result;
    }

    const gate = checkPolicy(tool, surface, role);
    if (!gate.allowed) {
      const result = {
        success: false,
        error: `Policy denied tool '${toolName}' for surface='${surface}' role='${role}'`,
        traceId
      };
      appendTrace({
        traceId, toolName, surface, role, args, success: false, error: result.error, startedAt: start
      });
      return result;
    }

    const timeoutMs = normalizeInt(request.timeoutMs, tool.timeoutMs || 30000, 100, 600000);
    try {
      const output = await runWithTimeout(
        () => Promise.resolve(tool.handler(args, { ...context, traceId })),
        timeoutMs
      );
      const result = { success: true, toolName, output, traceId };
      appendTrace({
        traceId, toolName, surface, role, args, success: true, output, startedAt: start
      });
      return result;
    } catch (err) {
      const error = err && err.message ? err.message : String(err);
      const result = { success: false, error, traceId };
      appendTrace({
        traceId, toolName, surface, role, args, success: false, error, startedAt: start
      });
      return result;
    }
  }

  function setPolicy(nextPolicy = {}) {
    policy = normalizePolicy(nextPolicy);
    return { success: true, policy };
  }

  function getPolicy() {
    return { ...policy };
  }

  function listTools() {
    return Array.from(registry.values()).map(serializeTool);
  }

  function getTraces(limit = 100) {
    const max = normalizeInt(limit, 100, 1, 1000);
    return traces.slice(Math.max(0, traces.length - max));
  }

  function clearTraces() {
    traces.length = 0;
    return { success: true };
  }

  function checkPolicy(tool, surface, role) {
    const t = tool.name;
    const bySurfaceDeny = toSet(policy.denyBySurface[surface]);
    if (bySurfaceDeny.has('*') || bySurfaceDeny.has(t)) return { allowed: false, reason: 'surface-deny' };

    const byRoleDeny = toSet(policy.denyByRole[role]);
    if (byRoleDeny.has('*') || byRoleDeny.has(t)) return { allowed: false, reason: 'role-deny' };

    const bySurfaceAllow = toSet(policy.allowBySurface[surface]);
    const byRoleAllow = toSet(policy.allowByRole[role]);

    const hasAllowList = bySurfaceAllow.size > 0 || byRoleAllow.size > 0;
    if (hasAllowList) {
      const allowed = bySurfaceAllow.has('*') || bySurfaceAllow.has(t) || byRoleAllow.has('*') || byRoleAllow.has(t);
      return { allowed, reason: allowed ? 'allow-list' : 'not-allowed' };
    }
    return { allowed: policy.defaultAllow === true, reason: 'default' };
  }

  function appendTrace(entry) {
    const startedAt = Number(entry.startedAt || Date.now());
    const endedAt = Date.now();
    traces.push({
      traceId: entry.traceId,
      toolName: entry.toolName,
      surface: entry.surface,
      role: entry.role,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: Math.max(0, endedAt - startedAt),
      success: entry.success === true,
      error: entry.error ? String(entry.error) : null,
      argsPreview: safePreview(entry.args),
      outputPreview: safePreview(entry.output)
    });
    if (traces.length > maxTraces) {
      traces.splice(0, traces.length - maxTraces);
    }
  }

  return {
    registerTool,
    registerTools,
    listTools,
    executeTool,
    setPolicy,
    getPolicy,
    getTraces,
    clearTraces
  };
}

function normalizeToolDefinition(def = {}) {
  if (!isObject(def) || typeof def.handler !== 'function') return null;
  const name = normalizeName(def.name);
  if (!name) return null;
  return {
    name,
    description: String(def.description || '').trim(),
    schema: isObject(def.schema) ? def.schema : {},
    handler: def.handler,
    timeoutMs: normalizeInt(def.timeoutMs, 30000, 100, 600000)
  };
}

function serializeTool(tool) {
  return {
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    timeoutMs: tool.timeoutMs
  };
}

function normalizePolicy(raw = {}) {
  const p = isObject(raw) ? raw : {};
  return {
    ...DEFAULT_POLICY,
    defaultAllow: p.defaultAllow !== false,
    denyBySurface: normalizeMapOfArrays(p.denyBySurface),
    allowBySurface: normalizeMapOfArrays(p.allowBySurface),
    denyByRole: normalizeMapOfArrays(p.denyByRole),
    allowByRole: normalizeMapOfArrays(p.allowByRole)
  };
}

function normalizeMapOfArrays(input) {
  const out = {};
  const src = isObject(input) ? input : {};
  for (const [k, v] of Object.entries(src)) {
    out[normalizeName(k)] = Array.isArray(v) ? v.map(normalizeName).filter(Boolean) : [];
  }
  return out;
}

function toSet(list) {
  return new Set(Array.isArray(list) ? list.map(normalizeName).filter(Boolean) : []);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function safePreview(value) {
  if (value == null) return null;
  let json = '';
  try {
    json = JSON.stringify(value);
  } catch {
    json = String(value);
  }
  if (json.length <= 240) return json;
  return `${json.slice(0, 240)}...`;
}

async function runWithTimeout(fn, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Tool timeout after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  createRuntime
};
