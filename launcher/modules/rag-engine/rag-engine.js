/**
 * PSF RAG Engine - Entry Point
 * Vector-based code context retrieval for AI-assisted coding
 * 
 * @module rag-engine
 * @version 1.1.2 - March 5, 2026
 */

const ragConfig = require('./rag-config');
const ragCommon = require('./rag-engine-common');
const ragIndexer = require('./rag-indexer');
const ragEmbeddings = require('./rag-embeddings');
const ragChunker = require('./rag-chunker');
const { createSourceIndexStore } = require('./rag-source-index');
const { createSourceRetriever } = require('./rag-source-retrieval');
const fs = require('fs');
const path = require('path');

let initialized = false;
let vectorReady = false;
let embeddingsReady = false;
let degradedReason = '';
const SOURCE_INDEX_PATH = path.join(__dirname, '../../data/rag-source-index.json');

const sourceIndexStore = createSourceIndexStore({
  sourceIndexPath: SOURCE_INDEX_PATH,
  fs,
  path
});
const {
  normalizeBucketId,
  readSourceIndex,
  writeSourceIndex,
  mergeSourceIndex,
  removeSourceEntriesByPaths,
  removeSourceEntriesByBucket
} = sourceIndexStore;

const sourceRetriever = createSourceRetriever({
  fs,
  ragCommon,
  readSourceIndex,
  normalizeBucketId,
  isVectorReady: () => vectorReady
});
const lookupSourceOfRecord = sourceRetriever.lookupSourceOfRecord;
const mergeResults = sourceRetriever.mergeResults;

/**
 * Initialize RAG engine
 * @param {Object} options - Initialization options
 * @returns {Promise<boolean>} Success status
 */
async function initialize(options = {}) {
  if (initialized) {
    console.log('[RAG] Already initialized');
    return true;
  }
  
  try {
    // Load edition-specific configuration
    const config = ragConfig.getConfig();
    console.log(`[RAG] Initializing with edition: ${config.edition}`);
    console.log(`[RAG] Max vectors: ${config.maxVectors}, Chunk size: ${config.chunkSize}`);
    
    vectorReady = false;
    embeddingsReady = false;
    degradedReason = '';

    // Initialize sub-modules with graceful degradation.
    try {
      await ragEmbeddings.initialize(options.ollamaPort || 11434);
      embeddingsReady = true;
    } catch (err) {
      degradedReason = `Embeddings unavailable: ${err.message}`;
      console.warn('[RAG] Degraded mode:', degradedReason);
    }

    try {
      await ragCommon.initialize(config);
      vectorReady = true;
    } catch (err) {
      degradedReason = degradedReason
        ? `${degradedReason}; Vector store unavailable: ${err.message}`
        : `Vector store unavailable: ${err.message}`;
      console.warn('[RAG] Degraded mode:', degradedReason);
    }
    
    initialized = true;
    if (vectorReady && embeddingsReady) {
      console.log('[RAG] Engine initialized successfully');
    } else {
      console.log(`[RAG] Engine initialized in degraded mode: ${degradedReason || 'partial capabilities'}`);
    }
    return true;
  } catch (err) {
    console.error('[RAG] Initialization failed:', err);
    return false;
  }
}

/**
 * Query the RAG index for relevant code context
 * @param {string} query - User query
 * @param {Object} options - Query options
 * @param {number} options.topK - Number of results (default: 5)
 * @param {number} options.threshold - Similarity threshold (default: 0.7)
 * @param {string[]} options.filters - File type filters
 * @returns {Promise<Object>} Query results
 */
async function query(query, options = {}) {
  if (!initialized) {
    throw new Error('RAG engine not initialized');
  }
  
  const topK = options.topK || 5;
  const threshold = options.threshold || 0.7;
  const mode = options.mode || 'hybrid'; // 'semantic' | 'source' | 'hybrid'
  const bucketId = normalizeBucketId(options.bucketId || 'default');
  
  try {
    let semanticResults = [];
    if ((mode === 'semantic' || mode === 'hybrid') && embeddingsReady && vectorReady) {
      // Semantic retrieval via Vectra
      const queryEmbedding = await ragEmbeddings.embed(query);
      semanticResults = await ragCommon.search(queryEmbedding, topK, threshold);
      semanticResults = semanticResults.filter((r) =>
        normalizeBucketId(r?.metadata?.bucketId || 'default') === bucketId
      );
      semanticResults = semanticResults.map((r) => ({
        ...r,
        metadata: {
          ...(r.metadata || {}),
          retrieval: 'semantic-vectra'
        }
      }));
    }
    
    let sourceResults = [];
    if (mode === 'source' || mode === 'hybrid') {
      sourceResults = await lookupSourceOfRecord(query, {
        topK,
        bucketId,
        filters: options.filters || [],
        seedResults: semanticResults
      });
    }
    
    // Merge, prefer source-of-record hits when deduping identical spans.
    const results = mergeResults(sourceResults, semanticResults, topK);
    
    // Apply filters if provided
    let filtered = results;
    if (options.filters && options.filters.length > 0) {
      filtered = results.filter(r => 
        options.filters.some(f => (r.metadata.filePath || '').endsWith(f))
      );
    }
    
    return {
      query,
      mode,
      results: filtered,
      totalFound: results.length,
      filtered: filtered.length
    };
  } catch (err) {
    console.error('[RAG] Query error:', err);
    throw err;
  }
}


/**
 * Index files/directories for RAG retrieval
 * @param {string|string[]} paths - Paths to index
 * @param {Object} options - Indexing options
 * @returns {Promise<Object>} Indexing results
 */
async function indexPaths(paths, options = {}) {
  if (!initialized) {
    throw new Error('RAG engine not initialized');
  }
  
  const pathArray = Array.isArray(paths) ? paths : [paths];
  
  try {
    const bucketId = normalizeBucketId(options.bucketId || 'default') || 'default';
    const results = await ragIndexer.indexPaths(pathArray, {
      ...options,
      bucketId
    });
    mergeSourceIndex(results.sources || []);
    return {
      success: true,
      indexed: results.indexed,
      skipped: results.skipped,
      errors: results.errors
    };
  } catch (err) {
    console.error('[RAG] Indexing error:', err);
    throw err;
  }
}

/**
 * Remove paths from index
 * @param {string|string[]} paths - Paths to remove
 * @returns {Promise<Object>} Removal results
 */
async function removePaths(paths, options = {}) {
  if (!initialized) {
    throw new Error('RAG engine not initialized');
  }
  
  const pathArray = Array.isArray(paths) ? paths : [paths];
  const bucketId = normalizeBucketId(options.bucketId || 'default') || 'default';
  
  try {
    const removed = await ragCommon.removeByPaths(pathArray, { bucketId });
    const removedSources = removeSourceEntriesByPaths(pathArray, { bucketId });
    return { success: true, removed, removedSources };
  } catch (err) {
    console.error('[RAG] Removal error:', err);
    throw err;
  }
}

/**
 * Get index statistics
 * @returns {Object} Index stats
 */
function getStats() {
  if (!initialized) {
    return { initialized: false };
  }
  
  const config = ragConfig.getConfig();
  const indexStats = ragCommon.getStats();
  
  return {
    initialized: true,
    degraded: !(vectorReady && embeddingsReady),
    degradedReason,
    vectorReady,
    embeddingsReady,
    edition: config.edition,
    maxVectors: config.maxVectors,
    currentVectors: indexStats.vectorCount,
    utilization: (indexStats.vectorCount / config.maxVectors * 100).toFixed(1) + '%',
    indexSize: indexStats.sizeBytes
  };
}

/**
 * Clear all indexed data
 * @returns {Promise<boolean>} Success status
 */
async function clearIndex(options = {}) {
  if (!initialized) {
    return false;
  }
  
  try {
    const bucketId = normalizeBucketId(options.bucketId || '');
    if (bucketId) {
      await ragCommon.removeByBucket(bucketId);
      removeSourceEntriesByBucket(bucketId);
      console.log(`[RAG] Bucket cleared: ${bucketId}`);
      return true;
    }
    await ragCommon.clear();
    writeSourceIndex([]);
    console.log('[RAG] Index cleared');
    return true;
  } catch (err) {
    console.error('[RAG] Clear error:', err);
    return false;
  }
}

/**
 * List indexed sources (independent of query match)
 * @param {Object} options - Listing options
 * @param {number} options.limit - Max sources to return
 * @returns {Promise<Object>} Source list
 */
async function listSources(options = {}) {
  const limit = Math.max(1, options.limit || 20);
  const bucketId = normalizeBucketId(options.bucketId || 'default') || 'default';
  let items = [];
  if (initialized && vectorReady) {
    try {
      items = await ragCommon.listItems(Math.max(limit * 5, 200));
    } catch {
      items = [];
    }
  }
  const seen = new Set();
  const sources = [];

  items
    .sort((a, b) => (b?.metadata?.indexedAt || 0) - (a?.metadata?.indexedAt || 0))
    .forEach((item) => {
      if (sources.length >= limit) return;
      if (normalizeBucketId(item?.metadata?.bucketId || 'default') !== bucketId) return;
      const filePath = item?.metadata?.filePath || '';
      const startLine = item?.metadata?.startLine ?? -1;
      const endLine = item?.metadata?.endLine ?? -1;
      const key = `${filePath}:${startLine}:${endLine}`;
      if (!filePath || seen.has(key)) return;
      seen.add(key);
      sources.push({
        id: item.id,
        score: 1,
        metadata: {
          ...item.metadata,
          retrieval: 'indexed-source'
        }
      });
    });

  if (sources.length === 0) {
    const fallbackSources = readSourceIndex()
      .filter((entry) => normalizeBucketId(entry?.metadata?.bucketId || 'default') === bucketId);
    fallbackSources.slice(0, limit).forEach((entry) => sources.push(entry));
  }

  return {
    success: true,
    results: sources,
    totalFound: sources.length
  };
}

async function listBuckets() {
  const byId = new Map();

  const upsert = (idRaw, labelRaw, indexedAtRaw) => {
    const id = normalizeBucketId(idRaw || 'default') || 'default';
    const label = String(labelRaw || id);
    const indexedAt = Number(indexedAtRaw) || 0;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, label, count: 1, lastIndexedAt: indexedAt });
      return;
    }
    existing.count += 1;
    if (indexedAt > existing.lastIndexedAt) existing.lastIndexedAt = indexedAt;
  };

  const sources = readSourceIndex();
  for (const entry of sources) {
    const md = entry?.metadata || {};
    upsert(md.bucketId, md.bucketLabel, md.indexedAt);
  }

  if (byId.size === 0 && initialized && vectorReady) {
    try {
      const items = await ragCommon.listItems(5000);
      for (const item of items) {
        const md = item?.metadata || {};
        upsert(md.bucketId, md.bucketLabel, md.indexedAt);
      }
    } catch {}
  }

  const buckets = [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  return {
    success: true,
    buckets,
    totalFound: buckets.length
  };
}


/**
 * Shutdown RAG engine
 */
async function shutdown() {
  if (!initialized) return;
  
  try { await ragCommon.shutdown(); } catch {}
  try { await ragEmbeddings.shutdown(); } catch {}
  vectorReady = false;
  embeddingsReady = false;
  degradedReason = '';
  initialized = false;
  console.log('[RAG] Engine shutdown complete');
}

module.exports = {
  initialize,
  query,
  listSources,
  listBuckets,
  indexPaths,
  removePaths,
  getStats,
  clearIndex,
  shutdown
};
