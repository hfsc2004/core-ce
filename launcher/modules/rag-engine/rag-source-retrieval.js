/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Source-of-record retrieval helpers for hybrid RAG mode.
 */

function createSourceRetriever({ fs, ragCommon, readSourceIndex, normalizeBucketId, isVectorReady }) {
  async function lookupSourceOfRecord(queryText, options = {}) {
    const topK = options.topK || 5;
    const bucketId = normalizeBucketId(options.bucketId || 'default');
    const filters = options.filters || [];
    const seedResults = Array.isArray(options.seedResults) ? options.seedResults : [];
    const keywords = extractKeywords(queryText);
    if (keywords.length === 0) return [];

    const candidatePaths = new Set();

    for (const r of seedResults) {
      const p = r?.metadata?.filePath;
      if (p && fs.existsSync(p)) candidatePaths.add(p);
    }

    for (const mention of extractPathMentions(queryText)) {
      if (fs.existsSync(mention)) candidatePaths.add(mention);
    }

    if (candidatePaths.size === 0 && isVectorReady()) {
      try {
        const indexed = await ragCommon.listItems(2000);
        for (const item of indexed) {
          const p = item?.metadata?.filePath;
          const itemBucket = normalizeBucketId(item?.metadata?.bucketId || 'default');
          if (p && fs.existsSync(p) && itemBucket === bucketId) {
            candidatePaths.add(p);
          }
        }
      } catch {}
    }

    if (candidatePaths.size === 0) {
      const fallbackSources = readSourceIndex();
      for (const s of fallbackSources) {
        const p = s?.metadata?.filePath;
        const sourceBucket = normalizeBucketId(s?.metadata?.bucketId || 'default');
        if (p && fs.existsSync(p) && sourceBucket === bucketId) {
          candidatePaths.add(p);
        }
      }
    }

    const scored = [];
    for (const filePath of candidatePaths) {
      if (filters.length > 0 && !filters.some((f) => filePath.endsWith(f))) {
        continue;
      }

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
      if (!content) continue;

      const lines = content.split('\n');
      const lineScores = scoreLines(lines, keywords);
      if (lineScores.length === 0) continue;

      const best = lineScores[0];
      const startLine = Math.max(0, best.line - 12);
      const endLine = Math.min(lines.length - 1, best.line + 12);
      const snippet = lines.slice(startLine, endLine + 1).join('\n');

      scored.push({
        id: `source_${simpleHash(`${filePath}:${startLine}`)}`,
        score: normalizeScore(best.score),
        metadata: {
          filePath,
          startLine,
          endLine,
          text: snippet.substring(0, 1200),
          category: 'source',
          retrieval: 'source-of-record',
          matchedKeywords: best.matched,
          indexedAt: Date.now(),
          bucketId
        }
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  function mergeResults(primary, secondary, topK) {
    const out = [];
    const seen = new Set();
    const keyFor = (r) => `${r?.metadata?.filePath || ''}:${r?.metadata?.startLine ?? -1}:${r?.metadata?.endLine ?? -1}`;

    for (const r of [...primary, ...secondary]) {
      const key = keyFor(r);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= Math.max(topK, 1) * 2) break;
    }
    return out;
  }

  function extractKeywords(text) {
    const stop = new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'have', 'what',
      'when', 'where', 'which', 'write', 'make', 'create', 'show', 'help', 'please',
      'html', 'css', 'js'
    ]);
    const tokens = String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !stop.has(t));
    return [...new Set(tokens)].slice(0, 12);
  }

  function extractPathMentions(text) {
    const matches = String(text || '').match(/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+/g) || [];
    return [...new Set(matches)];
  }

  function scoreLines(lines, keywords) {
    const scored = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      let score = 0;
      const matched = [];
      for (const kw of keywords) {
        if (line.includes(kw)) {
          matched.push(kw);
          score += 1;
        }
      }
      if (score > 0) {
        scored.push({ line: i, score, matched });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  function normalizeScore(raw) {
    if (raw <= 0) return 0;
    return Math.min(0.99, 0.5 + raw * 0.08);
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  return {
    lookupSourceOfRecord,
    mergeResults
  };
}

module.exports = {
  createSourceRetriever
};
