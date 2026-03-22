/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
(function() {
  'use strict';

  function createAttachmentController(deps) {
    const getSessionId = typeof deps?.getSessionId === 'function' ? deps.getSessionId : () => 'terminal-default';
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const addSystemImagePreview = typeof deps?.addSystemImagePreview === 'function' ? deps.addSystemImagePreview : (() => {});
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});
    const escapeHtml = typeof deps?.escapeHtml === 'function' ? deps.escapeHtml : ((v) => String(v || ''));
    const formatBytes = typeof deps?.formatBytes === 'function' ? deps.formatBytes : ((v) => `${v || 0} B`);
    let activeBucketId = '';
    let bucketLoaded = false;

    function normalizeBucketId(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }

    function bucketStorageKey() {
      return `psf.terminal.bucket.${String(getSessionId() || 'terminal-default')}`;
    }

    function ensureBucketLoaded() {
      if (bucketLoaded) return;
      bucketLoaded = true;
      try {
        const raw = window.localStorage?.getItem?.(bucketStorageKey()) || '';
        activeBucketId = normalizeBucketId(raw);
      } catch (_) {
        activeBucketId = '';
      }
    }

    function getAttachmentTarget() {
      ensureBucketLoaded();
      if (activeBucketId) {
        return { bucketId: activeBucketId, userId: 'terminal-user' };
      }
      return { sessionId: getSessionId() };
    }

    function getAttachmentBucketId() {
      ensureBucketLoaded();
      return activeBucketId;
    }

    function setAttachmentBucketId(bucketId) {
      ensureBucketLoaded();
      activeBucketId = normalizeBucketId(bucketId);
      try {
        if (activeBucketId) {
          window.localStorage?.setItem?.(bucketStorageKey(), activeBucketId);
        } else {
          window.localStorage?.removeItem?.(bucketStorageKey());
        }
      } catch (_) {
        // Ignore storage failures.
      }
      return activeBucketId;
    }

    function normalizeAttachmentArg(raw) {
      const text = String(raw || '').trim();
      if (!text) return '';
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        return text.slice(1, -1).trim();
      }
      return text;
    }

    function inferMimeFromName(name) {
      const lower = String(name || '').toLowerCase();
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
      if (lower.endsWith('.png')) return 'image/png';
      if (lower.endsWith('.gif')) return 'image/gif';
      if (lower.endsWith('.webp')) return 'image/webp';
      if (lower.endsWith('.bmp')) return 'image/bmp';
      if (lower.endsWith('.svg')) return 'image/svg+xml';
      if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
      return '';
    }

    function isImageAttachment(attachment = {}) {
      const mime = String(attachment.mimeType || '').toLowerCase();
      const name = String(attachment.displayName || attachment.originalName || '');
      return mime.startsWith('image/') || !!inferMimeFromName(name);
    }

    async function maybeShowImagePreview(attachment = {}) {
      if (!attachment || !attachment.id || !isImageAttachment(attachment)) return;
      const api = getElectronAPI();
      if (!api || typeof api.terminalAttachmentsReadBytes !== 'function') return;
      try {
        const read = await api.terminalAttachmentsReadBytes({
          ...getAttachmentTarget(),
          attachmentId: attachment.id,
          maxBytes: 3 * 1024 * 1024
        });
        if (!read || read.success === false || !read.bytesBase64 || read.truncated) return;

        const mime = String(attachment.mimeType || inferMimeFromName(attachment.displayName) || 'image/jpeg');
        addSystemImagePreview({
          title: attachment.displayName || attachment.originalName || attachment.id,
          dataUrl: `data:${mime};base64,${read.bytesBase64}`,
          sizeBytes: Number(attachment.sizeBytes) || 0,
          attachmentId: attachment.id
        });
      } catch (_) {
        // Non-fatal: attachment stays added even if preview cannot be generated.
      }
    }

    async function attachFile(rawPath) {
      const sourcePath = normalizeAttachmentArg(rawPath);
      if (!sourcePath) {
        addSystemMessage('Usage: /attach <file-path>');
        return;
      }
      const api = getElectronAPI();
      if (!api || typeof api.terminalAttachmentsAttachFile !== 'function') {
        addErrorMessage('Attachment APIs are not available in this build.');
        return;
      }
      try {
        await attachFilePath(sourcePath);
      } catch (err) {
        addErrorMessage(`Attach failed: ${err.message || err}`);
      }
    }

    async function attachFilePath(sourcePath) {
      const api = getElectronAPI();
      try {
        const result = await api.terminalAttachmentsAttachFile({
          ...getAttachmentTarget(),
          sourcePath
        });
        if (!result || result.success === false) {
          addErrorMessage(`Attach failed: ${result?.error || result?.message || 'unknown error'}`);
          return;
        }
        const att = result.attachment || {};
        if (att.duplicate) {
          addSystemMessage(`ℹ️ Already attached: ${att.displayName || sourcePath} (id=${att.id || '?'})`);
        } else {
          addSystemMessage(`📎 Attached: ${att.displayName || sourcePath} (id=${att.id || '?'})`);
          await maybeShowImagePreview(att);
        }
      } catch (err) {
        addErrorMessage(`Attach failed: ${err.message || err}`);
      }
    }

    async function attachTextContent(displayName, text, mimeType = 'text/plain') {
      const api = getElectronAPI();
      if (!api || typeof api.terminalAttachmentsAttachText !== 'function') {
        addErrorMessage('Text attachment API is not available in this build.');
        return;
      }
      try {
        const result = await api.terminalAttachmentsAttachText({
          ...getAttachmentTarget(),
          displayName,
          text,
          mimeType
        });
        if (!result || result.success === false) {
          addErrorMessage(`Attach failed: ${result?.error || result?.message || 'unknown error'}`);
          return;
        }
        const att = result.attachment || {};
        if (att.duplicate) {
          addSystemMessage(`ℹ️ Already attached: ${att.displayName || displayName} (id=${att.id || '?'})`);
        } else {
          addSystemMessage(`📎 Attached (drop-text): ${att.displayName || displayName} (id=${att.id || '?'})`);
        }
      } catch (err) {
        addErrorMessage(`Attach failed: ${err.message || err}`);
      }
    }

    async function attachBinaryContent(displayName, bytesBase64, mimeType = 'application/octet-stream') {
      const api = getElectronAPI();
      if (!api || typeof api.terminalAttachmentsAttachBytes !== 'function') {
        addErrorMessage('Binary attachment API is not available in this build.');
        return;
      }
      try {
        const result = await api.terminalAttachmentsAttachBytes({
          ...getAttachmentTarget(),
          displayName,
          bytes: bytesBase64,
          mimeType
        });
        if (!result || result.success === false) {
          addErrorMessage(`Attach failed: ${result?.error || result?.message || 'unknown error'}`);
          return;
        }
        const att = result.attachment || {};
        if (att.duplicate) {
          addSystemMessage(`ℹ️ Already attached: ${att.displayName || displayName} (id=${att.id || '?'})`);
        } else {
          addSystemMessage(`📎 Attached (drop-binary): ${att.displayName || displayName} (id=${att.id || '?'})`);
          await maybeShowImagePreview(att);
        }
      } catch (err) {
        addErrorMessage(`Attach failed: ${err.message || err}`);
      }
    }

    async function listAttachments() {
      const api = getElectronAPI();
      if (!api || typeof api.terminalAttachmentsList !== 'function') {
        addErrorMessage('Attachment APIs are not available in this build.');
        return;
      }
      await openAttachmentManager();
    }

    async function detachAttachment(rawId) {
      const attachmentId = normalizeAttachmentArg(rawId);
      if (!attachmentId) {
        addSystemMessage('Usage: /detach <attachment-id>');
        return;
      }
      const api = getElectronAPI();
      if (!api || typeof api.terminalAttachmentsRemove !== 'function') {
        addErrorMessage('Attachment APIs are not available in this build.');
        return;
      }
      try {
        const result = await api.terminalAttachmentsRemove({
          ...getAttachmentTarget(),
          attachmentId
        });
        if (!result || result.success === false || result.removed === false) {
          addErrorMessage(`Detach failed: ${result?.error || result?.message || 'not found'}`);
          return;
        }
        addSystemMessage(`Removed attachment: ${attachmentId}`);
      } catch (err) {
        addErrorMessage(`Detach failed: ${err.message || err}`);
      }
    }

    async function clearAttachments() {
      const api = getElectronAPI();
      if (!api || typeof api.terminalAttachmentsClear !== 'function') {
        addErrorMessage('Attachment APIs are not available in this build.');
        return;
      }
      try {
        const result = await api.terminalAttachmentsClear({
          ...getAttachmentTarget()
        });
        if (!result || result.success === false) {
          addErrorMessage(`Clear attachments failed: ${result?.error || result?.message || 'unknown error'}`);
          return;
        }
        addSystemMessage('🧹 Cleared all attachments for this terminal session.');
      } catch (err) {
        addErrorMessage(`Clear attachments failed: ${err.message || err}`);
      }
    }

    const dndController = window.TerminalAttachmentDnD?.createDragDropController({
      getSessionId,
      getElectronAPI,
      addSystemMessage,
      attachFilePath,
      attachTextContent,
      attachBinaryContent
    }) || null;

    const attachmentManager = window.TerminalAttachmentManager?.createAttachmentManager({
      getSessionId,
      getElectronAPI,
      addSystemMessage,
      addErrorMessage,
      escapeHtml,
      formatBytes,
      clearAttachments,
      getAttachmentTarget,
      getAttachmentBucketId,
      setAttachmentBucketId,
      normalizeBucketId
    }) || null;

    const ensureDragOverlay = () => dndController?.ensureDragOverlay?.();
    const showDragOverlay = () => dndController?.showDragOverlay?.();
    const hideDragOverlay = (force) => dndController?.hideDragOverlay?.(force);
    const installDragAndDropAttach = () => dndController?.installDragAndDropAttach?.();
    const closeAttachmentManager = () => attachmentManager?.closeAttachmentManager?.();
    const openAttachmentManager = () => attachmentManager?.openAttachmentManager?.();

    async function buildAttachmentContext() {
      const api = getElectronAPI();
      if (!api || typeof api.terminalAttachmentsBuildContext !== 'function') {
        return '';
      }
      try {
        const result = await api.terminalAttachmentsBuildContext({
          ...getAttachmentTarget(),
          maxAttachments: 4,
          maxBytesPerFile: 128 * 1024,
          maxChars: 24 * 1024
        });
        if (!result || result.success === false) return '';
        return String(result.contextText || '');
      } catch (_) {
        return '';
      }
    }

    return {
      normalizeAttachmentArg,
      attachFile,
      attachFilePath,
      attachTextContent,
      attachBinaryContent,
      ensureDragOverlay,
      showDragOverlay,
      hideDragOverlay,
      installDragAndDropAttach,
      listAttachments,
      detachAttachment,
      clearAttachments,
      closeAttachmentManager,
      openAttachmentManager,
      buildAttachmentContext,
      getAttachmentTarget,
      getAttachmentBucketId,
      setAttachmentBucketId
    };
  }

  window.TerminalAttachments = {
    createAttachmentController
  };
})();
