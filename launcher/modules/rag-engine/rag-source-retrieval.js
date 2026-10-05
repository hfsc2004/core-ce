/**
 *
 * @version 1.1.3 - March 5, 2026
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
    // Application-managed collections can pin their sources independently of
    // the shared index. Query path mentions must not widen that collection.
    const allowedPaths = Array.isArray(options.allowedFilePaths)
      ? new Set(options.allowedFilePaths) : null;
    const bm25 = options.ranking === 'bm25';
    const keywords = extractKeywords(queryText, bm25);
    if (keywords.length === 0) return [];

    const candidatePaths = new Set();

    if (allowedPaths) {
      for (const p of allowedPaths) candidatePaths.add(p);
    }

    if (!allowedPaths) {
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

    }

    const scored = [];
    const corpus = [];
    for (const filePath of candidatePaths) {
      if (allowedPaths && !allowedPaths.has(filePath)) continue;
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
      if (bm25) corpus.push({ filePath, tokens: tokenize(content),
        titleTokens: tokenize(content.split('\n')[0]) });

      const lines = content.split('\n');
      const lineScores = scoreLines(lines, keywords, bm25);
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

    if (bm25 && corpus.length) {
      const averageLength = corpus.reduce((sum, doc) => sum + doc.tokens.length, 0) / corpus.length;
      const frequency = new Map(keywords.map(term => [term,
        corpus.filter(doc => doc.tokens.includes(term)).length]));
      const byPath = new Map(corpus.map(doc => [doc.filePath, doc]));
      for (const result of scored) {
        const doc = byPath.get(result.metadata.filePath);
        result.score = keywords.reduce((sum, term) => {
          const count = doc.tokens.filter(token => token === term).length;
          if (!count) return sum;
          const df = frequency.get(term);
          const idf = Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5));
          const titleBoost = doc.titleTokens.includes(term) ? idf : 0;
          return sum + titleBoost + idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * doc.tokens.length / averageLength));
        }, 0);
        result.metadata.ranking = 'bm25';
      }
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

  function tokenize(text) {
    return String(text || '').toLowerCase().match(/[a-z0-9_]+/g) || [];
  }

  function extractKeywords(text, preserveShortIdentifiers = false) {
    const stop = new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'have', 'what',
      'when', 'where', 'which', 'write', 'make', 'create', 'show', 'help', 'please',
      'html', 'css', 'js'
    ]);
    if (preserveShortIdentifiers) {
      for (const word of ['a', 'an', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
        'can', 'could', 'did', 'do', 'does', 'had', 'has', 'how', 'if', 'in', 'is',
        'it', 'its', 'may', 'of', 'on', 'or', 'our', 'should', 'so', 'than', 'their',
        'them', 'there', 'they', 'to', 'was', 'we', 'were', 'why', 'will', 'would',
        'you', 'your']) stop.add(word);
    }
    const tokens = preserveShortIdentifiers ? tokenize(text)
      : String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/);
    return [...new Set(tokens.map(t => t.trim())
      .filter(t => t.length >= (preserveShortIdentifiers ? 2 : 3) && !stop.has(t)))].slice(0, 12);
  }

  function extractPathMentions(text) {
    const matches = String(text || '').match(/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+/g) || [];
    return [...new Set(matches)];
  }

  function scoreLines(lines, keywords, wholeWords = false) {
    const scored = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const words = wholeWords ? new Set(tokenize(line)) : null;
      let score = 0;
      const matched = [];
      for (const kw of keywords) {
        if (words ? words.has(kw) : line.includes(kw)) {
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
