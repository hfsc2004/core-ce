/**
 * MoE Pipeline Ops Updates - Attachment Primitives
 * Extracted from moe-pipeline-ops-updates.js
 */
function resolveMoeAttachmentSessionId(scope, agentId) {
  const id = String(agentId || '').trim();
  if (String(scope || '').trim().toLowerCase() === 'shared') return 'moe-shared';
  if (!id) return 'moe-agent-unknown';
  return `moe-agent-${id}`;
}

function normalizeMoeBucketId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getMoeBucketPrincipal() {
  return 'relay-system';
}

function ensureAgentRlmAttachmentSession(agent) {
  if (!agent || agent.type !== 'agent') return 'moe-agent-unknown';
  const existing = String(agent.rlmAttachmentSessionId || '').trim();
  if (existing) return existing;
  const derived = resolveMoeAttachmentSessionId('agent', agent.id);
  agent.rlmAttachmentSessionId = derived;
  return derived;
}

function getAgentAttachmentTarget(agent) {
  const bucketId = String(agent?.rlmAttachmentBucketId || '').trim();
  const sessionId = String(agent?.rlmAttachmentSessionId || '').trim()
    || ensureAgentRlmAttachmentSession(agent);
  return { bucketId, sessionId, scope: 'agent' };
}

function getSharedAttachmentTarget(agent) {
  const bucketId = String(agent?.rlmSharedAttachmentBucketId || '').trim();
  const sessionId = String(agent?.rlmSharedAttachmentSessionId || '').trim() || 'moe-shared';
  return { bucketId, sessionId, scope: 'shared' };
}

function applyAttachmentTarget(agent, scope, target = {}) {
  if (!agent || agent.type !== 'agent') return;
  const bucketId = String(target.bucketId || '').trim();
  const sessionId = String(target.sessionId || '').trim();
  if (scope === 'shared') {
    agent.rlmSharedAttachmentBucketId = bucketId;
    agent.rlmSharedAttachmentSessionId = sessionId || 'moe-shared';
    return;
  }
  agent.rlmAttachmentBucketId = bucketId;
  agent.rlmAttachmentSessionId = sessionId || ensureAgentRlmAttachmentSession(agent);
}

async function ensureMoeBucketDefaults(agent, scope) {
  const safeScope = String(scope || 'agent').trim().toLowerCase() === 'shared' ? 'shared' : 'agent';
  const target = safeScope === 'shared' ? getSharedAttachmentTarget(agent) : getAgentAttachmentTarget(agent);
  if (!window.electronAPI?.terminalBucketsCreate) return target;
  if (!agent || agent.type !== 'agent') return target;

  if (target.bucketId) return target;

  try {
    const bucketId = safeScope === 'shared'
      ? 'relay-shared-default'
      : normalizeMoeBucketId(`relay-agent-${agent.id}`);
    const sessionId = safeScope === 'shared'
      ? 'moe-shared'
      : ensureAgentRlmAttachmentSession(agent);
    const label = safeScope === 'shared'
      ? 'Relay Shared Bucket'
      : `Agent ${agent.name || agent.id} Bucket`;
    const created = await window.electronAPI.terminalBucketsCreate({
      bucketId,
      label,
      scope: safeScope === 'shared' ? 'relay-shared' : 'relay-agent',
      sessionId,
      ownerAgentId: safeScope === 'shared' ? '' : agent.id,
      userId: getMoeBucketPrincipal(),
      securityLabel: {
        schemaVersion: 'bucket-label/v0-stub',
        classification: 'UNCLASSIFIED',
        compartments: [],
        releasability: ['INTERNAL'],
        policyTag: safeScope === 'shared' ? 'relay-shared-stub' : 'relay-agent-stub'
      }
    });
    const bucket = created?.bucket || {};
    const resolved = {
      bucketId: String(bucket.id || bucketId),
      sessionId: String(bucket.sessionId || sessionId),
      scope: safeScope
    };
    applyAttachmentTarget(agent, safeScope, resolved);
    return resolved;
  } catch (_) {
    return target;
  }
}

async function listMoeBucketsForScope(scope, agent) {
  const safeScope = String(scope || 'agent').trim().toLowerCase() === 'shared' ? 'shared' : 'agent';
  const fallbackTarget = safeScope === 'shared' ? getSharedAttachmentTarget(agent) : getAgentAttachmentTarget(agent);
  if (!window.electronAPI?.terminalBucketsList) {
    return [{
      id: fallbackTarget.bucketId || '',
      label: fallbackTarget.bucketId || fallbackTarget.sessionId,
      sessionId: fallbackTarget.sessionId,
      scope: safeScope === 'shared' ? 'relay-shared' : 'relay-agent',
      ownerAgentId: safeScope === 'shared' ? null : agent?.id || null
    }].filter((row) => row.id || row.sessionId);
  }
  const listed = await window.electronAPI.terminalBucketsList({ userId: getMoeBucketPrincipal() });
  const buckets = Array.isArray(listed?.buckets) ? listed.buckets : [];
  const filtered = buckets.filter((bucket) => {
    const bucketScope = String(bucket?.scope || '').trim().toLowerCase();
    if (safeScope === 'shared') {
      return bucketScope === 'relay-shared' || bucketScope === 'global-shared';
    }
    if (bucketScope !== 'relay-agent') return false;
    const ownerAgentId = String(bucket?.ownerAgentId || '').trim();
    return !agent?.id || !ownerAgentId || ownerAgentId === agent.id;
  });
  return filtered.sort((a, b) => String(a?.label || a?.id || '').localeCompare(String(b?.label || b?.id || '')));
}

function getMoeAttachmentCountState() {
  const state = window.modelOrderingState || {};
  if (!state.moeAttachmentCounts || typeof state.moeAttachmentCounts !== 'object') {
    state.moeAttachmentCounts = {
      byAgentId: {},
      shared: { count: 0 },
      signature: '',
      loading: false
    };
  }
  return state.moeAttachmentCounts;
}

function buildMoeAttachmentCountSignature() {
  const agents = (window.modelOrderingState?.moeItems || []).filter((i) => i && i.type === 'agent');
  return agents
    .map((agent) => {
      const a = getAgentAttachmentTarget(agent);
      const s = getSharedAttachmentTarget(agent);
      return `${agent.id}:${a.bucketId || a.sessionId}:${s.bucketId || s.sessionId}`;
    })
    .sort()
    .join('|');
}

async function refreshMoeAttachmentCounts(options = {}) {
  const force = options?.force === true;
  const rerender = options?.rerender !== false;
  const countState = getMoeAttachmentCountState();
  if (countState.loading === true) return countState;
  if (!window.electronAPI?.terminalAttachmentsList) return countState;

  const signature = buildMoeAttachmentCountSignature();
  if (!force && countState.signature === signature) {
    return countState;
  }

  countState.loading = true;
  try {
    const byAgentId = {};
    const agents = (window.modelOrderingState?.moeItems || []).filter((i) => i && i.type === 'agent');
    for (const agent of agents) {
      const agentTarget = await ensureMoeBucketDefaults(agent, 'agent');
      const sharedTarget = await ensureMoeBucketDefaults(agent, 'shared');
      const agentResult = await window.electronAPI.terminalAttachmentsList({
        ...(agentTarget.bucketId ? { bucketId: agentTarget.bucketId, userId: getMoeBucketPrincipal() } : { sessionId: agentTarget.sessionId })
      });
      const agentCount = Array.isArray(agentResult?.attachments) ? agentResult.attachments.length : 0;
      const sharedResult = await window.electronAPI.terminalAttachmentsList({
        ...(sharedTarget.bucketId ? { bucketId: sharedTarget.bucketId, userId: getMoeBucketPrincipal() } : { sessionId: sharedTarget.sessionId })
      });
      const sharedCount = Array.isArray(sharedResult?.attachments) ? sharedResult.attachments.length : 0;
      byAgentId[agent.id] = {
        agentCount,
        sharedCount,
        agentSessionId: agentTarget.sessionId,
        sharedSessionId: sharedTarget.sessionId,
        agentBucketId: agentTarget.bucketId || '',
        sharedBucketId: sharedTarget.bucketId || ''
      };
    }
    countState.byAgentId = byAgentId;
    const sharedTotal = Object.values(byAgentId).reduce((max, row) => Math.max(max, Number(row?.sharedCount || 0)), 0);
    countState.shared = { count: sharedTotal };
    countState.signature = signature;
  } catch (err) {
    if (typeof window.appendMoeDeployStatusLine === 'function') {
      window.appendMoeDeployStatusLine(`Attachment count refresh failed: ${err.message || err}`, 'warn');
    }
  } finally {
    countState.loading = false;
  }

  if (rerender === true) {
    renderModelOrdering();
  }
  return countState;
}

window.resolveMoeAttachmentSessionId = resolveMoeAttachmentSessionId;
window.ensureAgentRlmAttachmentSession = ensureAgentRlmAttachmentSession;
window.refreshMoeAttachmentCounts = refreshMoeAttachmentCounts;
