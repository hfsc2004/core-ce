/**
 * PSF RAG Engine - Common/Vector Store Orchestration
 * Vectra-based vector storage and retrieval
 * 
 * @module rag-engine-common
 * @version 1.1.3 - March 5, 2026
 */

const path = require('path');
const fs = require('fs');

// Vectra will be loaded dynamically
let LocalIndex = null;
let index = null;
let config = null;
let stats = { vectorCount: 0, sizeBytes: 0 };

/**
 * Initialize vector store
 * @param {Object} cfg - Configuration from rag-config
 */
async function initialize(cfg) {
  config = cfg;
  
  try {
    // Dynamic import of vectra
    const vectra = require('vectra');
    LocalIndex = vectra.LocalIndex;
    
    // Create index directory
    const indexPath = path.join(__dirname, '../../data/rag-index');
    if (!fs.existsSync(indexPath)) {
      fs.mkdirSync(indexPath, { recursive: true });
    }
    
    // Initialize or load existing index
    index = new LocalIndex(indexPath);
    
    if (!await index.isIndexCreated()) {
      await index.createIndex();
      console.log('[RAG:Common] Created new vector index');
    } else {
      console.log('[RAG:Common] Loaded existing vector index');
    }
    
    // Update stats
    await updateStats();
    
    console.log('[RAG:Common] Vector store initialized');
  } catch (err) {
    console.error('[RAG:Common] Failed to initialize:', err);
    throw err;
  }
}

/**
 * Add vectors to index
 * @param {Array} items - Array of { id, vector, metadata }
 * @returns {Promise<number>} Number of items added
 */
async function addVectors(items) {
  if (!index) throw new Error('Vector store not initialized');
  
  // Check capacity (if not unlimited)
  if (config.maxVectors > 0) {
    const remaining = config.maxVectors - stats.vectorCount;
    if (items.length > remaining) {
      console.warn(`[RAG:Common] Capacity limit: can only add ${remaining} of ${items.length} vectors`);
      items = items.slice(0, remaining);
    }
  }
  
  if (items.length === 0) return 0;
  
  await index.beginUpdate();
  
  for (const item of items) {
    await index.insertItem({
      id: item.id,
      vector: item.vector,
      metadata: item.metadata
    });
  }
  
  await index.endUpdate();
  await updateStats();
  
  return items.length;
}

/**
 * Search for similar vectors
 * @param {number[]} queryVector - Query embedding
 * @param {number} topK - Number of results
 * @param {number} threshold - Minimum similarity (0-1)
 * @returns {Promise<Array>} Search results
 */
async function search(queryVector, topK = 5, threshold = 0.7) {
  if (!index) throw new Error('Vector store not initialized');
  
  const results = await index.queryItems(queryVector, topK);
  
  // Filter by threshold and format results
  return results
    .filter(r => r.score >= threshold)
    .map(r => ({
      id: r.item.id,
      score: r.score,
      metadata: r.item.metadata
    }));
}

/**
 * Remove vectors by IDs
 * @param {string[]} ids - Vector IDs to remove
 * @returns {Promise<number>} Number removed
 */
async function removeByIds(ids) {
  if (!index) throw new Error('Vector store not initialized');
  
  await index.beginUpdate();
  
  let removed = 0;
  for (const id of ids) {
    try {
      await index.deleteItem(id);
      removed++;
    } catch (err) {
      // Item may not exist
    }
  }
  
  await index.endUpdate();
  await updateStats();
  
  return removed;
}

/**
 * Remove vectors by file paths
 * @param {string[]} paths - File paths to remove
 * @returns {Promise<number>} Number removed
 */
async function removeByPaths(paths, options = {}) {
  if (!index) throw new Error('Vector store not initialized');
  
  const targetBucket = String(options.bucketId || '').trim().toLowerCase();
  // List all items and find matching paths
  const allItems = await index.listItems();
  const idsToRemove = allItems
    .filter((item) => {
      const itemBucket = String(item.metadata?.bucketId || '').trim().toLowerCase();
      if (targetBucket && itemBucket !== targetBucket) return false;
      return paths.some(p => item.metadata?.filePath?.startsWith(p));
    })
    .map(item => item.id);
  
  return removeByIds(idsToRemove);
}

/**
 * Remove vectors by bucket ID
 * @param {string} bucketId - Bucket identifier
 * @returns {Promise<number>} Number removed
 */
async function removeByBucket(bucketId) {
  if (!index) throw new Error('Vector store not initialized');
  const targetBucket = String(bucketId || '').trim().toLowerCase();
  if (!targetBucket) return 0;

  const allItems = await index.listItems();
  const idsToRemove = allItems
    .filter((item) => String(item.metadata?.bucketId || '').trim().toLowerCase() === targetBucket)
    .map((item) => item.id);
  return removeByIds(idsToRemove);
}

/**
 * Clear all vectors
 */
async function clear() {
  if (!index) return;
  
  const indexPath = path.join(__dirname, '../../data/rag-index');
  
  // Delete and recreate
  await index.deleteIndex();
  await index.createIndex();
  
  stats = { vectorCount: 0, sizeBytes: 0 };
  console.log('[RAG:Common] Index cleared');
}

/**
 * Update statistics
 */
async function updateStats() {
  if (!index) return;
  
  try {
    const items = await index.listItems();
    stats.vectorCount = items.length;
    
    // Estimate size (768 dims * 4 bytes * count + metadata overhead)
    stats.sizeBytes = stats.vectorCount * (config.embeddingDimensions * 4 + 500);
  } catch (err) {
    console.warn('[RAG:Common] Stats update failed:', err.message);
  }
}

/**
 * Get current statistics
 * @returns {Object} Stats object
 */
function getStats() {
  return { ...stats };
}

/**
 * List indexed items
 * @param {number} limit - Max items to return (0 = all)
 * @returns {Promise<Array>} Indexed items
 */
async function listItems(limit = 0) {
  if (!index) throw new Error('Vector store not initialized');
  const items = await index.listItems();
  if (limit > 0) {
    return items.slice(0, limit);
  }
  return items;
}

/**
 * Shutdown vector store
 */
async function shutdown() {
  index = null;
  console.log('[RAG:Common] Vector store shutdown');
}

module.exports = {
  initialize,
  addVectors,
  search,
  removeByIds,
  removeByPaths,
  removeByBucket,
  clear,
  getStats,
  listItems,
  shutdown
};
