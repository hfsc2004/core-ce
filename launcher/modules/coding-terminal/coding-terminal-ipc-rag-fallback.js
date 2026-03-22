/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - IPC RAG Fallback Helpers
 */

'use strict';

function createRagFallbackTools(deps = {}) {
  const fs = deps.fs;
  const ragEngine = deps.ragEngine;
  const ensureRagReady = deps.ensureRagReady;
  const checkPermission = deps.checkPermission;
  const resolveActiveRagBucket = deps.resolveActiveRagBucket;
  const withTimeout = deps.withTimeout;
  const getConfig = typeof deps.getConfig === 'function' ? deps.getConfig : () => ({});
  const generateId = typeof deps.generateId === 'function' ? deps.generateId : () => String(Date.now());
  const sourceIndexPath = String(deps.sourceIndexPath || '').trim();

  function summarizeRagSources(results = []) {
    return (results || [])
      .slice(0, 3)
      .map((r) => {
        const md = r?.metadata || {};
        const file = md.filePath || 'unknown';
        const retrieval = md.retrieval || 'unknown';
        return `${file} [${retrieval}]`;
      })
      .join(' | ');
  }

  function ragDebugLog(stage, details = {}) {
    const cfg = getConfig();
    if (!cfg?.ragDebug) return;
    const parts = Object.entries(details)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    console.log(`[RAG_DEBUG] ${stage}${parts ? ` ${parts}` : ''}`);
  }

  async function tryGetRagContext(query) {
    try {
      const cfg = getConfig();
      if (cfg?.ragEnabled === false) return { results: [] };
      const init = await ensureRagReady();
      if (!init.success) {
        const fileFallback = fallbackSourceIndexLookup(query);
        ragDebugLog('init-failed-fallback', {
          reason: init.error || 'init-failed',
          results: fileFallback.results.length,
          sources: summarizeRagSources(fileFallback.results)
        });
        return fileFallback.results.length > 0 ? fileFallback : { results: [] };
      }
      const allowed = await checkPermission('rag:query');
      if (!allowed) {
        const fileFallback = fallbackSourceIndexLookup(query);
        ragDebugLog('permission-denied-fallback', {
          results: fileFallback.results.length,
          sources: summarizeRagSources(fileFallback.results)
        });
        return fileFallback.results.length > 0 ? fileFallback : { results: [] };
      }
      const bucket = resolveActiveRagBucket({});
      ragDebugLog('query-start', { bucketId: bucket.id, query: String(query || '').slice(0, 120) });
      const scopedHybrid = await withTimeout(
        ragEngine.query(query, { topK: 3, threshold: 0.72, mode: 'hybrid', bucketId: bucket.id }),
        2000,
        'RAG timeout'
      );
      if (Array.isArray(scopedHybrid?.results) && scopedHybrid.results.length > 0) {
        ragDebugLog('scoped-hybrid-hit', {
          bucketId: bucket.id,
          results: scopedHybrid.results.length,
          sources: summarizeRagSources(scopedHybrid.results)
        });
        return scopedHybrid;
      }

      const scopedSource = await withTimeout(
        ragEngine.query(query, { topK: 3, threshold: 0.35, mode: 'source', bucketId: bucket.id }),
        2000,
        'RAG timeout'
      );
      if (Array.isArray(scopedSource?.results) && scopedSource.results.length > 0) {
        ragDebugLog('scoped-source-hit', {
          bucketId: bucket.id,
          results: scopedSource.results.length,
          sources: summarizeRagSources(scopedSource.results)
        });
        return scopedSource;
      }

      const globalSource = await withTimeout(
        ragEngine.query(query, { topK: 3, threshold: 0.35, mode: 'source' }),
        2000,
        'RAG timeout'
      );
      if (Array.isArray(globalSource?.results) && globalSource.results.length > 0) {
        ragDebugLog('global-source-hit', {
          results: globalSource.results.length,
          sources: summarizeRagSources(globalSource.results)
        });
        return globalSource;
      }
      const crossBucket = await fallbackCrossBucketSourceLookup(query);
      if (Array.isArray(crossBucket?.results) && crossBucket.results.length > 0) {
        ragDebugLog('cross-bucket-hit', {
          results: crossBucket.results.length,
          sources: summarizeRagSources(crossBucket.results)
        });
        return crossBucket;
      }
      const fileFallback = fallbackSourceIndexLookup(query);
      if (fileFallback.results.length > 0) {
        ragDebugLog('source-index-file-hit', {
          results: fileFallback.results.length,
          sources: summarizeRagSources(fileFallback.results)
        });
        return fileFallback;
      }
      ragDebugLog('query-empty', { bucketId: bucket.id });
      return { results: [] };
    } catch {
      const fileFallback = fallbackSourceIndexLookup(query);
      ragDebugLog('query-exception-fallback', {
        results: fileFallback.results.length,
        sources: summarizeRagSources(fileFallback.results)
      });
      return fileFallback.results.length > 0 ? fileFallback : { results: [] };
    }
  }

  function extractRagQueryKeywords(query) {
    return [...new Set(
      String(query || '')
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4)
        .slice(0, 16)
    )];
  }

  function scoreRagSourceText(text, keywords) {
    const hay = String(text || '').toLowerCase();
    if (!hay) return 0;
    let score = 0;
    for (const kw of keywords) {
      if (hay.includes(kw)) score += 1;
      if (kw.includes('_') && hay.includes(kw.replace(/_/g, ''))) score += 0.25;
    }
    return score;
  }

  function fallbackSourceIndexLookup(query) {
    try {
      if (!sourceIndexPath || !fs.existsSync(sourceIndexPath)) return { results: [] };
      const raw = fs.readFileSync(sourceIndexPath, 'utf8');
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries) || entries.length === 0) return { results: [] };
      const keywords = extractRagQueryKeywords(query);
      const scored = [];
      for (const entry of entries) {
        const md = entry?.metadata || {};
        const fp = String(md.filePath || '');
        if (!fp) continue;
        const text = String(md.text || '');
        let score = scoreRagSourceText(text, keywords);
        if (keywords.length > 0 && keywords.some((kw) => fp.toLowerCase().includes(kw))) {
          score += 0.5;
        }
        if (score <= 0) continue;
        scored.push({
          id: entry.id || generateId(),
          score,
          metadata: {
            ...md,
            retrieval: 'source-index-file-fallback'
          }
        });
      }
      scored.sort((a, b) => b.score - a.score);
      return {
        query,
        mode: 'source-index-file-fallback',
        results: scored.slice(0, 3),
        totalFound: scored.length,
        filtered: Math.min(scored.length, 3)
      };
    } catch {
      return { results: [] };
    }
  }

  async function fallbackCrossBucketSourceLookup(query) {
    try {
      if (typeof ragEngine.listBuckets !== 'function' || typeof ragEngine.listSources !== 'function') {
        return { results: [] };
      }
      const bucketRes = await withTimeout(
        ragEngine.listBuckets(),
        1500,
        'RAG bucket list timeout'
      );
      const bucketIds = new Set(['default']);
      for (const b of (bucketRes?.buckets || [])) {
        if (b?.id) bucketIds.add(String(b.id));
      }

      const keywords = extractRagQueryKeywords(query);
      const collected = [];
      const seen = new Set();

      for (const bucketId of bucketIds) {
        let listed = null;
        try {
          listed = await withTimeout(
            ragEngine.listSources({ bucketId, limit: 200 }),
            2000,
            'RAG source list timeout'
          );
        } catch {
          continue;
        }
        const items = Array.isArray(listed?.results) ? listed.results : [];
        for (const item of items) {
          const md = item?.metadata || {};
          const key = `${md.filePath || ''}:${md.startLine ?? -1}:${md.endLine ?? -1}:${bucketId}`;
          if (!md.filePath || seen.has(key)) continue;
          seen.add(key);
          let text = String(md.text || '');
          if ((!text || text.length < 40) && fs.existsSync(md.filePath)) {
            try {
              const raw = fs.readFileSync(md.filePath, 'utf8');
              text = raw.slice(0, 2000);
            } catch {}
          }
          const score = scoreRagSourceText(text, keywords);
          if (score <= 0) continue;
          collected.push({
            id: item.id || generateId(),
            score,
            metadata: {
              ...md,
              text: text.slice(0, 1200),
              retrieval: 'source-index-fallback',
              bucketId
            }
          });
        }
      }

      collected.sort((a, b) => b.score - a.score);
      return {
        query,
        mode: 'source-fallback',
        results: collected.slice(0, 3),
        totalFound: collected.length,
        filtered: Math.min(collected.length, 3)
      };
    } catch {
      return { results: [] };
    }
  }

  return {
    summarizeRagSources,
    ragDebugLog,
    tryGetRagContext
  };
}

module.exports = createRagFallbackTools;

