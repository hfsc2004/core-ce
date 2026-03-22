/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const path = require('path');

function normalizeTerminalAttachmentSessionId(options = {}) {
  const explicit = String(options.sessionId || '').trim();
  if (explicit) return explicit;
  const port = Number(options.port);
  if (Number.isFinite(port) && port > 0) return `terminal-${port}`;
  return 'terminal-default';
}

function normalizeAttachmentPrincipal(options = {}) {
  const explicit = String(options.principal || '').trim();
  if (explicit) return explicit.toLowerCase();
  const userId = String(options.userId || options.user || options.actorId || '').trim();
  if (userId) return userId.toLowerCase();
  return '';
}

async function resolveTerminalAttachmentTarget(ctx = {}, options = {}, action = 'read') {
  const bucketId = String(options.bucketId || '').trim();
  const principal = normalizeAttachmentPrincipal(options);
  if (bucketId && ctx.bucketRegistry && typeof ctx.bucketRegistry.resolveBucketTarget === 'function') {
    const resolved = await ctx.bucketRegistry.resolveBucketTarget({
      bucketId,
      principal,
      action
    });
    if (!resolved?.success || !String(resolved.sessionId || '').trim()) {
      return {
        ok: false,
        error: String(resolved?.error || 'Failed to resolve bucket target'),
        principal: principal || null,
        bucketId
      };
    }
    return {
      ok: true,
      principal: principal || null,
      bucketId,
      bucket: resolved.bucket || null,
      sessionId: String(resolved.sessionId || '').trim(),
      resolvedBy: 'bucket'
    };
  }

  return {
    ok: true,
    principal: principal || null,
    bucketId: '',
    bucket: null,
    sessionId: normalizeTerminalAttachmentSessionId(options),
    resolvedBy: 'session'
  };
}

async function buildTerminalAttachmentContext(attachmentStore, options = {}) {
  const sessionId = normalizeTerminalAttachmentSessionId(options);
  const maxAttachments = Math.max(1, Number(options.maxAttachments) || 4);
  const maxBytesPerFile = Math.max(1024, Number(options.maxBytesPerFile) || 128 * 1024);
  const maxChars = Math.max(512, Number(options.maxChars) || 24 * 1024);

  const attachments = await attachmentStore.listAttachments(sessionId);
  const selected = attachments
    .filter((item) => item && item.textExtractable)
    .slice(0, maxAttachments);

  const parts = [];
  const included = [];

  for (const item of selected) {
    try {
      const read = await attachmentStore.readAttachmentText({
        sessionId,
        attachmentId: item.id,
        maxBytes: maxBytesPerFile
      });
      const text = String(read.text || '').trim();
      if (!text) continue;
      parts.push(`[Attachment ${item.id}] ${item.displayName}\n${text}`);
      included.push({
        id: item.id,
        displayName: item.displayName,
        truncated: !!read.truncated,
        bytesRead: read.bytesRead,
        totalBytes: read.totalBytes
      });
      if (parts.join('\n\n').length >= maxChars) break;
    } catch (_) {
      // Ignore non-readable files here; list/remove APIs still expose them.
    }
  }

  const contextText = parts.join('\n\n').slice(0, maxChars);
  return {
    sessionId,
    contextText,
    included,
    totalAttachments: attachments.length,
    usedAttachments: included.length
  };
}

function resolveWorkspaceDocPath(appDir, requestedPath) {
  const workspaceRoot = path.resolve(appDir, '..');
  const raw = String(requestedPath || '').trim();
  if (!raw) {
    return { error: 'Document path is required.' };
  }

  const resolved = path.resolve(workspaceRoot, raw);
  const rel = path.relative(workspaceRoot, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { error: 'Access denied for requested path.' };
  }

  return { raw, resolved };
}

module.exports = {
  normalizeTerminalAttachmentSessionId,
  normalizeAttachmentPrincipal,
  resolveTerminalAttachmentTarget,
  buildTerminalAttachmentContext,
  resolveWorkspaceDocPath
};
