/**
 * PSF RAG Engine - Embeddings Service
 * Ollama embedding calls with caching
 * 
 * @module rag-embeddings
 * @version 1.1.3 - March 5, 2026
 */

const ragConfig = require('./rag-config');

let ollamaPort = 11434;
let cache = new Map();
let config = null;

/**
 * Initialize embeddings service
 * @param {number} port - Ollama port
 */
async function initialize(port = 11434) {
  ollamaPort = port;
  config = ragConfig.getConfig();
  cache.clear();
  
  // Verify embedding model is available
  try {
    await verifyModel();
    console.log(`[RAG:Embeddings] Initialized with model: ${config.embeddingModel}`);
  } catch (err) {
    console.error('[RAG:Embeddings] Model verification failed:', err.message);
    throw err;
  }
}

/**
 * Verify embedding model is loaded in Ollama
 */
async function verifyModel() {
  const response = await fetch(`http://127.0.0.1:${ollamaPort}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama not responding: ${response.status}`);
  }
  
  const data = await response.json();
  const models = data.models || [];
  const hasModel = models.some(m => m.name.includes(config.embeddingModel));
  
  if (!hasModel) {
    console.warn(`[RAG:Embeddings] Model ${config.embeddingModel} not found, will pull on first use`);
  }
}

/**
 * Get embedding for text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
async function embed(text) {
  // Check cache
  const cacheKey = hashText(text);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  // Call Ollama
  const response = await fetch(`http://127.0.0.1:${ollamaPort}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.embeddingModel,
      prompt: text
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding failed: ${error}`);
  }
  
  const data = await response.json();
  const embedding = data.embedding;
  
  // Cache result (with LRU eviction)
  if (cache.size >= config.cacheSize) {
    // Remove oldest entry
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(cacheKey, embedding);
  
  return embedding;
}

/**
 * Batch embed multiple texts
 * @param {string[]} texts - Texts to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedBatch(texts) {
  const results = [];
  const toEmbed = [];
  const toEmbedIndices = [];
  
  // Check cache first
  for (let i = 0; i < texts.length; i++) {
    const cacheKey = hashText(texts[i]);
    if (cache.has(cacheKey)) {
      results[i] = cache.get(cacheKey);
    } else {
      toEmbed.push(texts[i]);
      toEmbedIndices.push(i);
    }
  }
  
  // Embed remaining in batches
  const batchSize = config.batchSize || 32;
  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);
    const batchIndices = toEmbedIndices.slice(i, i + batchSize);
    
    // Process batch (sequentially for now, Ollama doesn't support batch API)
    for (let j = 0; j < batch.length; j++) {
      const embedding = await embed(batch[j]);
      results[batchIndices[j]] = embedding;
    }
    
    // Progress logging for large batches
    if (toEmbed.length > 100 && i % 100 === 0) {
      console.log(`[RAG:Embeddings] Progress: ${i}/${toEmbed.length}`);
    }
  }
  
  return results;
}

/**
 * Simple hash for cache key
 * @param {string} text - Text to hash
 * @returns {string} Hash string
 */
function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  return {
    size: cache.size,
    maxSize: config?.cacheSize || 0,
    hitRate: 'N/A'  // Would need tracking
  };
}

/**
 * Clear embedding cache
 */
function clearCache() {
  cache.clear();
  console.log('[RAG:Embeddings] Cache cleared');
}

/**
 * Shutdown embeddings service
 */
async function shutdown() {
  cache.clear();
  console.log('[RAG:Embeddings] Shutdown complete');
}

module.exports = {
  initialize,
  embed,
  embedBatch,
  getCacheStats,
  clearCache,
  shutdown
};
