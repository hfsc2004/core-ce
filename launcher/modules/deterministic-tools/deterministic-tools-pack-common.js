/**
 * ============================================================================
 * DETERMINISTIC TOOLS - COMMON PACK
 * ============================================================================
 *
 * Core cross-surface deterministic tools for text and planning scaffolds.
 * These are designed for small models to call reliably.
 *
 * @module deterministic-tools-pack-common
 * @version 1.1.2 - March 5, 2026
 * ============================================================================
 */

function buildCommonToolPack() {
  return [
    {
      name: 'chunk_text',
      description: 'Split text into deterministic chunks',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          chunkSize: { type: 'integer', minimum: 50, maximum: 20000 },
          overlap: { type: 'integer', minimum: 0, maximum: 5000 }
        },
        required: ['text']
      },
      handler: (args = {}) => {
        const text = String(args.text || '');
        const chunkSize = clampInt(args.chunkSize, 1200, 50, 20000);
        const overlap = clampInt(args.overlap, 120, 0, Math.min(5000, chunkSize - 1));
        const out = [];
        if (!text) return { chunks: out, count: 0, chunkSize, overlap };
        let index = 0;
        while (index < text.length) {
          const next = Math.min(text.length, index + chunkSize);
          out.push({
            index: out.length,
            start: index,
            end: next,
            text: text.slice(index, next)
          });
          if (next >= text.length) break;
          index = Math.max(index + 1, next - overlap);
        }
        return { chunks: out, count: out.length, chunkSize, overlap };
      }
    },
    {
      name: 'find_lines',
      description: 'Find lines containing a query string',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          query: { type: 'string' },
          caseSensitive: { type: 'boolean' },
          maxHits: { type: 'integer', minimum: 1, maximum: 1000 }
        },
        required: ['text', 'query']
      },
      handler: (args = {}) => {
        const text = String(args.text || '');
        const query = String(args.query || '');
        const caseSensitive = args.caseSensitive === true;
        const maxHits = clampInt(args.maxHits, 50, 1, 1000);
        const lines = text.split(/\r?\n/);
        const needle = caseSensitive ? query : query.toLowerCase();
        const hits = [];
        for (let i = 0; i < lines.length; i += 1) {
          const hay = caseSensitive ? lines[i] : lines[i].toLowerCase();
          if (!needle || !hay.includes(needle)) continue;
          hits.push({ lineNumber: i + 1, line: lines[i] });
          if (hits.length >= maxHits) break;
        }
        return { query, caseSensitive, hits, hitCount: hits.length, truncated: hits.length >= maxHits };
      }
    },
    {
      name: 'extract_between',
      description: 'Extract text between start and end markers',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          startMarker: { type: 'string' },
          endMarker: { type: 'string' },
          includeMarkers: { type: 'boolean' }
        },
        required: ['text', 'startMarker', 'endMarker']
      },
      handler: (args = {}) => {
        const text = String(args.text || '');
        const startMarker = String(args.startMarker || '');
        const endMarker = String(args.endMarker || '');
        const includeMarkers = args.includeMarkers === true;
        const start = text.indexOf(startMarker);
        if (start < 0) return { found: false, extracted: '', reason: 'start-not-found' };
        const searchFrom = start + startMarker.length;
        const end = text.indexOf(endMarker, searchFrom);
        if (end < 0) return { found: false, extracted: '', reason: 'end-not-found' };
        const extracted = includeMarkers
          ? text.slice(start, end + endMarker.length)
          : text.slice(searchFrom, end);
        return {
          found: true,
          extracted,
          range: {
            start,
            end: includeMarkers ? end + endMarker.length : end
          }
        };
      }
    },
    {
      name: 'parse_key_values',
      description: 'Parse key=value pairs from loose planner text',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          allowedKeys: { type: 'array', items: { type: 'string' } }
        },
        required: ['text']
      },
      handler: (args = {}) => {
        const text = String(args.text || '');
        const allowed = new Set(Array.isArray(args.allowedKeys) ? args.allowedKeys.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean) : []);
        const map = {};
        const pairRegex = /([a-zA-Z0-9_.-]+)\s*=\s*([^\s,;]+)/g;
        let m = null;
        while ((m = pairRegex.exec(text)) !== null) {
          const keyRaw = String(m[1] || '').trim();
          const valRaw = String(m[2] || '').trim();
          if (!keyRaw) continue;
          const keyNorm = keyRaw.toLowerCase();
          if (allowed.size > 0 && !allowed.has(keyNorm)) continue;
          map[keyNorm] = valRaw.replace(/^["']|["']$/g, '');
        }
        return { values: map, count: Object.keys(map).length };
      }
    },
    {
      name: 'accumulate_summaries',
      description: 'Join summaries deterministically with max length cap',
      schema: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' } },
          maxChars: { type: 'integer', minimum: 100, maximum: 100000 }
        },
        required: ['items']
      },
      handler: (args = {}) => {
        const list = Array.isArray(args.items) ? args.items.map((v) => String(v || '').trim()).filter(Boolean) : [];
        const maxChars = clampInt(args.maxChars, 4000, 100, 100000);
        let out = '';
        for (let i = 0; i < list.length; i += 1) {
          const segment = `${i + 1}. ${list[i]}`;
          const next = out ? `${out}\n${segment}` : segment;
          if (next.length > maxChars) break;
          out = next;
        }
        return { summary: out, usedItems: out ? out.split('\n').length : 0, maxChars };
      }
    },
    {
      name: 'extract_query_terms',
      description: 'Extract deterministic high-signal query terms from a user message',
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          preserveTerms: { type: 'array', items: { type: 'string' } },
          maxTerms: { type: 'integer', minimum: 1, maximum: 50 }
        },
        required: ['message']
      },
      handler: (args = {}) => {
        const message = String(args.message || '');
        const preserveTerms = Array.isArray(args.preserveTerms)
          ? args.preserveTerms.map((v) => String(v || '').trim()).filter(Boolean)
          : [];
        const maxTerms = clampInt(args.maxTerms, 12, 1, 50);
        const quoted = message.match(/["']([^"']{2,80})["']/g) || [];
        const quotedTerms = quoted
          .map((q) => String(q || '').replace(/^["']|["']$/g, '').trim())
          .filter(Boolean);
        const words = message
          .split(/[^A-Za-z0-9_.-]+/)
          .map((w) => String(w || '').trim())
          .filter(Boolean)
          .filter((w) => w.length >= 4)
          .filter((w) => !/^\d+$/.test(w))
          .filter((w) => !isStopWord(w));
        const terms = uniqueStrings([...preserveTerms, ...quotedTerms, ...words]).slice(0, maxTerms);
        return { terms, count: terms.length, maxTerms };
      }
    },
    {
      name: 'rank_chunks_by_terms',
      description: 'Rank text chunks deterministically by term matches',
      schema: {
        type: 'object',
        properties: {
          chunks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                start: { type: 'integer' },
                end: { type: 'integer' },
                text: { type: 'string' }
              }
            }
          },
          terms: { type: 'array', items: { type: 'string' } },
          maxChunks: { type: 'integer', minimum: 1, maximum: 200 }
        },
        required: ['chunks', 'terms']
      },
      handler: (args = {}) => {
        const chunks = Array.isArray(args.chunks) ? args.chunks : [];
        const terms = (Array.isArray(args.terms) ? args.terms : [])
          .map((t) => String(t || '').trim().toLowerCase())
          .filter(Boolean);
        const maxChunks = clampInt(args.maxChunks, 20, 1, 200);
        if (!terms.length || !chunks.length) {
          return { ranked: [], count: 0, maxChunks };
        }
        const ranked = chunks
          .map((chunk, idx) => {
            const text = String(chunk?.text || '').toLowerCase();
            let score = 0;
            const matchedTerms = [];
            for (let i = 0; i < terms.length; i += 1) {
              const term = terms[i];
              if (!term || !text.includes(term)) continue;
              matchedTerms.push(term);
              const occurrences = countOccurrences(text, term);
              score += Math.min(8, occurrences);
            }
            // Small deterministic bias toward earlier chunks for tie-breaking.
            const positionBonus = Math.max(0, 0.25 - (idx * 0.0001));
            return {
              index: Number(chunk?.index || idx),
              start: Number(chunk?.start || 0),
              end: Number(chunk?.end || 0),
              text: String(chunk?.text || ''),
              score: score + positionBonus,
              matchedTerms: uniqueStrings(matchedTerms)
            };
          })
          .filter((row) => row.score > 0)
          .sort((a, b) => (b.score - a.score) || (a.index - b.index))
          .slice(0, maxChunks);
        return { ranked, count: ranked.length, maxChunks };
      }
    },
    {
      name: 'coverage_guard',
      description: 'Check whether required terms are preserved in summary text',
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          requiredTerms: { type: 'array', items: { type: 'string' } }
        },
        required: ['summary']
      },
      handler: (args = {}) => {
        const summary = String(args.summary || '').trim();
        const requiredTerms = Array.isArray(args.requiredTerms)
          ? args.requiredTerms.map((v) => String(v || '').trim()).filter(Boolean)
          : [];
        const lower = summary.toLowerCase();
        const missingTerms = requiredTerms.filter((term) => !lower.includes(String(term).toLowerCase()));
        return {
          summary,
          requiredCount: requiredTerms.length,
          missingCount: missingTerms.length,
          missingTerms,
          complete: missingTerms.length === 0
        };
      }
    }
  ];
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  values.forEach((v) => {
    const s = String(v || '').trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  });
  return out;
}

function countOccurrences(text, term) {
  if (!text || !term) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    idx = text.indexOf(term, idx);
    if (idx < 0) break;
    count += 1;
    idx += Math.max(1, term.length);
  }
  return count;
}

function isStopWord(word) {
  return /^(what|which|when|where|how|from|with|that|this|into|over|under|about|could|would|should|please|using|deployable|runtime|only)$/i.test(String(word || ''));
}

module.exports = {
  buildCommonToolPack
};
