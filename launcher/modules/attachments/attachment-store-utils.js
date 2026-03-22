/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const crypto = require('crypto');
const path = require('path');

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv', '.yaml', '.yml',
  '.xml', '.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go',
  '.rs', '.c', '.h', '.cpp', '.hpp', '.cs', '.sh', '.bash', '.zsh', '.ps1',
  '.ini', '.cfg', '.conf', '.log', '.sql', '.toml'
]);

const OFFICE_EXTENSIONS = new Set([
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp', '.odg', '.odf'
]);

function defaultBaseDir() {
  return path.join(__dirname, '..', '..', '.psf', 'attachments');
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeSegment(value, fallback = 'item') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return cleaned || fallback;
}

function generateId(prefix = 'att') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isTextExtractable(fileName = '') {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || ext === '.pdf' || ext === '.epub' || OFFICE_EXTENSIONS.has(ext);
}

function chunkTextDeterministic(text, options = {}) {
  const chunkChars = Math.max(128, Number(options.chunkChars) || 1200);
  const overlapChars = Math.max(0, Math.min(chunkChars - 1, Number(options.overlapChars) || 200));
  const maxChunks = Math.max(1, Number(options.maxChunks) || 500);

  const source = String(text || '');
  if (!source) return [];

  const lines = source.split('\n');
  const chunks = [];
  let chunkText = '';
  let startLine = 0;

  function flush(endLine) {
    const payload = chunkText.trim();
    if (!payload) return;
    chunks.push({
      index: chunks.length,
      text: payload,
      startLine,
      endLine
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const nextLine = lines[i];
    const candidate = chunkText.length ? `${chunkText}\n${nextLine}` : nextLine;
    if (candidate.length > chunkChars && chunkText.length > 0) {
      flush(i - 1);
      if (chunks.length >= maxChunks) return chunks;
      const overlapTail = overlapChars > 0 ? chunkText.slice(-overlapChars) : '';
      chunkText = overlapTail ? `${overlapTail}\n${nextLine}` : nextLine;
      startLine = overlapTail ? Math.max(0, i - 1) : i;
    } else {
      chunkText = candidate;
    }
  }

  flush(lines.length - 1);
  return chunks.slice(0, maxChunks);
}

module.exports = {
  OFFICE_EXTENSIONS,
  defaultBaseDir,
  nowIso,
  sanitizeSegment,
  generateId,
  sha256Buffer,
  isTextExtractable,
  chunkTextDeterministic
};
