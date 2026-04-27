/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const {
  buildTerminalAttachmentContext,
  resolveTerminalAttachmentTarget
} = require('./common');
const bucketSecurity = require('../security-layer/security-buckets');

function resolveActorContext(event = null, payload = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const senderId = Number(event?.sender?.id || 0);
  const senderPrincipal = Number.isFinite(senderId) && senderId > 0 ? `wc-${senderId}` : '';
  return {
    userId: String(senderPrincipal || src.userId || src.user || src.actorId || 'default')
  };
}

function createAttachmentHandlers() {
  async function resolveAndAuthorize(ctx, event, payload, action, source) {
    const actor = resolveActorContext(event, payload);
    const authPayload = {
      ...(payload && typeof payload === 'object' ? payload : {}),
      principal: actor.userId
    };
    const target = await resolveTerminalAttachmentTarget(ctx, authPayload, action);
    if (!target.ok) {
      return { success: false, error: target.error, sessionId: '', bucketId: String(payload?.bucketId || '').trim() };
    }
    const auth = await bucketSecurity.authorizeBucketAction({
      action,
      sessionId: target.sessionId,
      actor,
      details: {
        source,
        resolvedBy: target.resolvedBy,
        bucketId: target.bucketId || null,
        principal: actor.userId || null
      }
    });
    return { success: true, target, auth, actor };
  }

  async function authorizeBucketManage(ctx, bucketId, actor, action = 'read') {
    if (!ctx.bucketRegistry || typeof ctx.bucketRegistry.resolveBucketTarget !== 'function') {
      return { success: false, error: 'Bucket registry unavailable' };
    }
    const resolved = await ctx.bucketRegistry.resolveBucketTarget({
      bucketId,
      principal: String(actor?.userId || ''),
      action
    });
    if (!resolved?.success) {
      return { success: false, error: 'Permission denied', bucket: resolved?.bucket || null };
    }
    return { success: true, bucket: resolved.bucket };
  }

  return {
    'terminal:attachments-list': async (ctx, event, options = {}) => {
      const prepared = await resolveAndAuthorize(ctx, event, options, 'list', 'terminal:attachments-list');
      if (!prepared.success) return prepared;
      const { target, auth } = prepared;
      const sessionId = target.sessionId;
      if (!auth.allowed) return { success: false, error: 'Permission denied', sessionId, security: auth };
      const attachments = await ctx.attachmentStore.listAttachments(sessionId);
      return {
        success: true,
        sessionId,
        bucketId: target.bucketId || null,
        resolvedBy: target.resolvedBy,
        attachments,
        security: auth
      };
    },

    'terminal:attachments-attach-file': async (ctx, event, payload = {}) => {
      const prepared = await resolveAndAuthorize(ctx, event, payload, 'attach', 'terminal:attachments-attach-file');
      if (!prepared.success) return prepared;
      const { target, auth } = prepared;
      const sessionId = target.sessionId;
      if (!auth.allowed) return { success: false, error: 'Permission denied', sessionId, security: auth };
      const record = await ctx.attachmentStore.attachFile({
        sessionId,
        sourcePath: payload.sourcePath,
        displayName: payload.displayName,
        mimeType: payload.mimeType
      });
      return { success: true, sessionId, bucketId: target.bucketId || null, resolvedBy: target.resolvedBy, attachment: record, security: auth };
    },

    'terminal:attachments-attach-text': async (ctx, event, payload = {}) => {
      const prepared = await resolveAndAuthorize(ctx, event, payload, 'attach-text', 'terminal:attachments-attach-text');
      if (!prepared.success) return prepared;
      const { target, auth } = prepared;
      const sessionId = target.sessionId;
      if (!auth.allowed) return { success: false, error: 'Permission denied', sessionId, security: auth };
      const record = await ctx.attachmentStore.attachText({
        sessionId,
        text: payload.text,
        displayName: payload.displayName,
        mimeType: payload.mimeType
      });
      return { success: true, sessionId, bucketId: target.bucketId || null, resolvedBy: target.resolvedBy, attachment: record, security: auth };
    },

    'terminal:attachments-attach-bytes': async (ctx, event, payload = {}) => {
      const prepared = await resolveAndAuthorize(ctx, event, payload, 'attach-bytes', 'terminal:attachments-attach-bytes');
      if (!prepared.success) return prepared;
      const { target, auth } = prepared;
      const sessionId = target.sessionId;
      if (!auth.allowed) return { success: false, error: 'Permission denied', sessionId, security: auth };
      const record = await ctx.attachmentStore.attachBytes({
        sessionId,
        bytes: payload.bytes,
        displayName: payload.displayName,
        mimeType: payload.mimeType
      });
      return { success: true, sessionId, bucketId: target.bucketId || null, resolvedBy: target.resolvedBy, attachment: record, security: auth };
    },

    'terminal:attachments-remove': async (ctx, event, payload = {}) => {
      const prepared = await resolveAndAuthorize(ctx, event, payload, 'remove', 'terminal:attachments-remove');
      if (!prepared.success) return prepared;
      const { target, auth } = prepared;
      const sessionId = target.sessionId;
      if (!auth.allowed) return { success: false, error: 'Permission denied', sessionId, security: auth };
      const result = await ctx.attachmentStore.removeAttachment({
        sessionId,
        attachmentId: payload.attachmentId,
        deleteFile: payload.deleteFile !== false
      });
      return { success: true, sessionId, bucketId: target.bucketId || null, resolvedBy: target.resolvedBy, ...result, security: auth };
    },

    'terminal:attachments-clear': async (ctx, event, options = {}) => {
      const prepared = await resolveAndAuthorize(ctx, event, options, 'clear', 'terminal:attachments-clear');
      if (!prepared.success) return prepared;
      const { target, auth } = prepared;
      const sessionId = target.sessionId;
      if (!auth.allowed) return { success: false, error: 'Permission denied', sessionId, security: auth };
      const result = await ctx.attachmentStore.deleteSession(sessionId);
      return { success: true, sessionId, bucketId: target.bucketId || null, resolvedBy: target.resolvedBy, ...result, security: auth };
    },

    'terminal:attachments-build-context': async (ctx, event, options = {}) => {
      const prepared = await resolveAndAuthorize(ctx, event, options, 'build-context', 'terminal:attachments-build-context');
      if (!prepared.success) return prepared;
      const { target, auth } = prepared;
      const sessionId = target.sessionId;
      if (!auth.allowed) return { success: false, error: 'Permission denied', sessionId, security: auth };
      const result = await buildTerminalAttachmentContext(ctx.attachmentStore, { ...options, sessionId });
      return { success: true, ...result, bucketId: target.bucketId || null, resolvedBy: target.resolvedBy, security: auth };
    },

    'terminal:attachments-read-text': async (ctx, event, payload = {}) => {
      const prepared = await resolveAndAuthorize(ctx, event, payload, 'read', 'terminal:attachments-read-text');
      if (!prepared.success) return prepared;
      const { target, auth } = prepared;
      const sessionId = target.sessionId;
      if (!auth.allowed) return { success: false, error: 'Permission denied', sessionId, security: auth };
      const attachmentId = String(payload.attachmentId || '').trim();
      if (!attachmentId) {
        return { success: false, error: 'attachmentId is required' };
      }
      const maxBytes = Math.max(1024, Number(payload.maxBytes) || 512 * 1024);
      const offset = Math.max(0, Number(payload.offset) || 0);
      const length = Math.max(0, Number(payload.length) || 0);
      const read = await ctx.attachmentStore.readAttachmentText({
        sessionId,
        attachmentId,
        maxBytes
      });
      const full = String(read.text || '');
      const sliced = length > 0 ? full.slice(offset, offset + length) : full.slice(offset);
      return {
        success: true,
        sessionId,
        bucketId: target.bucketId || null,
        resolvedBy: target.resolvedBy,
        attachmentId,
        text: sliced,
        textLength: sliced.length,
        fullLength: full.length,
        truncated: !!read.truncated,
        bytesRead: read.bytesRead,
        totalBytes: read.totalBytes,
        attachment: read.attachment || null,
        security: auth
      };
    },

    'terminal:attachments-read-bytes': async (ctx, event, payload = {}) => {
      const prepared = await resolveAndAuthorize(ctx, event, payload, 'read-bytes', 'terminal:attachments-read-bytes');
      if (!prepared.success) return prepared;
      const { target, auth } = prepared;
      const sessionId = target.sessionId;
      if (!auth.allowed) return { success: false, error: 'Permission denied', sessionId, security: auth };
      const attachmentId = String(payload.attachmentId || '').trim();
      if (!attachmentId) {
        return { success: false, error: 'attachmentId is required' };
      }
      const maxBytes = Math.max(1024, Number(payload.maxBytes) || 8 * 1024 * 1024);
      const read = await ctx.attachmentStore.readAttachmentBytes({
        sessionId,
        attachmentId,
        maxBytes
      });
      return {
        success: true,
        sessionId,
        bucketId: target.bucketId || null,
        resolvedBy: target.resolvedBy,
        attachmentId,
        bytesBase64: read.bytesBase64 || '',
        bytesLength: Number(read.bytesRead) || 0,
        totalBytes: Number(read.totalBytes) || 0,
        truncated: !!read.truncated,
        attachment: read.attachment || null,
        security: auth
      };
    },

    'terminal:buckets-list': async (ctx, event, options = {}) => {
      if (!ctx.bucketRegistry || typeof ctx.bucketRegistry.listBuckets !== 'function') {
        return { success: false, error: 'Bucket registry unavailable' };
      }
      const actor = resolveActorContext(event, options);
      const principal = String(actor.userId || '').trim();
      const buckets = await ctx.bucketRegistry.listBuckets({
        principal,
        scope: options.scope
      });
      return { success: true, buckets };
    },

    'terminal:buckets-create': async (ctx, event, payload = {}) => {
      if (!ctx.bucketRegistry || typeof ctx.bucketRegistry.upsertBucket !== 'function') {
        return { success: false, error: 'Bucket registry unavailable' };
      }
      const actor = resolveActorContext(event, payload);
      const ownerPrincipal = String(actor.userId || '').trim() || 'default';
      const bucket = await ctx.bucketRegistry.upsertBucket({
        id: payload.bucketId || payload.id,
        label: payload.label,
        scope: payload.scope,
        sessionId: payload.sessionId,
        ownerPrincipal,
        ownerAgentId: payload.ownerAgentId,
        grants: payload.grants,
        sharedGroupIds: payload.sharedGroupIds,
        securityLabel: payload.securityLabel,
        metadata: payload.metadata
      });
      return { success: true, bucket };
    },

    'terminal:buckets-delete': async (ctx, event, payload = {}) => {
      if (!ctx.bucketRegistry || typeof ctx.bucketRegistry.deleteBucket !== 'function') {
        return { success: false, error: 'Bucket registry unavailable' };
      }
      const actor = resolveActorContext(event, payload);
      const bucketId = payload.bucketId || payload.id;
      const manage = await authorizeBucketManage(ctx, bucketId, actor, 'write');
      if (!manage.success) return { success: false, error: manage.error, bucket: manage.bucket || null };
      const result = await ctx.bucketRegistry.deleteBucket(payload.bucketId || payload.id);
      return { success: true, ...result };
    },

    'terminal:buckets-grant': async (ctx, event, payload = {}) => {
      if (!ctx.bucketRegistry || typeof ctx.bucketRegistry.grantAccess !== 'function') {
        return { success: false, error: 'Bucket registry unavailable' };
      }
      const actor = resolveActorContext(event, payload);
      const bucketId = payload.bucketId || payload.id;
      const manage = await authorizeBucketManage(ctx, bucketId, actor, 'write');
      if (!manage.success) return { success: false, error: manage.error, bucket: manage.bucket || null };
      const bucket = await ctx.bucketRegistry.grantAccess({
        bucketId,
        principal: payload.principal || payload.userId || payload.actorId,
        access: payload.access
      });
      return { success: true, bucket };
    },

    'terminal:buckets-revoke': async (ctx, event, payload = {}) => {
      if (!ctx.bucketRegistry || typeof ctx.bucketRegistry.revokeAccess !== 'function') {
        return { success: false, error: 'Bucket registry unavailable' };
      }
      const actor = resolveActorContext(event, payload);
      const bucketId = payload.bucketId || payload.id;
      const manage = await authorizeBucketManage(ctx, bucketId, actor, 'write');
      if (!manage.success) return { success: false, error: manage.error, bucket: manage.bucket || null };
      const result = await ctx.bucketRegistry.revokeAccess({
        bucketId,
        principal: payload.principal || payload.userId || payload.actorId
      });
      return { success: true, ...result };
    }
  };
}

module.exports = { createAttachmentHandlers };
