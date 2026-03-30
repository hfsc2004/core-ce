/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ============================================================================
 * MOE PIPELINE OPS - Endpoint Registry Operations
 * ============================================================================
 *
 * Extracted from moe-pipeline-ops.js to keep that file manageable.
 * No behavior changes: this is a structural split only.
 * ============================================================================
 */

function ensureEndpointRegistryState() {
  if (!window.modelOrderingState.endpointRegistry || typeof window.modelOrderingState.endpointRegistry !== 'object') {
    window.modelOrderingState.endpointRegistry = {};
  }
  const reg = window.modelOrderingState.endpointRegistry;
  if (typeof reg.enabled !== 'boolean') reg.enabled = false;
  if (typeof reg.includeLocalAgents !== 'boolean') reg.includeLocalAgents = true;
  if (!['priority', 'latency'].includes(String(reg.selection || '').toLowerCase())) reg.selection = 'priority';
  if (!Number.isFinite(Number(reg.defaultTimeoutMs))) reg.defaultTimeoutMs = 120000;
  if (!Number.isFinite(Number(reg.maxConsecutiveFailures))) reg.maxConsecutiveFailures = 2;
  if (!Number.isFinite(Number(reg.cooldownMs))) reg.cooldownMs = 20000;
  if (!reg.agentRoleMap || typeof reg.agentRoleMap !== 'object' || Array.isArray(reg.agentRoleMap)) reg.agentRoleMap = {};
  if (!reg.roles || typeof reg.roles !== 'object' || Array.isArray(reg.roles)) reg.roles = {};
  return reg;
}

function setEndpointRegistryEnabled(enabled) {
  const reg = ensureEndpointRegistryState();
  reg.enabled = enabled === true;
  renderModelOrdering();
}

function updateEndpointRegistryCore(key, value) {
  const reg = ensureEndpointRegistryState();
  switch (String(key || '')) {
    case 'selection':
      reg.selection = String(value || '').toLowerCase() === 'latency' ? 'latency' : 'priority';
      break;
    case 'includeLocalAgents':
      reg.includeLocalAgents = value === true;
      break;
    case 'defaultTimeoutMs': {
      const n = Number.parseInt(String(value), 10);
      reg.defaultTimeoutMs = Number.isInteger(n) && n >= 1000 ? Math.min(n, 600000) : 120000;
      break;
    }
    case 'maxConsecutiveFailures': {
      const n = Number.parseInt(String(value), 10);
      reg.maxConsecutiveFailures = Number.isInteger(n) && n >= 1 ? Math.min(n, 20) : 2;
      break;
    }
    case 'cooldownMs': {
      const n = Number.parseInt(String(value), 10);
      reg.cooldownMs = Number.isInteger(n) && n >= 1000 ? Math.min(n, 300000) : 20000;
      break;
    }
    default:
      return;
  }
  renderModelOrdering();
}

function updateEndpointRegistryAgentRole(agentId, roleValue) {
  const reg = ensureEndpointRegistryState();
  const key = String(agentId || '').trim();
  if (!key) return;
  const role = String(roleValue || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!role) {
    delete reg.agentRoleMap[key];
  } else {
    reg.agentRoleMap[key] = role;
  }
}

function addEndpointRegistryWorker() {
  const reg = ensureEndpointRegistryState();
  const knownRoles = Object.keys(reg.roles || {});
  const fallbackRole = knownRoles[0] || 'navigator';
  if (!Array.isArray(reg.roles[fallbackRole])) reg.roles[fallbackRole] = [];
  reg.roles[fallbackRole].push({
    id: `${fallbackRole}-worker-${Date.now()}`,
    name: `${fallbackRole} worker`,
    endpoint: { type: 'remote', host: '127.0.0.1', port: 11434, protocol: 'http' },
    modelId: '',
    modelName: '',
    priority: 0,
    enabled: true
  });
  renderModelOrdering();
}

function normalizeRoleName(rawValue) {
  const raw = String(rawValue || '').trim();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_err) {
    decoded = raw;
  }
  return String(decoded || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function updateEndpointRegistryWorker(role, index, field, value) {
  const reg = ensureEndpointRegistryState();
  const roleKey = normalizeRoleName(role);
  const list = Array.isArray(reg.roles[roleKey]) ? reg.roles[roleKey] : [];
  const idx = Number.parseInt(String(index), 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return;
  const worker = list[idx];
  if (!worker || typeof worker !== 'object') return;
  if (!worker.endpoint || typeof worker.endpoint !== 'object') {
    worker.endpoint = { type: 'remote', host: '127.0.0.1', port: 11434, protocol: 'http' };
  }

  switch (String(field || '')) {
    case 'role': {
      const nextRole = normalizeRoleName(value);
      if (!nextRole || nextRole === roleKey) break;
      if (!Array.isArray(reg.roles[nextRole])) reg.roles[nextRole] = [];
      reg.roles[nextRole].push(worker);
      list.splice(idx, 1);
      if (list.length === 0) delete reg.roles[roleKey];
      renderModelOrdering();
      return;
    }
    case 'name':
      worker.name = String(value || '');
      break;
    case 'modelId':
      worker.modelId = String(value || '');
      break;
    case 'priority': {
      const n = Number.parseInt(String(value), 10);
      worker.priority = Number.isInteger(n) ? Math.max(-100, Math.min(100, n)) : 0;
      break;
    }
    case 'enabled':
      worker.enabled = value === true;
      break;
    case 'endpointType': {
      const type = String(value || '').toLowerCase();
      worker.endpoint.type = type === 'remote' ? 'remote' : (type === 'unix' ? 'unix' : 'local');
      if (worker.endpoint.type === 'unix') {
        delete worker.endpoint.host;
        delete worker.endpoint.port;
        worker.endpoint.socket = String(worker.endpoint.socket || '/tmp/moe-worker.sock');
      } else {
        delete worker.endpoint.socket;
        worker.endpoint.host = String(worker.endpoint.host || '127.0.0.1');
        worker.endpoint.port = Number.isInteger(Number(worker.endpoint.port)) ? Number(worker.endpoint.port) : 11434;
        worker.endpoint.protocol = String(worker.endpoint.protocol || 'http').toLowerCase() === 'https' ? 'https' : 'http';
      }
      break;
    }
    case 'host':
      worker.endpoint.host = String(value || '');
      break;
    case 'socket':
      worker.endpoint.socket = String(value || '');
      break;
    case 'port': {
      const n = Number.parseInt(String(value), 10);
      worker.endpoint.port = Number.isInteger(n) ? Math.max(1, Math.min(65535, n)) : 11434;
      break;
    }
    default:
      break;
  }
  renderModelOrdering();
}

function removeEndpointRegistryWorker(role, index) {
  const reg = ensureEndpointRegistryState();
  const roleKey = normalizeRoleName(role);
  const list = Array.isArray(reg.roles[roleKey]) ? reg.roles[roleKey] : [];
  const idx = Number.parseInt(String(index), 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return;
  list.splice(idx, 1);
  if (list.length === 0) delete reg.roles[roleKey];
  renderModelOrdering();
}

async function applyDeterministicPolicyPresetFromMoe() {
  try {
    if (!window.electronAPI?.applyDeterministicToolPolicyPreset) {
      if (typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine('Deterministic tools policy API is unavailable in this build.', 'warn');
      }
      return;
    }
    const select = document.getElementById('moe-dtools-policy-preset');
    const preset = String(select?.value || 'rlm').trim();
    if (!preset) return;
    const result = await window.electronAPI.applyDeterministicToolPolicyPreset(preset);
    if (result?.success) {
      if (typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine(`Deterministic tools policy preset applied: ${preset}`, 'success');
      }
      return;
    }
    if (typeof window.appendMoeDeployStatusLine === 'function') {
      window.appendMoeDeployStatusLine(`Failed to apply preset: ${result?.message || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    console.error('[MoE] Failed to apply deterministic tools policy preset:', err);
    if (typeof window.appendMoeDeployStatusLine === 'function') {
      window.appendMoeDeployStatusLine(`Failed to apply preset: ${err.message}`, 'error');
    }
  }
}

window.ensureEndpointRegistryState = ensureEndpointRegistryState;
window.setEndpointRegistryEnabled = setEndpointRegistryEnabled;
window.updateEndpointRegistryCore = updateEndpointRegistryCore;
window.updateEndpointRegistryAgentRole = updateEndpointRegistryAgentRole;
window.addEndpointRegistryWorker = addEndpointRegistryWorker;
window.updateEndpointRegistryWorker = updateEndpointRegistryWorker;
window.removeEndpointRegistryWorker = removeEndpointRegistryWorker;
window.applyDeterministicPolicyPresetFromMoe = applyDeterministicPolicyPresetFromMoe;
