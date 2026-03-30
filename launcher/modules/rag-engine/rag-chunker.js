/**
 * PSF RAG Engine - Code-Aware Chunker
 * Intelligent text splitting that respects code structure
 * 
 * @module rag-chunker
 * @version 1.1.3 - March 5, 2026
 */

const ragConfig = require('./rag-config');

/**
 * Chunk text based on file type
 * @param {string} content - File content
 * @param {string} filePath - File path (for type detection)
 * @param {Object} options - Chunking options
 * @returns {Array<{text: string, startLine: number, endLine: number}>}
 */
function chunk(content, filePath, options = {}) {
  const config = ragConfig.getConfig();
  const chunkSize = options.chunkSize || config.chunkSize;
  const overlap = options.overlap || config.chunkOverlap;
  
  const category = ragConfig.getFileCategory(filePath);
  const ext = filePath.split('.').pop().toLowerCase();
  
  switch (category) {
    case 'code':
      return chunkCode(content, ext, chunkSize, overlap);
    case 'docs':
      return chunkMarkdown(content, chunkSize, overlap);
    case 'config':
      return chunkConfig(content, ext, chunkSize, overlap);
    default:
      return chunkPlainText(content, chunkSize, overlap);
  }
}

/**
 * Chunk code files - respect function/class boundaries
 */
function chunkCode(content, ext, chunkSize, overlap) {
  const lines = content.split('\n');
  const chunks = [];
  
  // Language-specific patterns
  const patterns = getCodePatterns(ext);
  
  let currentChunk = [];
  let chunkStartLine = 0;
  let currentTokens = 0;
  let blockDepth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line);
    
    // Track block depth
    blockDepth += (line.match(patterns.blockStart) || []).length;
    blockDepth -= (line.match(patterns.blockEnd) || []).length;
    blockDepth = Math.max(0, blockDepth);
    
    currentChunk.push(line);
    currentTokens += lineTokens;
    
    // Check if we should split
    const atBoundary = blockDepth === 0 && patterns.boundary.test(line);
    const overSize = currentTokens >= chunkSize;
    
    if ((atBoundary || overSize) && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join('\n'),
        startLine: chunkStartLine,
        endLine: i
      });
      
      // Start new chunk with overlap
      const overlapLines = Math.ceil(overlap / 10); // ~10 tokens per line estimate
      if (overlapLines > 0 && currentChunk.length > overlapLines) {
        currentChunk = currentChunk.slice(-overlapLines);
        chunkStartLine = i - overlapLines + 1;
        currentTokens = estimateTokens(currentChunk.join('\n'));
      } else {
        currentChunk = [];
        chunkStartLine = i + 1;
        currentTokens = 0;
      }
    }
  }
  
  // Add remaining
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join('\n'),
      startLine: chunkStartLine,
      endLine: lines.length - 1
    });
  }
  
  return chunks;
}

/**
 * Chunk markdown - respect header boundaries
 */
function chunkMarkdown(content, chunkSize, overlap) {
  const chunks = [];
  const sections = content.split(/(?=^#{1,6}\s)/m);
  
  let currentChunk = '';
  let startLine = 0;
  let currentLine = 0;
  
  for (const section of sections) {
    const sectionTokens = estimateTokens(section);
    const currentTokens = estimateTokens(currentChunk);
    
    if (currentTokens + sectionTokens > chunkSize && currentChunk) {
      // Save current chunk
      chunks.push({
        text: currentChunk.trim(),
        startLine,
        endLine: currentLine - 1
      });
      
      // Start new chunk
      currentChunk = section;
      startLine = currentLine;
    } else {
      currentChunk += section;
    }
    
    currentLine += section.split('\n').length;
  }
  
  // Add remaining
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      startLine,
      endLine: currentLine - 1
    });
  }
  
  return chunks;
}

/**
 * Chunk config files (JSON/YAML) - by top-level keys
 */
function chunkConfig(content, ext, chunkSize, overlap) {
  if (ext === 'json') {
    return chunkJson(content, chunkSize);
  }
  // YAML and others: fall back to plain text
  return chunkPlainText(content, chunkSize, overlap);
}

/**
 * Chunk JSON by top-level keys
 */
function chunkJson(content, chunkSize) {
  const chunks = [];
  
  try {
    const obj = JSON.parse(content);
    const keys = Object.keys(obj);
    
    for (const key of keys) {
      const value = JSON.stringify({ [key]: obj[key] }, null, 2);
      if (estimateTokens(value) <= chunkSize) {
        chunks.push({
          text: value,
          startLine: 0,
          endLine: 0,
          key
        });
      } else {
        // Large value - chunk it
        const subChunks = chunkPlainText(value, chunkSize, 0);
        chunks.push(...subChunks.map(c => ({ ...c, key })));
      }
    }
  } catch (err) {
    // Invalid JSON - fall back to plain text
    return chunkPlainText(content, chunkSize, 0);
  }
  
  return chunks;
}

/**
 * Simple line-based chunking
 */
function chunkPlainText(content, chunkSize, overlap) {
  const lines = content.split('\n');
  const chunks = [];
  
  let currentChunk = [];
  let chunkStartLine = 0;
  let currentTokens = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line);
    
    if (currentTokens + lineTokens > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join('\n'),
        startLine: chunkStartLine,
        endLine: i - 1
      });
      
      // Overlap
      const overlapLines = Math.ceil(overlap / 10);
      if (overlapLines > 0) {
        currentChunk = currentChunk.slice(-overlapLines);
        chunkStartLine = i - overlapLines;
        currentTokens = estimateTokens(currentChunk.join('\n'));
      } else {
        currentChunk = [];
        chunkStartLine = i;
        currentTokens = 0;
      }
    }
    
    currentChunk.push(line);
    currentTokens += lineTokens;
  }
  
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join('\n'),
      startLine: chunkStartLine,
      endLine: lines.length - 1
    });
  }
  
  return chunks;
}

/**
 * Get language-specific patterns
 */
function getCodePatterns(ext) {
  const patterns = {
    js: {
      blockStart: /[{(\[]/g,
      blockEnd: /[})\]]/g,
      boundary: /^(function|class|const|let|var|export|import)\s/
    },
    ts: {
      blockStart: /[{(\[]/g,
      blockEnd: /[})\]]/g,
      boundary: /^(function|class|const|let|var|export|import|interface|type)\s/
    },
    py: {
      blockStart: /:\s*$/g,
      blockEnd: /^(?!\s)/g,  // Dedent
      boundary: /^(def|class|async def)\s/
    },
    rs: {
      blockStart: /[{]/g,
      blockEnd: /[}]/g,
      boundary: /^(fn|impl|struct|enum|trait|mod)\s/
    },
    go: {
      blockStart: /[{]/g,
      blockEnd: /[}]/g,
      boundary: /^(func|type|var|const)\s/
    }
  };
  
  // Map extensions to pattern sets
  const extMap = {
    js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
    ts: 'ts', tsx: 'ts',
    py: 'py', pyw: 'py',
    rs: 'rs',
    go: 'go'
  };
  
  return patterns[extMap[ext]] || patterns.js;
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text) {
  // ~4 chars per token on average for code
  return Math.ceil(text.length / 4);
}

module.exports = {
  chunk,
  chunkCode,
  chunkMarkdown,
  chunkConfig,
  chunkPlainText,
  estimateTokens
};
