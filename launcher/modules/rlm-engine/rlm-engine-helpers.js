/**
 * RLM engine helper utilities.
 */

async function buildAttachmentScopes({
  baseAttachments = [],
  baseSessionId = 'terminal-default',
  includeShared = false,
  sharedSessionId = '',
  attachmentStore
}) {
  const withSession = (list, sid) => list.map((item) => ({ ...item, __sessionId: sid }));
  const scoped = withSession(baseAttachments, baseSessionId);
  if (!includeShared) return scoped;
  const sid = String(sharedSessionId || '').trim();
  if (!sid) return scoped;
  try {
    const shared = await attachmentStore.listAttachments(sid);
    return scoped.concat(withSession(shared, sid));
  } catch (_) {
    return scoped;
  }
}

function pickAttachmentFromPrompt(message, attachments = []) {
  const text = String(message || '').toLowerCase();
  if (!text) return null;
  const idMatch = text.match(/\b(file|text)_[a-z0-9]+_[a-z0-9]+\b/i);
  if (idMatch) {
    const id = String(idMatch[0] || '').trim();
    const byId = attachments.find((item) => String(item.id) === id);
    if (byId) return byId;
  }
  for (const item of attachments) {
    const name = String(item.displayName || item.originalName || '').toLowerCase();
    if (name && text.includes(name)) return item;
  }
  if (attachments.length === 1) return attachments[0];
  return null;
}

function resolveAttachmentTarget(message, attachments = [], allowAmbiguous = false) {
  const picked = pickAttachmentFromPrompt(message, attachments);
  if (picked) return picked;
  if (attachments.length === 1) return attachments[0];
  if (allowAmbiguous) return null;
  return attachments[0] || null;
}

function detectIntent(message) {
  const text = String(message || '').toLowerCase();
  const codeIntent = /(write|generate|create|program|build)\s+(a\s+)?(python|script|function|program|code)\b/.test(text)
    || /\bpython\b/.test(text);
  if (codeIntent) return 'code_generate';
  return 'attachment_summarize';
}

function detectCodeLanguage(message) {
  const text = String(message || '').toLowerCase();
  if (/\bjavascript\b|\bjs\b/.test(text)) return 'javascript';
  if (/\btypescript\b|\bts\b/.test(text)) return 'typescript';
  if (/\bgo\b|\bgolang\b/.test(text)) return 'go';
  if (/\brust\b/.test(text)) return 'rust';
  return 'python';
}

function buildCodeSystemPrompt(language) {
  return [
    `You are a senior ${language} engineer.`,
    'Return only runnable source code.',
    'Do not include commentary.',
    'Use concise, readable code.',
    `Output format: one fenced code block tagged with ${language}.`
  ].join(' ');
}

function ensureCodeFence(raw, language) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^```[a-zA-Z0-9_-]*\n[\s\S]*\n```$/m.test(text)) return text;
  return `\`\`\`${language}\n${text}\n\`\`\``;
}

function resolveSessionId(options = {}) {
  const explicit = String(options.sessionId || '').trim();
  if (explicit) return explicit;
  const port = Number(options.port);
  if (Number.isFinite(port) && port > 0) return `terminal-${port}`;
  return 'terminal-default';
}

function normalizeOptions(raw = {}) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const quality = normalizeQuality(src.quality);
  const defaultsByQuality = {
    fast: { chunkSize: 1000, overlap: 80, maxSummarizedChunks: 6, maxSummaryChars: 2400, allowRewrite: false },
    balanced: { chunkSize: 1200, overlap: 120, maxSummarizedChunks: 10, maxSummaryChars: 3600, allowRewrite: false },
    deep: { chunkSize: 1400, overlap: 140, maxSummarizedChunks: 18, maxSummaryChars: 6400, allowRewrite: true }
  };
  const q = defaultsByQuality[quality];
  return {
    quality,
    engineMode: normalizeEngineMode(src.engineMode),
    sessionId: String(src.sessionId || '').trim(),
    sharedAttachmentSessionId: String(src.sharedAttachmentSessionId || 'terminal-shared').trim(),
    includeSharedAttachments: src.includeSharedAttachments === true,
    modelName: String(src.modelName || '').trim(),
    port: Number(src.port) || 0,
    maxBytesPerAttachment: clampInt(src.maxBytesPerAttachment, 256 * 1024, 4096, 5 * 1024 * 1024),
    chunkSize: clampInt(src.chunkSize, q.chunkSize, 100, 20000),
    chunkOverlap: clampInt(src.chunkOverlap, q.overlap, 0, 5000),
    maxQueryTerms: clampInt(src.maxQueryTerms, 12, 1, 64),
    maxRankedChunks: clampInt(src.maxRankedChunks, 24, 1, 200),
    maxSummarizedChunks: clampInt(src.maxSummarizedChunks, q.maxSummarizedChunks, 1, 200),
    maxSummaryChars: clampInt(src.maxSummaryChars, q.maxSummaryChars, 128, 100000),
    maxChunkPreviewChars: clampInt(src.maxChunkPreviewChars, 420, 80, 4000),
    allowRewrite: src.allowRewrite == null ? q.allowRewrite : src.allowRewrite === true,
    maxPlannerSteps: clampInt(src.maxPlannerSteps, 6, 1, 16),
    budgets: normalizeBudgets(src.budgets)
  };
}

function normalizeBudgets(value) {
  const src = (value && typeof value === 'object') ? value : {};
  return {
    maxToolCalls: clampInt(src.maxToolCalls, 40, 1, 400),
    maxRuntimeMs: clampInt(src.maxRuntimeMs, 45000, 2000, 300000)
  };
}

function normalizeQuality(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'fast' || v === 'balanced' || v === 'deep') return v;
  return 'balanced';
}

function normalizeEngineMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'mit-loop' || v === 'deterministic') return v;
  return 'mit-loop';
}

function parseJsonFromModelText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(String(fenced[1]).trim());
    } catch (_) {}
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const sub = raw.slice(start, end + 1);
    try {
      return JSON.parse(sub);
    } catch (_) {}
  }
  return null;
}

function parseRequiredTermsFromPrompt(message) {
  const text = String(message || '').trim();
  if (!text) return [];
  const patterns = [
    /\b(?:include|preserve|keep)\s+terms?\s*:\s*([^\n.]+)/i,
    /\brequired\s+terms?\s*:\s*([^\n.]+)/i
  ];
  let rawList = '';
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) {
      rawList = String(m[1]);
      break;
    }
  }
  if (!rawList) return [];
  const cleaned = rawList
    .replace(/\band\b/gi, ',')
    .replace(/[()[\]{}]/g, ' ')
    .trim();
  const terms = cleaned
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .map((v) => v.replace(/^["'`]+|["'`]+$/g, '').trim())
    .filter(Boolean);
  return uniqueStrings(terms).slice(0, 24);
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const s = String(value || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function findMissingTerms(text, requiredTerms = []) {
  const base = String(text || '');
  if (!base || !Array.isArray(requiredTerms) || requiredTerms.length === 0) return [];
  return requiredTerms.filter((term) => {
    const t = String(term || '').trim();
    if (!t) return false;
    return !base.toLowerCase().includes(t.toLowerCase());
  });
}

function ensureTermsInSummary(text, requiredTerms = []) {
  const base = String(text || '').trim();
  const terms = Array.isArray(requiredTerms)
    ? requiredTerms.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  if (terms.length === 0) return base;
  const missing = findMissingTerms(base, terms);
  if (missing.length === 0) return base;
  const line = `Key terms: ${terms.join(', ')}.`;
  return base ? `${base}\n\n${line}` : line;
}

function normalizePlaceholderTerms(text, requiredTerms = []) {
  let out = String(text || '');
  if (!out) return out;
  const terms = Array.isArray(requiredTerms) ? requiredTerms : [];
  for (const required of terms) {
    const exact = String(required || '').trim();
    if (!exact) continue;
    const core = extractPlaceholderCore(exact);
    if (!core) continue;
    const coreEsc = escapeRegExp(core);
    const hasExact = new RegExp(escapeRegExp(exact), 'i').test(out);
    if (hasExact) continue;
    out = out.replace(new RegExp(`\\(\\s*${coreEsc}\\s*\\)`, 'gi'), exact);
    const hasExactAfterParen = new RegExp(escapeRegExp(exact), 'i').test(out);
    if (hasExactAfterParen) continue;
    out = out.replace(new RegExp(`\\b${coreEsc}\\b`, 'gi'), exact);
  }
  return out;
}

function extractPlaceholderCore(term) {
  const t = String(term || '').trim();
  const m = t.match(/^<([a-zA-Z0-9_-]+)>$/);
  return m ? m[1] : '';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripUnknownAngleBracketTerms(text, requiredTerms = []) {
  const base = String(text || '');
  if (!base) return base;
  const allowed = new Set(
    (Array.isArray(requiredTerms) ? requiredTerms : [])
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean)
  );
  return base.replace(/<([a-zA-Z0-9_-]+)>/g, (full, inner) => {
    const token = `<${String(inner || '').trim()}>`;
    if (allowed.has(token.toLowerCase())) return token;
    return String(inner || '').trim();
  });
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

module.exports = {
  buildAttachmentScopes,
  resolveAttachmentTarget,
  detectIntent,
  detectCodeLanguage,
  buildCodeSystemPrompt,
  ensureCodeFence,
  resolveSessionId,
  normalizeOptions,
  parseJsonFromModelText,
  parseRequiredTermsFromPrompt,
  uniqueStrings,
  findMissingTerms,
  ensureTermsInSummary,
  normalizePlaceholderTerms,
  stripUnknownAngleBracketTerms
};
