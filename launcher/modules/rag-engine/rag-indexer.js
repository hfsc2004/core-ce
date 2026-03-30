/**
 * PSF RAG Engine - Indexer
 * File walking and vector indexing
 * 
 * @module rag-indexer
 * @version 1.1.3 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');
const ragConfig = require('./rag-config');
const ragChunker = require('./rag-chunker');
const ragEmbeddings = require('./rag-embeddings');
const ragCommon = require('./rag-engine-common');

/**
 * Index paths (files or directories)
 * @param {string[]} paths - Paths to index
 * @param {Object} options - Indexing options
 * @returns {Promise<Object>} Results
 */
async function indexPaths(paths, options = {}) {
  const results = {
    indexed: 0,
    skipped: 0,
    errors: [],
    sources: []
  };
  const filesToIndex = [];

  for (const p of paths) {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        const files = walkDirectory(p);
        for (const f of files) filesToIndex.push(f);
      } else if (stat.isFile()) {
        filesToIndex.push(p);
      }
    } catch (err) {
      results.errors.push({ path: p, error: err.message });
    }
  }

  await processFileList(filesToIndex, results, options);

  console.log(`[RAG:Indexer] Indexed: ${results.indexed}, Skipped: ${results.skipped}, Errors: ${results.errors.length}`);
  return results;
}

/**
 * Index a directory recursively
 */
async function indexDirectory(dirPath, options = {}) {
  const results = { indexed: 0, skipped: 0, errors: [], sources: [] };
  const files = walkDirectory(dirPath);
  console.log(`[RAG:Indexer] Found ${files.length} files in ${dirPath}`);
  await processFileList(files, results, options);
  return results;
}

async function processFileList(files, results, options = {}) {
  const batchSize = options.batchSize || 10;
  const total = files.length;
  let processed = 0;

  emitProgress(options, {
    phase: 'start',
    current: 0,
    total,
    percent: total > 0 ? 0 : 100,
    indexed: results.indexed,
    skipped: results.skipped,
    errors: results.errors.length
  });

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    for (const filePath of batch) {
      try {
        const result = await indexFile(filePath, options);
        if (result.success) {
          results.indexed++;
          if (result.preview) {
            results.sources.push(result.preview);
          }
        } else if (result.skipped) {
          results.skipped++;
        } else {
          results.errors.push({ path: filePath, error: result.error });
        }
      } catch (err) {
        results.errors.push({ path: filePath, error: err.message });
      }

      processed++;
      emitProgress(options, {
        phase: 'indexing',
        filePath,
        current: processed,
        total,
        percent: total > 0 ? Math.round((processed / total) * 100) : 100,
        indexed: results.indexed,
        skipped: results.skipped,
        errors: results.errors.length
      });
    }

    if (files.length > 50 && i % 50 === 0) {
      console.log(`[RAG:Indexer] Progress: ${i}/${files.length}`);
    }
  }

  emitProgress(options, {
    phase: 'done',
    current: processed,
    total,
    percent: 100,
    indexed: results.indexed,
    skipped: results.skipped,
    errors: results.errors.length
  });
}

function emitProgress(options, payload) {
  if (typeof options.onProgress === 'function') {
    try {
      options.onProgress(payload);
    } catch (err) {
      console.warn('[RAG:Indexer] Progress callback error:', err.message);
    }
  }
}

/**
 * Index a single file
 */
async function indexFile(filePath, options = {}) {
  const config = ragConfig.getConfig();
  const bucketId = normalizeBucketId(options.bucketId || 'default');
  const bucketLabel = String(options.bucketLabel || bucketId);
  
  // Check if supported
  if (!ragConfig.isSupportedFile(filePath)) {
    return { skipped: true, reason: 'unsupported file type' };
  }
  
  // Check if should be ignored
  if (ragConfig.shouldIgnore(filePath)) {
    return { skipped: true, reason: 'ignored path' };
  }
  
  // Check file size
  const stat = fs.statSync(filePath);
  if (stat.size > config.maxFileSize) {
    return { skipped: true, reason: 'file too large' };
  }
  
  // Read content
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { success: false, error: `read error: ${err.message}` };
  }
  
  // Chunk the content
  const chunks = ragChunker.chunk(content, filePath);
  
  if (chunks.length === 0) {
    return { skipped: true, reason: 'no chunks generated' };
  }

  const preview = {
    filePath,
    startLine: chunks[0].startLine,
    endLine: chunks[0].endLine,
    text: chunks[0].text.substring(0, 500),
    category: ragConfig.getFileCategory(filePath),
    indexedAt: Date.now(),
    retrieval: 'indexed-source',
    bucketId,
    bucketLabel
  };

  // Get embeddings for chunks
  const texts = chunks.map(c => c.text);
  let embeddings;
  try {
    embeddings = await ragEmbeddings.embedBatch(texts);
  } catch (err) {
    // Source-only fallback: keep file in source index even if embedding backend is unavailable.
    return {
      success: true,
      sourceOnly: true,
      chunks: 0,
      preview,
      warning: `embedding unavailable: ${err.message}`
    };
  }
  
  // Create vector items
  const items = chunks.map((chunk, i) => ({
    id: generateChunkId(filePath, chunk.startLine, bucketId),
    vector: embeddings[i],
    metadata: {
      filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      text: chunk.text.substring(0, 500),  // Truncate for metadata
      category: ragConfig.getFileCategory(filePath),
      indexedAt: Date.now(),
      bucketId,
      bucketLabel
    }
  }));
  
  // Add to vector store
  try {
    const added = await ragCommon.addVectors(items);
    return { success: true, chunks: added, preview };
  } catch (err) {
    return {
      success: true,
      sourceOnly: true,
      chunks: 0,
      preview,
      warning: `vector store unavailable: ${err.message}`
    };
  }
}

/**
 * Walk directory and return all files
 */
function walkDirectory(dirPath, files = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    // Skip ignored paths
    if (ragConfig.shouldIgnore(fullPath)) {
      continue;
    }
    
    if (entry.isDirectory()) {
      walkDirectory(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Generate unique chunk ID
 */
function generateChunkId(filePath, startLine, bucketId = 'default') {
  const hash = simpleHash(`${bucketId}:${filePath}`);
  return `chunk_${hash}_${startLine}`;
}

function normalizeBucketId(input) {
  return String(input || 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'default';
}

/**
 * Simple string hash
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

module.exports = {
  indexPaths,
  indexDirectory,
  indexFile,
  walkDirectory
};
