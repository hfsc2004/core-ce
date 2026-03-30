/**
 * ============================================================================
 * PSF Security Layer - Bucket Security Stub
 * ============================================================================
 *
 * Encapsulation point for future bucket-level RBAC/MAC policy enforcement.
 * Current behavior is explicit STUB with fail-open defaults unless
 * PSF_BUCKET_SECURITY_ENFORCE=true.
 *
 * @module security-buckets
 * @version 1.1.3 - March 5, 2026
 * ============================================================================
 */

const securityLayer = require('./security-layer');

let initialized = false;

function normalizeSessionId(value) {
  return String(value || '').trim();
}

function resolveBucketScope(sessionId) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return 'unknown';
  if (sid === 'moe-shared') return 'relay-shared';
  if (sid.startsWith('moe-agent-')) return 'relay-agent';
  if (sid.startsWith('terminal-')) return 'terminal';
  if (sid.startsWith('cterm_')) return 'coding-terminal';
  if (sid === 'terminal-shared') return 'terminal-shared';
  return 'unknown';
}

function deriveOwnerFromSessionId(sessionId) {
  const sid = normalizeSessionId(sessionId);
  if (sid.startsWith('moe-agent-')) {
    return sid.slice('moe-agent-'.length) || '';
  }
  return '';
}

function buildSecurityLabel(scope) {
  // STUB schema (future RBAC/MAC policy engine will enforce these fields).
  return {
    schemaVersion: 'bucket-label/v0-stub',
    classification: 'UNCLASSIFIED',
    compartments: [],
    releasability: ['INTERNAL'],
    policyTag: scope === 'relay-shared' ? 'shared-bucket-stub' : 'bucket-stub'
  };
}

function buildBucketDescriptor(sessionId) {
  const sid = normalizeSessionId(sessionId);
  const scope = resolveBucketScope(sid);
  return {
    sessionId: sid,
    scope,
    ownerAgentId: deriveOwnerFromSessionId(sid) || null,
    securityLabel: buildSecurityLabel(scope),
    stub: true
  };
}

function mapActionToPermission(action) {
  const v = String(action || '').trim().toLowerCase();
  if (v === 'list' || v === 'read' || v === 'read-bytes' || v === 'build-context') return 'rag:query';
  if (v === 'attach' || v === 'attach-text' || v === 'attach-bytes' || v === 'remove' || v === 'clear') return 'rag:index';
  return 'rag:query';
}

async function ensureSecurityInitialized() {
  if (initialized) return true;
  try {
    await securityLayer.initialize();
    initialized = true;
    return true;
  } catch (_) {
    return false;
  }
}

async function authorizeBucketAction({
  action,
  sessionId,
  actor = {},
  details = {}
} = {}) {
  const descriptor = buildBucketDescriptor(sessionId);
  const permission = mapActionToPermission(action);
  const enforce = String(process.env.PSF_BUCKET_SECURITY_ENFORCE || '').trim().toLowerCase() === 'true';

  let allowed = true;
  let reason = 'stub_allow';
  if (enforce) {
    await ensureSecurityInitialized();
    allowed = await securityLayer.checkPermission(permission, actor);
    reason = allowed ? 'policy_allow' : 'policy_deny';
  }

  securityLayer.auditLog('bucket_access_decision', {
    permission,
    action: String(action || ''),
    allowed,
    reason,
    bucket: descriptor,
    actor: {
      userId: String(actor?.userId || actor?.user || 'default'),
      role: securityLayer.getCurrentRole(actor)
    },
    details: {
      ...details,
      STUB: true
    }
  });

  return {
    allowed,
    reason,
    permission,
    bucket: descriptor
  };
}

module.exports = {
  resolveBucketScope,
  buildBucketDescriptor,
  authorizeBucketAction
};

