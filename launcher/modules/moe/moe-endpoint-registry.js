/**
 * ============================================================================
 * MOE ENDPOINT REGISTRY
 * ============================================================================
 *
 * Hardware-agnostic endpoint registry for distributed MoE role workers.
 * Provides role-to-endpoint mapping, health-aware selection, and failover.
 *
 * @module moe-endpoint-registry
 * @version 1.1.2 - March 5, 2026
 * @license SEE LICENSE.txt
 * ============================================================================
 */

const moeEndpoint = require('./moe-endpoint');

const DEFAULTS = Object.freeze({
  enabled: false,
  includeLocalAgents: true,
  selection: 'priority',
  defaultTimeoutMs: 120000,
  maxConsecutiveFailures: 2,
  cooldownMs: 20000
});

function createEndpointRegistry(config = {}, deployedAgents = []) {
  const normalized = normalizeConfig(config);
  const roleWorkers = new Map();
  const workerState = new Map();

  if (!normalized.enabled) {
    return createNoopRegistry();
  }

  ingestConfiguredWorkers(normalized, roleWorkers, workerState);
  if (normalized.includeLocalAgents) {
    ingestLocalAgentWorkers(deployedAgents, normalized, roleWorkers, workerState);
  }

  return {
    enabled: true,
    resolveForAgent,
    reportResult,
    listByRole,
    status: getStatus
  };

  function resolveForAgent(agent = {}, options = {}) {
    const role = resolveAgentRole(agent, normalized.agentRoleMap);
    const workers = listByRole(role);
    if (workers.length === 0) return null;

    const now = Date.now();
    const viable = workers.filter((w) => {
      const s = workerState.get(w.id) || {};
      if (!w.enabled) return false;
      if (s.cooldownUntil && s.cooldownUntil > now) return false;
      return true;
    });
    const pool = viable.length > 0 ? viable : workers.filter((w) => w.enabled !== false);
    if (pool.length === 0) return null;

    const rankedPool = pool.map((worker) => {
      const state = workerState.get(worker.id) || {};
      return {
        ...worker,
        _lastLatencyMs: Number.isFinite(Number(state.lastLatencyMs))
          ? Number(state.lastLatencyMs)
          : null
      };
    });

    const selected = selectWorker(rankedPool, normalized.selection);
    return {
      ...selected,
      role,
      timeoutMs: normalizeTimeout(options.timeoutMs, selected.timeoutMs, normalized.defaultTimeoutMs)
    };
  }

  function reportResult(workerId, result = {}) {
    if (!workerId || !workerState.has(workerId)) return;
    const entry = workerState.get(workerId);
    const success = result.success === true;
    const latencyMs = Number.isFinite(Number(result.latencyMs)) ? Number(result.latencyMs) : null;
    if (success) {
      entry.consecutiveFailures = 0;
      entry.lastSuccessAt = new Date().toISOString();
      entry.healthy = true;
      entry.cooldownUntil = 0;
      if (Number.isFinite(latencyMs)) {
        entry.lastLatencyMs = latencyMs;
      }
      workerState.set(workerId, entry);
      return;
    }

    entry.consecutiveFailures = (entry.consecutiveFailures || 0) + 1;
    entry.lastFailureAt = new Date().toISOString();
    entry.lastError = String(result.error || result.reason || 'unknown failure');
    entry.healthy = false;

    const worker = findWorkerById(workerId, roleWorkers);
    const maxFailures = Number.isInteger(worker?.maxConsecutiveFailures)
      ? worker.maxConsecutiveFailures
      : normalized.maxConsecutiveFailures;
    const cooldownMs = Number.isFinite(Number(worker?.cooldownMs))
      ? Number(worker.cooldownMs)
      : normalized.cooldownMs;
    if (entry.consecutiveFailures >= maxFailures) {
      entry.cooldownUntil = Date.now() + Math.max(1000, cooldownMs);
    }
    workerState.set(workerId, entry);
  }

  function listByRole(role) {
    const key = normalizeRole(role);
    return key && roleWorkers.has(key) ? [...roleWorkers.get(key)] : [];
  }

  function getStatus() {
    const roles = {};
    for (const [role, workers] of roleWorkers.entries()) {
      roles[role] = workers.map((worker) => {
        const state = workerState.get(worker.id) || {};
        return {
          id: worker.id,
          name: worker.name,
          source: worker.source,
          endpoint: worker.endpoint,
          priority: worker.priority,
          healthy: state.healthy !== false,
          consecutiveFailures: state.consecutiveFailures || 0,
          cooldownUntil: state.cooldownUntil || 0,
          lastLatencyMs: Number.isFinite(Number(state.lastLatencyMs)) ? Number(state.lastLatencyMs) : null,
          lastSuccessAt: state.lastSuccessAt || null,
          lastFailureAt: state.lastFailureAt || null
        };
      });
    }
    return {
      enabled: true,
      selection: normalized.selection,
      roles
    };
  }
}

function createNoopRegistry() {
  return {
    enabled: false,
    resolveForAgent: () => null,
    reportResult: () => {},
    listByRole: () => [],
    status: () => ({ enabled: false, roles: {} })
  };
}

function normalizeConfig(input = {}) {
  const root = isObject(input) ? input : {};
  const rolesRaw = root.roles;
  const roleWorkers = {};
  if (Array.isArray(rolesRaw)) {
    for (const roleEntry of rolesRaw) {
      const role = normalizeRole(roleEntry?.role);
      if (!role) continue;
      roleWorkers[role] = Array.isArray(roleEntry?.workers) ? roleEntry.workers : [];
    }
  } else if (isObject(rolesRaw)) {
    for (const [roleKey, workers] of Object.entries(rolesRaw)) {
      const role = normalizeRole(roleKey);
      if (!role) continue;
      roleWorkers[role] = Array.isArray(workers) ? workers : [];
    }
  }

  return {
    enabled: root.enabled === true,
    includeLocalAgents: root.includeLocalAgents !== false,
    selection: normalizeSelection(root.selection),
    defaultTimeoutMs: normalizeTimeout(root.defaultTimeoutMs, DEFAULTS.defaultTimeoutMs, DEFAULTS.defaultTimeoutMs),
    maxConsecutiveFailures: normalizeInt(root.maxConsecutiveFailures, DEFAULTS.maxConsecutiveFailures, 1, 20),
    cooldownMs: normalizeInt(root.cooldownMs, DEFAULTS.cooldownMs, 1000, 300000),
    agentRoleMap: isObject(root.agentRoleMap) ? root.agentRoleMap : {},
    roles: roleWorkers
  };
}

function ingestConfiguredWorkers(config, roleWorkers, workerState) {
  for (const [role, workers] of Object.entries(config.roles)) {
    const out = [];
    workers.forEach((rawWorker, index) => {
      const worker = normalizeWorker(rawWorker, role, `cfg-${role}-${index + 1}`);
      if (!worker) return;
      out.push(worker);
      workerState.set(worker.id, initWorkerState());
    });
    if (out.length > 0) {
      roleWorkers.set(role, out);
    }
  }
}

function ingestLocalAgentWorkers(deployedAgents, config, roleWorkers, workerState) {
  const list = Array.isArray(deployedAgents) ? deployedAgents : [];
  for (const agent of list) {
    if (!agent?.id || !agent?.endpoint) continue;
    const role = resolveAgentRole(agent, config.agentRoleMap);
    if (!role) continue;
    const worker = normalizeWorker({
      id: `local-${agent.id}`,
      name: `${agent.name || agent.id} (local)`,
      endpoint: agent.endpoint,
      modelId: agent.modelId,
      modelName: agent.modelName,
      priority: 0,
      source: 'local-agent',
      enabled: true
    }, role, `local-${agent.id}`);
    if (!worker) continue;
    if (!roleWorkers.has(role)) roleWorkers.set(role, []);
    const exists = roleWorkers.get(role).some((w) => w.id === worker.id);
    if (!exists) {
      roleWorkers.get(role).push(worker);
      workerState.set(worker.id, initWorkerState());
    }
  }
}

function normalizeWorker(rawWorker, role, fallbackId) {
  if (!isObject(rawWorker)) return null;
  const endpoint = normalizeEndpoint(rawWorker.endpoint);
  if (!endpoint) return null;
  return {
    id: String(rawWorker.id || fallbackId || `${role}-worker`).trim(),
    name: String(rawWorker.name || rawWorker.id || fallbackId || `${role} worker`).trim(),
    role,
    endpoint,
    modelId: String(rawWorker.modelId || '').trim() || null,
    modelName: String(rawWorker.modelName || '').trim() || null,
    priority: normalizeInt(rawWorker.priority, 0, -100, 100),
    enabled: rawWorker.enabled !== false,
    source: String(rawWorker.source || 'registry').trim() || 'registry',
    timeoutMs: normalizeTimeout(rawWorker.timeoutMs, DEFAULTS.defaultTimeoutMs, DEFAULTS.defaultTimeoutMs),
    cooldownMs: normalizeInt(rawWorker.cooldownMs, DEFAULTS.cooldownMs, 1000, 300000),
    maxConsecutiveFailures: normalizeInt(rawWorker.maxConsecutiveFailures, DEFAULTS.maxConsecutiveFailures, 1, 20)
  };
}

function normalizeEndpoint(rawEndpoint) {
  if (!isObject(rawEndpoint)) return null;
  if (rawEndpoint.type === moeEndpoint.ENDPOINT_TYPES.UNIX_SOCKET || rawEndpoint.socket) {
    const socketPath = String(rawEndpoint.socket || '').trim();
    if (!socketPath) return null;
    return moeEndpoint.createUnixSocketEndpoint(socketPath);
  }
  const host = String(rawEndpoint.host || '').trim();
  const port = Number.parseInt(String(rawEndpoint.port || ''), 10);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const secure = String(rawEndpoint.protocol || '').toLowerCase() === 'https';
  if (rawEndpoint.type === moeEndpoint.ENDPOINT_TYPES.REMOTE) {
    return moeEndpoint.createRemoteEndpoint(host, port, secure);
  }
  return moeEndpoint.createLocalEndpoint(port, host);
}

function initWorkerState() {
  return {
    healthy: true,
    consecutiveFailures: 0,
    cooldownUntil: 0,
    lastLatencyMs: null,
    lastSuccessAt: null,
    lastFailureAt: null
  };
}

function resolveAgentRole(agent, agentRoleMap = {}) {
  const mappedById = normalizeRole(agentRoleMap[agent?.id]);
  if (mappedById) return mappedById;
  const mappedByName = normalizeRole(agentRoleMap[agent?.name]);
  if (mappedByName) return mappedByName;
  const directRole = normalizeRole(agent?.role || agent?.routingRole || agent?.pipelineRole);
  if (directRole) return directRole;
  const fromName = normalizeRole(agent?.name);
  if (fromName) return fromName;
  return normalizeRole(agent?.id);
}

function selectWorker(workers, selection) {
  const list = [...workers];
  if (selection === 'latency') {
    list.sort((a, b) => {
      const aLat = Number.isFinite(Number(a._lastLatencyMs)) ? Number(a._lastLatencyMs) : Number.POSITIVE_INFINITY;
      const bLat = Number.isFinite(Number(b._lastLatencyMs)) ? Number(b._lastLatencyMs) : Number.POSITIVE_INFINITY;
      if (aLat !== bLat) return aLat - bLat;
      return b.priority - a.priority;
    });
    return list[0];
  }
  list.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.source !== b.source) {
      if (a.source === 'local-agent') return -1;
      if (b.source === 'local-agent') return 1;
    }
    return a.id.localeCompare(b.id);
  });
  return list[0];
}

function findWorkerById(workerId, roleWorkers) {
  for (const workers of roleWorkers.values()) {
    const hit = workers.find((worker) => worker.id === workerId);
    if (hit) return hit;
  }
  return null;
}

function normalizeRole(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/\s+/g, '-');
}

function normalizeSelection(value) {
  const mode = String(value || '').trim().toLowerCase();
  return mode === 'latency' ? 'latency' : 'priority';
}

function normalizeInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeTimeout(...values) {
  for (const value of values) {
    const n = Number.parseInt(String(value), 10);
    if (Number.isInteger(n) && n >= 1000 && n <= 600000) {
      return n;
    }
  }
  return DEFAULTS.defaultTimeoutMs;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  createEndpointRegistry
};
