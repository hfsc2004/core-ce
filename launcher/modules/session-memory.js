/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Session Memory
 * Shared prompt/command memory for PSF Terminal, Coding Terminal, and MoE/IRG chats.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const fsp = fs.promises;

const MAX_TOTAL_ENTRIES = 12000;

function normalizeText(value, maxLen = 20000) {
  const text = String(value == null ? '' : value);
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function normalizeId(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const safe = raw.replace(/[^a-zA-Z0-9._:@/-]/g, '_').slice(0, 160);
  return safe || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function memoryFilePath(appDir) {
  const root = path.resolve(appDir, '..');
  return path.join(root, '.psf', 'session-memory.json');
}

async function ensureMemoryFile(appDir) {
  const filePath = memoryFilePath(appDir);
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    const init = {
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      entries: []
    };
    await fsp.writeFile(filePath, JSON.stringify(init, null, 2), 'utf8');
  }
  return filePath;
}

async function loadStore(appDir) {
  const filePath = await ensureMemoryFile(appDir);
  const raw = await fsp.readFile(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    parsed = { version: 1, createdAt: nowIso(), updatedAt: nowIso(), entries: [] };
  }
  if (!Array.isArray(parsed.entries)) parsed.entries = [];
  return { filePath, store: parsed };
}

async function saveStore(filePath, store) {
  const payload = {
    version: 1,
    createdAt: store.createdAt || nowIso(),
    updatedAt: nowIso(),
    entries: Array.isArray(store.entries) ? store.entries : []
  };
  await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

async function appendEntry(appDir, entry = {}) {
  const { filePath, store } = await loadStore(appDir);
  const normalized = {
    id: `mem_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: nowIso(),
    surface: normalizeId(entry.surface, 'unknown'),
    sessionId: normalizeId(entry.sessionId, 'default'),
    role: normalizeId(entry.role, 'user'),
    channel: normalizeId(entry.channel, 'chat'),
    content: normalizeText(entry.content || ''),
    meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {}
  };

  store.entries.push(normalized);
  if (store.entries.length > MAX_TOTAL_ENTRIES) {
    store.entries = store.entries.slice(-MAX_TOTAL_ENTRIES);
  }
  await saveStore(filePath, store);
  return normalized;
}

function filterEntries(entries, options = {}) {
  const surface = String(options.surface || '').trim();
  const sessionId = String(options.sessionId || '').trim();
  const role = String(options.role || '').trim();
  const channel = String(options.channel || '').trim();
  const text = String(options.text || '').trim().toLowerCase();
  const fromIso = String(options.from || '').trim();
  const toIso = String(options.to || '').trim();

  const fromMs = fromIso ? Date.parse(fromIso) : null;
  const toMs = toIso ? Date.parse(toIso) : null;

  return entries.filter((item) => {
    if (surface && item.surface !== surface) return false;
    if (sessionId && item.sessionId !== sessionId) return false;
    if (role && item.role !== role) return false;
    if (channel && item.channel !== channel) return false;
    if (text && !String(item.content || '').toLowerCase().includes(text)) return false;
    if (Number.isFinite(fromMs)) {
      const t = Date.parse(item.timestamp || '');
      if (!Number.isFinite(t) || t < fromMs) return false;
    }
    if (Number.isFinite(toMs)) {
      const t = Date.parse(item.timestamp || '');
      if (!Number.isFinite(t) || t > toMs) return false;
    }
    return true;
  });
}

async function listEntries(appDir, options = {}) {
  const { store } = await loadStore(appDir);
  const direction = String(options.direction || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const limit = Math.max(1, Number(options.limit) || 200);
  let rows = filterEntries(store.entries, options);
  rows = rows.sort((a, b) => {
    const ta = Date.parse(a.timestamp || '') || 0;
    const tb = Date.parse(b.timestamp || '') || 0;
    return direction === 'asc' ? ta - tb : tb - ta;
  });
  return rows.slice(0, limit);
}

async function listSessions(appDir, options = {}) {
  const { store } = await loadStore(appDir);
  const surface = String(options.surface || '').trim();
  const groups = new Map();
  for (const item of store.entries) {
    if (surface && item.surface !== surface) continue;
    const key = `${item.surface}::${item.sessionId}`;
    const existing = groups.get(key) || {
      surface: item.surface,
      sessionId: item.sessionId,
      firstTimestamp: item.timestamp,
      lastTimestamp: item.timestamp,
      count: 0
    };
    existing.count += 1;
    if ((Date.parse(item.timestamp) || 0) < (Date.parse(existing.firstTimestamp) || 0)) {
      existing.firstTimestamp = item.timestamp;
    }
    if ((Date.parse(item.timestamp) || 0) > (Date.parse(existing.lastTimestamp) || 0)) {
      existing.lastTimestamp = item.timestamp;
    }
    groups.set(key, existing);
  }
  return Array.from(groups.values()).sort((a, b) => {
    return (Date.parse(b.lastTimestamp) || 0) - (Date.parse(a.lastTimestamp) || 0);
  });
}

async function clearEntries(appDir, options = {}) {
  const { filePath, store } = await loadStore(appDir);
  const before = store.entries.length;
  const surface = String(options.surface || '').trim();
  const sessionId = String(options.sessionId || '').trim();

  if (!surface && !sessionId) {
    store.entries = [];
  } else {
    store.entries = store.entries.filter((item) => {
      if (surface && item.surface !== surface) return true;
      if (sessionId && item.sessionId !== sessionId) return true;
      if (surface && sessionId) {
        return !(item.surface === surface && item.sessionId === sessionId);
      }
      return false;
    });
  }
  await saveStore(filePath, store);
  return {
    removed: before - store.entries.length,
    remaining: store.entries.length
  };
}

module.exports = {
  appendEntry,
  listEntries,
  listSessions,
  clearEntries
};

