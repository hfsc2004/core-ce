/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Attachment Store
 * Reusable disk-backed attachment storage for terminal-style workflows.
 *
 * Data layout:
 *   <baseDir>/<sessionId>/manifest.json
 *   <baseDir>/<sessionId>/files/<attachment-file>
 */

const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const {
  OFFICE_EXTENSIONS,
  defaultBaseDir,
  nowIso,
  sanitizeSegment,
  generateId,
  sha256Buffer,
  isTextExtractable,
  chunkTextDeterministic
} = require('./attachment-store-utils');

const {
  extractPdfText,
  extractEpubText,
  extractOfficeText
} = require('./attachment-store-extractors');

async function exists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

class AttachmentStore {
  constructor(options = {}) {
    this.baseDir = path.resolve(options.baseDir || defaultBaseDir());
  }

  sessionDir(sessionId) {
    return path.join(this.baseDir, sanitizeSegment(sessionId, 'session'));
  }

  filesDir(sessionId) {
    return path.join(this.sessionDir(sessionId), 'files');
  }

  manifestPath(sessionId) {
    return path.join(this.sessionDir(sessionId), 'manifest.json');
  }

  async ensureSession(sessionId) {
    const sid = sanitizeSegment(sessionId, 'session');
    await ensureDir(this.filesDir(sid));
    const manifestPath = this.manifestPath(sid);
    if (!(await exists(manifestPath))) {
      const manifest = {
        version: 1,
        sessionId: sid,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        attachments: []
      };
      await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    }
    return sid;
  }

  async loadManifest(sessionId) {
    const sid = await this.ensureSession(sessionId);
    const manifestPath = this.manifestPath(sid);
    const raw = await fsp.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.attachments)) parsed.attachments = [];
    return parsed;
  }

  async saveManifest(sessionId, manifest) {
    const sid = sanitizeSegment(sessionId, 'session');
    const payload = {
      version: 1,
      sessionId: sid,
      createdAt: manifest.createdAt || nowIso(),
      updatedAt: nowIso(),
      attachments: Array.isArray(manifest.attachments) ? manifest.attachments : []
    };
    await fsp.writeFile(this.manifestPath(sid), JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  }

  async listAttachments(sessionId) {
    const manifest = await this.loadManifest(sessionId);
    return manifest.attachments.slice();
  }

  async attachFile(options = {}) {
    const sessionId = sanitizeSegment(options.sessionId, 'session');
    const sourcePath = path.resolve(String(options.sourcePath || ''));
    if (!sourcePath) throw new Error('attachFile requires sourcePath');
    if (!(await exists(sourcePath))) throw new Error(`Source file not found: ${sourcePath}`);

    await this.ensureSession(sessionId);
    const manifest = await this.loadManifest(sessionId);

    const sourceName = path.basename(sourcePath);
    const displayName = String(options.displayName || sourceName);
    const attachmentId = generateId('file');
    const safeName = sanitizeSegment(displayName, sourceName);
    const storedName = `${attachmentId}__${safeName}`;
    const destinationPath = path.join(this.filesDir(sessionId), storedName);

    const data = await fsp.readFile(sourcePath);
    const sha256 = sha256Buffer(data);
    const duplicate = manifest.attachments.find((item) => String(item.sha256 || '') === sha256);
    if (duplicate) {
      return { ...duplicate, duplicate: true };
    }

    await fsp.writeFile(destinationPath, data);
    const stats = await fsp.stat(destinationPath);

    const record = {
      id: attachmentId,
      kind: 'file',
      displayName,
      originalName: sourceName,
      storedName,
      relativePath: path.join(sessionId, 'files', storedName),
      absolutePath: destinationPath,
      sourcePath,
      mimeType: String(options.mimeType || ''),
      sizeBytes: stats.size,
      sha256,
      textExtractable: isTextExtractable(displayName),
      createdAt: nowIso()
    };

    manifest.attachments.push(record);
    await this.saveManifest(sessionId, manifest);
    return record;
  }

  async attachText(options = {}) {
    const sessionId = sanitizeSegment(options.sessionId, 'session');
    const text = String(options.text || '');
    const displayName = String(options.displayName || 'note.txt');
    const mimeType = String(options.mimeType || 'text/plain');
    await this.ensureSession(sessionId);
    const manifest = await this.loadManifest(sessionId);

    const attachmentId = generateId('text');
    const safeName = sanitizeSegment(displayName, 'note.txt');
    const storedName = `${attachmentId}__${safeName}`;
    const destinationPath = path.join(this.filesDir(sessionId), storedName);
    const data = Buffer.from(text, 'utf8');
    const sha256 = sha256Buffer(data);
    const duplicate = manifest.attachments.find((item) => String(item.sha256 || '') === sha256);
    if (duplicate) {
      return { ...duplicate, duplicate: true };
    }
    await fsp.writeFile(destinationPath, data);

    const record = {
      id: attachmentId,
      kind: 'text',
      displayName,
      originalName: displayName,
      storedName,
      relativePath: path.join(sessionId, 'files', storedName),
      absolutePath: destinationPath,
      sourcePath: null,
      mimeType,
      sizeBytes: data.length,
      sha256,
      textExtractable: true,
      createdAt: nowIso()
    };

    manifest.attachments.push(record);
    await this.saveManifest(sessionId, manifest);
    return record;
  }

  async attachBytes(options = {}) {
    const sessionId = sanitizeSegment(options.sessionId, 'session');
    const displayName = String(options.displayName || 'attachment.bin');
    const mimeType = String(options.mimeType || 'application/octet-stream');
    const bytes = options.bytes;
    if (!bytes) throw new Error('attachBytes requires bytes');

    let data;
    if (Buffer.isBuffer(bytes)) {
      data = bytes;
    } else if (bytes instanceof Uint8Array) {
      data = Buffer.from(bytes);
    } else if (typeof bytes === 'string') {
      data = Buffer.from(bytes, 'base64');
    } else if (Array.isArray(bytes)) {
      data = Buffer.from(bytes);
    } else {
      throw new Error('attachBytes bytes must be Buffer, Uint8Array, base64 string, or byte array');
    }

    await this.ensureSession(sessionId);
    const manifest = await this.loadManifest(sessionId);

    const attachmentId = generateId('file');
    const safeName = sanitizeSegment(displayName, 'attachment.bin');
    const storedName = `${attachmentId}__${safeName}`;
    const destinationPath = path.join(this.filesDir(sessionId), storedName);
    const sha256 = sha256Buffer(data);
    const duplicate = manifest.attachments.find((item) => String(item.sha256 || '') === sha256);
    if (duplicate) {
      return { ...duplicate, duplicate: true };
    }
    await fsp.writeFile(destinationPath, data);

    const record = {
      id: attachmentId,
      kind: 'file',
      displayName,
      originalName: displayName,
      storedName,
      relativePath: path.join(sessionId, 'files', storedName),
      absolutePath: destinationPath,
      sourcePath: null,
      mimeType,
      sizeBytes: data.length,
      sha256,
      textExtractable: isTextExtractable(displayName),
      createdAt: nowIso()
    };

    manifest.attachments.push(record);
    await this.saveManifest(sessionId, manifest);
    return record;
  }

  async getAttachment(sessionId, attachmentId) {
    const items = await this.listAttachments(sessionId);
    return items.find((item) => String(item.id) === String(attachmentId)) || null;
  }

  async readAttachmentText(options = {}) {
    const sessionId = sanitizeSegment(options.sessionId, 'session');
    const attachmentId = String(options.attachmentId || '');
    const encoding = String(options.encoding || 'utf8');
    const maxBytes = Math.max(1024, Number(options.maxBytes) || 5 * 1024 * 1024);

    const record = await this.getAttachment(sessionId, attachmentId);
    if (!record) throw new Error(`Attachment not found: ${attachmentId}`);
    if (!record.textExtractable) {
      throw new Error(`Attachment is not text extractable: ${record.displayName}`);
    }

    const filePath = record.absolutePath || path.join(this.baseDir, record.relativePath || '');
    const ext = path.extname(String(record.displayName || record.originalName || filePath)).toLowerCase();
    let data;

    if (ext === '.pdf') {
      const text = await extractPdfText(filePath, fsp);
      data = Buffer.from(String(text || ''), 'utf8');
    } else if (ext === '.epub') {
      const text = await extractEpubText(filePath);
      data = Buffer.from(String(text || ''), 'utf8');
    } else if (OFFICE_EXTENSIONS.has(ext)) {
      const text = await extractOfficeText(filePath, ext);
      data = Buffer.from(String(text || ''), 'utf8');
    } else {
      data = await fsp.readFile(filePath);
    }

    const sliced = data.length > maxBytes ? data.slice(0, maxBytes) : data;
    return {
      text: sliced.toString(encoding),
      truncated: data.length > maxBytes,
      bytesRead: sliced.length,
      totalBytes: data.length,
      attachment: record
    };
  }

  async chunkAttachmentText(options = {}) {
    const read = await this.readAttachmentText(options);
    const chunks = chunkTextDeterministic(read.text, options);
    return {
      attachment: read.attachment,
      truncated: read.truncated,
      bytesRead: read.bytesRead,
      totalBytes: read.totalBytes,
      chunks
    };
  }

  async readAttachmentBytes(options = {}) {
    const sessionId = sanitizeSegment(options.sessionId, 'session');
    const attachmentId = String(options.attachmentId || '');
    const maxBytes = Math.max(1024, Number(options.maxBytes) || 8 * 1024 * 1024);

    const record = await this.getAttachment(sessionId, attachmentId);
    if (!record) throw new Error(`Attachment not found: ${attachmentId}`);

    const filePath = record.absolutePath || path.join(this.baseDir, record.relativePath || '');
    const data = await fsp.readFile(filePath);
    const sliced = data.length > maxBytes ? data.slice(0, maxBytes) : data;
    return {
      bytesBase64: sliced.toString('base64'),
      truncated: data.length > maxBytes,
      bytesRead: sliced.length,
      totalBytes: data.length,
      attachment: record
    };
  }

  async removeAttachment(options = {}) {
    const sessionId = sanitizeSegment(options.sessionId, 'session');
    const attachmentId = String(options.attachmentId || '');
    const deleteFile = options.deleteFile !== false;
    const manifest = await this.loadManifest(sessionId);
    const idx = manifest.attachments.findIndex((item) => String(item.id) === attachmentId);
    if (idx < 0) return { removed: false };

    const record = manifest.attachments[idx];
    manifest.attachments.splice(idx, 1);
    await this.saveManifest(sessionId, manifest);

    if (deleteFile) {
      const filePath = record.absolutePath || path.join(this.baseDir, record.relativePath || '');
      try {
        await fsp.unlink(filePath);
      } catch (_) {
        // Ignore unlink errors to keep manifest authoritative.
      }
    }

    return { removed: true, attachment: record };
  }

  async deleteSession(sessionId) {
    const sid = sanitizeSegment(sessionId, 'session');
    const dir = this.sessionDir(sid);
    if (!(await exists(dir))) return { removed: false };
    await fsp.rm(dir, { recursive: true, force: true });
    return { removed: true };
  }
}

function createAttachmentStore(options = {}) {
  return new AttachmentStore(options);
}

module.exports = {
  AttachmentStore,
  createAttachmentStore,
  chunkTextDeterministic,
  isTextExtractable,
  sanitizeSegment
};
