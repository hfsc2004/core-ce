/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
'use strict';

const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

function nowIso() {
  return new Date().toISOString();
}

function normalizeBucketId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizePrincipal(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeScope(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'global-shared';
  if (raw === 'relay-agent') return 'relay-agent';
  if (raw === 'relay-shared') return 'relay-shared';
  if (raw === 'terminal') return 'terminal';
  if (raw === 'coding-terminal') return 'coding-terminal';
  if (raw === 'global-shared') return 'global-shared';
  return 'custom';
}

function deriveScopeFromSessionId(sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) return 'custom';
  if (sid === 'moe-shared') return 'relay-shared';
  if (sid.startsWith('moe-agent-')) return 'relay-agent';
  if (sid.startsWith('terminal-') || sid === 'terminal-default') return 'terminal';
  if (sid.startsWith('cterm_')) return 'coding-terminal';
  return 'custom';
}

function defaultSessionIdForScope(scope, options = {}) {
  if (scope === 'relay-shared') return 'moe-shared';
  if (scope === 'relay-agent') {
    const ownerAgentId = String(options.ownerAgentId || '').trim();
    if (ownerAgentId) return `moe-agent-${ownerAgentId}`;
  }
  if (scope === 'terminal') return 'terminal-default';
  if (scope === 'coding-terminal') return 'cterm_default';
  return '';
}

function normalizeSecurityLabel(label = {}) {
  const src = label && typeof label === 'object' ? label : {};
  return {
    schemaVersion: String(src.schemaVersion || 'bucket-label/v0-stub'),
    classification: String(src.classification || 'UNCLASSIFIED').toUpperCase(),
    compartments: Array.isArray(src.compartments)
      ? src.compartments.map((v) => String(v).trim()).filter(Boolean)
      : [],
    releasability: Array.isArray(src.releasability)
      ? src.releasability.map((v) => String(v).trim()).filter(Boolean)
      : ['INTERNAL'],
    policyTag: String(src.policyTag || 'bucket-stub')
  };
}

function normalizeGrant(grant = {}) {
  const principal = normalizePrincipal(grant.principal || grant.userId || grant.actorId);
  if (!principal) return null;
  const accessRaw = String(grant.access || grant.level || 'read').trim().toLowerCase();
  const access = accessRaw === 'write' || accessRaw === 'read-write' || accessRaw === 'rw'
    ? 'read-write'
    : 'read';
  return {
    principal,
    access,
    createdAt: String(grant.createdAt || nowIso())
  };
}

class BucketRegistry {
  constructor(options = {}) {
    this.filePath = path.resolve(
      options.filePath || path.join(process.cwd(), '.psf', 'attachments', 'bucket-registry.json')
    );
    this._loaded = false;
    this._state = {
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      buckets: {}
    };
  }

  async ensureLoaded() {
    if (this._loaded) return;
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fsp.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this._state = {
          version: Number(parsed.version) || 1,
          createdAt: String(parsed.createdAt || nowIso()),
          updatedAt: String(parsed.updatedAt || nowIso()),
          buckets: parsed.buckets && typeof parsed.buckets === 'object' ? parsed.buckets : {}
        };
      }
    } catch (_) {
      await this.save();
    }
    this._loaded = true;
  }

  async save() {
    this._state.updatedAt = nowIso();
    await fsp.writeFile(this.filePath, JSON.stringify(this._state, null, 2), 'utf8');
  }

  _sanitizeBucket(input = {}, { existing = null } = {}) {
    const bucketId = normalizeBucketId(input.id || input.bucketId || existing?.id || '');
    if (!bucketId) throw new Error('bucketId is required');

    const scope = normalizeScope(input.scope || existing?.scope || deriveScopeFromSessionId(input.sessionId));
    const ownerAgentId = String(input.ownerAgentId || existing?.ownerAgentId || '').trim();
    const sessionId = String(
      input.sessionId ||
      existing?.sessionId ||
      defaultSessionIdForScope(scope, { ownerAgentId }) ||
      `bucket-${bucketId}`
    ).trim();
    const ownerPrincipal = normalizePrincipal(input.ownerPrincipal || existing?.ownerPrincipal || 'default');
    const rawGrants = Array.isArray(input.grants) ? input.grants : Array.isArray(existing?.grants) ? existing.grants : [];
    const dedupe = new Map();
    for (const rawGrant of rawGrants) {
      const grant = normalizeGrant(rawGrant);
      if (!grant) continue;
      dedupe.set(grant.principal, grant);
    }
    const grants = Array.from(dedupe.values());

    return {
      id: bucketId,
      label: String(input.label || existing?.label || bucketId),
      scope,
      sessionId,
      ownerPrincipal,
      ownerAgentId: ownerAgentId || null,
      securityLabel: normalizeSecurityLabel(input.securityLabel || existing?.securityLabel || {}),
      sharedGroupIds: Array.isArray(input.sharedGroupIds)
        ? input.sharedGroupIds.map((v) => String(v).trim()).filter(Boolean)
        : Array.isArray(existing?.sharedGroupIds)
          ? existing.sharedGroupIds
          : [],
      grants,
      metadata: input.metadata && typeof input.metadata === 'object'
        ? input.metadata
        : existing?.metadata && typeof existing.metadata === 'object'
          ? existing.metadata
          : {},
      stub: true,
      createdAt: String(existing?.createdAt || nowIso()),
      updatedAt: nowIso()
    };
  }

  async upsertBucket(input = {}) {
    await this.ensureLoaded();
    const bucketId = normalizeBucketId(input.id || input.bucketId || '');
    const existing = bucketId ? this._state.buckets[bucketId] || null : null;
    const bucket = this._sanitizeBucket(input, { existing });
    this._state.buckets[bucket.id] = bucket;
    await this.save();
    return { ...bucket };
  }

  async getBucket(bucketId) {
    await this.ensureLoaded();
    const id = normalizeBucketId(bucketId);
    if (!id) return null;
    const record = this._state.buckets[id];
    return record ? { ...record } : null;
  }

  async listBuckets(options = {}) {
    await this.ensureLoaded();
    const scopeFilter = normalizeScope(options.scope || '');
    const principal = normalizePrincipal(options.principal || options.userId || '');
    const items = Object.values(this._state.buckets || {})
      .filter((bucket) => {
        if (scopeFilter && scopeFilter !== 'global-shared' && options.scope && bucket.scope !== scopeFilter) {
          return false;
        }
        if (!principal) return true;
        return this._hasAccess(bucket, principal, 'read');
      })
      .sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
    return items.map((bucket) => ({ ...bucket }));
  }

  async deleteBucket(bucketId) {
    await this.ensureLoaded();
    const id = normalizeBucketId(bucketId);
    if (!id) return { removed: false };
    if (!this._state.buckets[id]) return { removed: false };
    const removed = this._state.buckets[id];
    delete this._state.buckets[id];
    await this.save();
    return { removed: true, bucket: { ...removed } };
  }

  async grantAccess(options = {}) {
    await this.ensureLoaded();
    const id = normalizeBucketId(options.bucketId || options.id || '');
    const existing = id ? this._state.buckets[id] : null;
    if (!existing) throw new Error(`Bucket not found: ${id || 'unknown'}`);
    const grant = normalizeGrant(options);
    if (!grant) throw new Error('grant principal is required');
    const filtered = (existing.grants || []).filter((item) => item.principal !== grant.principal);
    filtered.push(grant);
    const bucket = this._sanitizeBucket({ ...existing, grants: filtered }, { existing });
    this._state.buckets[id] = bucket;
    await this.save();
    return { ...bucket };
  }

  async revokeAccess(options = {}) {
    await this.ensureLoaded();
    const id = normalizeBucketId(options.bucketId || options.id || '');
    const principal = normalizePrincipal(options.principal || options.userId || '');
    const existing = id ? this._state.buckets[id] : null;
    if (!existing || !principal) return { updated: false, bucket: existing ? { ...existing } : null };
    const filtered = (existing.grants || []).filter((item) => item.principal !== principal);
    const bucket = this._sanitizeBucket({ ...existing, grants: filtered }, { existing });
    this._state.buckets[id] = bucket;
    await this.save();
    return { updated: true, bucket: { ...bucket } };
  }

  _hasAccess(bucket, principal, action = 'read') {
    const normalizedPrincipal = normalizePrincipal(principal);
    if (!normalizedPrincipal) return true; // stub-open until identity hardening is in place

    if (normalizedPrincipal === bucket.ownerPrincipal) return true;
    const grants = Array.isArray(bucket.grants) ? bucket.grants : [];
    if (grants.length === 0) return true; // stub-open default, future RBAC/MAC will tighten

    const needed = String(action || 'read').toLowerCase() === 'write' ? 'read-write' : 'read';
    const grant = grants.find((item) => item.principal === normalizedPrincipal || item.principal === '*');
    if (!grant) return false;
    if (needed === 'read') return true;
    return String(grant.access || 'read') === 'read-write';
  }

  async resolveBucketTarget(options = {}) {
    await this.ensureLoaded();
    const bucketId = normalizeBucketId(options.bucketId || options.id || '');
    if (!bucketId) {
      return { success: false, error: 'bucketId is required' };
    }
    const bucket = this._state.buckets[bucketId];
    if (!bucket) {
      return { success: false, error: `Bucket not found: ${bucketId}` };
    }
    const principal = normalizePrincipal(options.principal || options.userId || options.actorId || '');
    const action = String(options.action || 'read').trim().toLowerCase();
    const needed = action === 'attach' || action === 'attach-text' || action === 'attach-bytes' || action === 'remove' || action === 'clear' || action === 'write'
      ? 'write'
      : 'read';
    if (!this._hasAccess(bucket, principal, needed)) {
      return {
        success: false,
        error: `Access denied to bucket: ${bucketId}`,
        bucket: { ...bucket }
      };
    }
    return {
      success: true,
      bucket: { ...bucket },
      sessionId: String(bucket.sessionId || '').trim(),
      principal: principal || null
    };
  }
}

function createBucketRegistry(options = {}) {
  return new BucketRegistry(options);
}

module.exports = {
  BucketRegistry,
  createBucketRegistry,
  normalizeBucketId,
  normalizePrincipal,
  normalizeScope
};
