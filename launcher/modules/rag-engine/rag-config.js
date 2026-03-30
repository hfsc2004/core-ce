/**
 * PSF RAG Engine - Configuration
 * Edition-specific limits and settings
 * 
 * @module rag-config
 * @version 1.1.3 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');

// Edition tier configurations
const EDITION_CONFIGS = {
  standard: {
    edition: 'standard',
    maxVectors: 50000,           // ~500 files
    chunkSize: 512,              // tokens
    chunkOverlap: 50,            // tokens
    maxFileSize: 100 * 1024,     // 100KB
    maxTotalSize: 50 * 1024 * 1024,  // 50MB
    embeddingModel: 'nomic-embed-text',
    embeddingDimensions: 768,
    batchSize: 32,
    cacheSize: 10000             // LRU cache entries
  },
  
  enterprise: {
    edition: 'enterprise',
    maxVectors: 500000,          // ~5,000 files
    chunkSize: 1024,             // tokens
    chunkOverlap: 100,           // tokens
    maxFileSize: 1024 * 1024,    // 1MB
    maxTotalSize: 500 * 1024 * 1024,  // 500MB
    embeddingModel: 'nomic-embed-text',
    embeddingDimensions: 768,
    batchSize: 64,
    cacheSize: 50000
  },
  
  datacenter: {
    edition: 'datacenter',
    maxVectors: -1,              // Unlimited
    chunkSize: 2048,             // tokens
    chunkOverlap: 200,           // tokens
    maxFileSize: 10 * 1024 * 1024,   // 10MB
    maxTotalSize: -1,            // Unlimited
    embeddingModel: 'nomic-embed-text',
    embeddingDimensions: 768,
    batchSize: 128,
    cacheSize: 100000,
    distributed: true            // Future: distributed FAISS
  }
};

// Supported file extensions for indexing
const SUPPORTED_EXTENSIONS = {
  code: [
    '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
    '.py', '.pyw',
    '.rs',
    '.go',
    '.java', '.kt', '.scala',
    '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx',
    '.cs',
    '.rb',
    '.php',
    '.swift',
    '.sh', '.bash', '.zsh',
    '.sql',
    '.r', '.R'
  ],
  config: [
    '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
    '.env', '.env.local', '.env.example'
  ],
  docs: [
    '.md', '.markdown', '.rst', '.txt', '.adoc'
  ],
  web: [
    '.html', '.htm', '.css', '.scss', '.sass', '.less'
  ]
};

// Patterns to ignore during indexing
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.svn',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock'
];

let currentConfig = null;

/**
 * Detect current edition
 * @returns {string} 'standard' | 'enterprise' | 'datacenter'
 */
function detectEdition() {
  // Check environment variable first
  const envEdition = process.env.PSF_EDITION;
  if (envEdition && EDITION_CONFIGS[envEdition.toLowerCase()]) {
    return envEdition.toLowerCase();
  }
  
  // Check for datacenter markers
  const dcMarkers = [
    '/etc/psf/datacenter.conf',
    '/var/lib/psf/dc.license'
  ];
  for (const marker of dcMarkers) {
    if (fs.existsSync(marker)) {
      return 'datacenter';
    }
  }
  
  // Check for enterprise markers
  const enterpriseMarkers = [
    path.join(process.cwd(), 'config', 'enterprise.license'),
    path.join(process.cwd(), 'config', 'rbac-policy.json')
  ];
  for (const marker of enterpriseMarkers) {
    if (fs.existsSync(marker)) {
      return 'enterprise';
    }
  }
  
  // Default to standard
  return 'standard';
}

/**
 * Get current configuration
 * @returns {Object} Configuration object
 */
function getConfig() {
  if (!currentConfig) {
    const edition = detectEdition();
    currentConfig = { ...EDITION_CONFIGS[edition] };
    console.log(`[RAG:Config] Detected edition: ${edition}`);
  }
  return currentConfig;
}

/**
 * Override configuration (for testing)
 * @param {Object} overrides - Configuration overrides
 */
function setConfigOverrides(overrides) {
  const edition = detectEdition();
  currentConfig = { ...EDITION_CONFIGS[edition], ...overrides };
}

/**
 * Check if file extension is supported
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function isSupportedFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const allExtensions = [
    ...SUPPORTED_EXTENSIONS.code,
    ...SUPPORTED_EXTENSIONS.config,
    ...SUPPORTED_EXTENSIONS.docs,
    ...SUPPORTED_EXTENSIONS.web
  ];
  return allExtensions.includes(ext);
}

/**
 * Check if path should be ignored
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function shouldIgnore(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return IGNORE_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(normalized);
    }
    return normalized.includes(pattern);
  });
}

/**
 * Get file category
 * @param {string} filePath - File path
 * @returns {string} 'code' | 'config' | 'docs' | 'web' | 'unknown'
 */
function getFileCategory(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [category, extensions] of Object.entries(SUPPORTED_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }
  return 'unknown';
}

module.exports = {
  getConfig,
  setConfigOverrides,
  detectEdition,
  isSupportedFile,
  shouldIgnore,
  getFileCategory,
  SUPPORTED_EXTENSIONS,
  IGNORE_PATTERNS
};
