/**
 * PSF Git Integration - Entry Point
 * isomorphic-git wrapper for pure JavaScript git operations
 * 
 * @module git-integration
 * @version 1.1.2 - March 5, 2026
 */

const gitOperations = require('./git-operations');
const gitContext = require('./git-context');

let initialized = false;

/**
 * Initialize git integration
 */
async function initialize() {
  if (initialized) return true;
  
  try {
    await gitOperations.initialize();
    initialized = true;
    console.log('[Git] Integration initialized');
    return true;
  } catch (err) {
    console.error('[Git] Initialization failed:', err);
    return false;
  }
}

/**
 * Get repository status
 * @param {string} repoPath - Path to repository
 * @returns {Promise<Object>} Status object
 */
async function status(repoPath) {
  return gitOperations.status(repoPath);
}

/**
 * Get diff for working directory or specific commit
 * @param {string} repoPath - Path to repository
 * @param {Object} options - Diff options
 * @returns {Promise<Object>} Diff object
 */
async function diff(repoPath, options = {}) {
  return gitOperations.diff(repoPath, options);
}

/**
 * Create a commit
 * @param {string} repoPath - Path to repository
 * @param {string} message - Commit message
 * @param {Object} options - Commit options
 * @returns {Promise<Object>} Commit result
 */
async function commit(repoPath, message, options = {}) {
  return gitOperations.commit(repoPath, message, options);
}

/**
 * Get commit log
 * @param {string} repoPath - Path to repository
 * @param {Object} options - Log options
 * @returns {Promise<Array>} Array of commits
 */
async function log(repoPath, options = {}) {
  return gitOperations.log(repoPath, options);
}

/**
 * Get blame for a file
 * @param {string} repoPath - Path to repository
 * @param {string} filePath - Relative file path
 * @returns {Promise<Array>} Blame annotations
 */
async function blame(repoPath, filePath) {
  return gitOperations.blame(repoPath, filePath);
}

/**
 * Clone a repository
 * @param {string} url - Repository URL
 * @param {string} destPath - Destination path
 * @param {Object} options - Clone options
 * @returns {Promise<Object>} Clone result
 */
async function clone(url, destPath, options = {}) {
  return gitOperations.clone(url, destPath, options);
}

/**
 * Extract git context for RAG
 * @param {string} repoPath - Path to repository
 * @param {Object} options - Context options
 * @returns {Promise<Object>} Context for embedding
 */
async function extractContext(repoPath, options = {}) {
  return gitContext.extract(repoPath, options);
}

/**
 * Check if path is a git repository
 * @param {string} repoPath - Path to check
 * @returns {Promise<boolean>}
 */
async function isRepo(repoPath) {
  return gitOperations.isRepo(repoPath);
}

/**
 * Get current branch
 * @param {string} repoPath - Path to repository
 * @returns {Promise<string>} Branch name
 */
async function currentBranch(repoPath) {
  return gitOperations.currentBranch(repoPath);
}

/**
 * List branches
 * @param {string} repoPath - Path to repository
 * @returns {Promise<Array>} Branch list
 */
async function listBranches(repoPath) {
  return gitOperations.listBranches(repoPath);
}

/**
 * Checkout branch or commit
 * @param {string} repoPath - Path to repository
 * @param {string} ref - Branch name or commit SHA
 * @returns {Promise<Object>} Checkout result
 */
async function checkout(repoPath, ref) {
  return gitOperations.checkout(repoPath, ref);
}

module.exports = {
  initialize,
  status,
  diff,
  commit,
  log,
  blame,
  clone,
  extractContext,
  isRepo,
  currentBranch,
  listBranches,
  checkout
};
