/**
 * Pseudo Science Fiction Core Collection - Path Manager Common Utilities
 * SHARED LOGIC - Platform-agnostic functions used by all implementations
 * 
 * This file contains functions that work identically across all platforms.
 * No platform-specific code (no if/else on process.platform).
 * 
 * @module path-manager-common
 * @version 1.1.3 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const path = require('path');
const os = require('os');

// ============================================================================
// Platform Detection (shared utilities)
// ============================================================================

/**
 * Get the current OS platform
 * @returns {string} 'win32', 'darwin', or 'linux'
 */
function getOS() {
  return process.platform;
}

/**
 * Get the current architecture
 * @returns {string} 'x64', 'arm64', 'arm', etc.
 */
function getArchitecture() {
  return process.arch;
}

// ============================================================================
// Directory Path Resolution (shared)
// ============================================================================

/**
 * Get base project directory
 * Assumes module is in launcher/modules/
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Absolute path to project root
 */
function getProjectRoot(fromPath) {
  // If called from launcher/modules/, go up 2 levels
  // If called from launcher/, go up 1 level
  
  // Detect if we're in modules folder
  if (fromPath.includes('modules')) {
    return path.join(fromPath, '..', '..');
  }
  
  // Otherwise assume we're in launcher
  return path.join(fromPath, '..');
}

/**
 * Get path to binaries directory
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Absolute path to binaries/
 */
function getBinariesDir(fromPath) {
  return path.join(getProjectRoot(fromPath), 'binaries');
}

/**
 * Get path to models directory
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Absolute path to models/
 */
function getModelsDir(fromPath) {
  return path.join(getProjectRoot(fromPath), 'models');
}

/**
 * Get path to licenses directory
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Absolute path to licenses/
 */
function getLicensesDir(fromPath) {
  return path.join(getProjectRoot(fromPath), 'licenses');
}

/**
 * Get path to docs directory
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Absolute path to docs/
 */
function getDocsDir(fromPath) {
  return path.join(getProjectRoot(fromPath), 'docs');
}

// ============================================================================
// Binary Path Resolution (dispatcher - delegates to platform modules)
// ============================================================================

/**
 * Get platform-specific binary path
 * This function delegates to platform-specific implementations
 * @param {string} binaryType - Type of binary ('ollama', 'python-webui', etc.)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Absolute path to binary
 */
function getBinaryPath(binaryType, fromPath, platformKey = null) {
  // This function exists in common for compatibility
  // But actual implementation is in platform-specific files
  const indexModule = require('./path-manager.js');
  
  switch (binaryType) {
    case 'ollama':
      return indexModule.getOllamaBinaryPath(fromPath, platformKey);
      
    case 'python-webui':
      return indexModule.getPythonWebUIPath(fromPath, platformKey);
      
    case 'anythingllm':
      return indexModule.getAnythingLLMPath(fromPath, platformKey);
      
    default:
      throw new Error(`Unknown binary type: ${binaryType}`);
  }
}

// ============================================================================
// Model Path Resolution (shared)
// ============================================================================

/**
 * Get path to a model file
 * @param {string} collectionId - Collection ID
 * @param {string} modelId - Model ID
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to model file
 */
function getModelPath(collectionId, modelId, fromPath) {
  const modelsDir = getModelsDir(fromPath);
  return path.join(modelsDir, collectionId, `${modelId}.gguf`);
}

/**
 * Get path to a collection directory
 * @param {string} collectionId - Collection ID
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to collection directory
 */
function getCollectionDir(collectionId, fromPath) {
  const modelsDir = getModelsDir(fromPath);
  return path.join(modelsDir, collectionId);
}

/**
 * Get path to model blobs directory
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to blobs directory
 */
function getBlobsDir(fromPath) {
  const modelsDir = getModelsDir(fromPath);
  return path.join(modelsDir, 'blobs');
}

/**
 * Get path to model manifests directory
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to manifests directory
 */
function getManifestsDir(fromPath) {
  const modelsDir = getModelsDir(fromPath);
  return path.join(modelsDir, 'manifests');
}

// ============================================================================
// Catalog Path Resolution (shared)
// ============================================================================

/**
 * Get path to master catalog
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to catalog-master.json
 */
function getMasterCatalogPath(fromPath) {
  const modelsDir = getModelsDir(fromPath);
  return path.join(modelsDir, 'catalog-master.json');
}

/**
 * Get path to active catalog
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to catalog.json
 */
function getCatalogPath(fromPath) {
  const modelsDir = getModelsDir(fromPath);
  return path.join(modelsDir, 'catalog.json');
}

/**
 * Get path to SKU-specific catalog
 * @param {string} skuId - SKU ID (e.g., '001', '005')
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to catalog-sku-XXX.json
 */
function getSKUCatalogPath(skuId, fromPath) {
  const modelsDir = getModelsDir(fromPath);
  return path.join(modelsDir, `catalog-sku-${skuId}.json`);
}

/**
 * Get path to SKU config
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to sku-config.json
 */
function getSKUConfigPath(fromPath) {
  const modelsDir = getModelsDir(fromPath);
  return path.join(modelsDir, 'sku-config.json');
}

// ============================================================================
// Configuration Path Resolution (shared)
// ============================================================================

/**
 * Get path to binary versions config
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to binary-versions.json
 */
function getBinaryVersionsPath(fromPath) {
  const modelsDir = getModelsDir(fromPath);
  return path.join(modelsDir, 'binary-versions.json');
}

/**
 * Get path to compile configs directory
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to compile-configs/
 */
function getCompileConfigsDir(fromPath) {
  const launcherDir = path.join(getProjectRoot(fromPath), 'launcher');
  return path.join(launcherDir, 'compile-configs');
}

/**
 * Get path to specific compile config
 * @param {string} configName - Config name (without .json)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to compile config file
 */
function getCompileConfigPath(configName, fromPath) {
  const configsDir = getCompileConfigsDir(fromPath);
  return path.join(configsDir, `${configName}.json`);
}

// ============================================================================
// License Path Resolution (shared)
// ============================================================================

/**
 * Get path to specific license file
 * @param {string} filename - License filename
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to license file
 */
function getLicensePath(filename, fromPath) {
  const licensesDir = getLicensesDir(fromPath);
  return path.join(licensesDir, filename);
}

// ============================================================================
// Utility Functions (shared)
// ============================================================================

/**
 * Check if path is relative to project
 * @param {string} targetPath - Path to check
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {boolean} True if path is within project
 */
function isPathInProject(targetPath, fromPath) {
  const projectRoot = getProjectRoot(fromPath);
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(projectRoot);
}

/**
 * Get platform-specific path separator
 * @returns {string} Path separator ('\\' on Windows, '/' elsewhere)
 */
function getPathSeparator() {
  return path.sep;
}

/**
 * Normalize path for current platform
 * @param {string} inputPath - Path to normalize
 * @returns {string} Normalized path
 */
function normalizePath(inputPath) {
  return path.normalize(inputPath);
}

/**
 * Check if we're running in packaged app or development
 * @returns {boolean} True if packaged (AppImage, DMG, etc.)
 */
function isPackaged() {
  // Electron's app.isPackaged equivalent
  return process.mainModule && process.mainModule.filename.indexOf('app.asar') !== -1;
}

/**
 * Get resource path (handles both dev and packaged)
 * @param {string} resourcePath - Relative resource path
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Absolute path to resource
 */
function getResourcePath(resourcePath, fromPath) {
  if (isPackaged()) {
    // In packaged app, resources are in resources/ folder
    return path.join(process.resourcesPath, resourcePath);
  } else {
    // In development, relative to project root
    return path.join(getProjectRoot(fromPath), resourcePath);
  }
}

// ============================================================================
// Platform Information (shared)
// ============================================================================

/**
 * Get comprehensive platform information
 * @returns {Object} Platform details
 */
function getPlatformInfo() {
  const indexModule = require('./path-manager.js');
  
  return {
    platform: getOS(),
    architecture: getArchitecture(),
    platformKey: indexModule.getPlatformKey(),
    separator: getPathSeparator(),
    executableExt: indexModule.getExecutableExtension(),
    isPackaged: isPackaged(),
    nodeVersion: process.version,
    osVersion: os.release(),
    osType: os.type()
  };
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // Platform detection
  getOS,
  getArchitecture,
  getPlatformInfo,
  
  // Directory paths
  getProjectRoot,
  getBinariesDir,
  getModelsDir,
  getLicensesDir,
  getDocsDir,
  
  // Binary paths (dispatcher)
  getBinaryPath,
  
  // Model paths
  getModelPath,
  getCollectionDir,
  getBlobsDir,
  getManifestsDir,
  
  // Catalog paths
  getMasterCatalogPath,
  getCatalogPath,
  getSKUCatalogPath,
  getSKUConfigPath,
  
  // Config paths
  getBinaryVersionsPath,
  getCompileConfigsDir,
  getCompileConfigPath,
  
  // License paths
  getLicensePath,
  
  // Utilities
  isPathInProject,
  getPathSeparator,
  normalizePath,
  isPackaged,
  getResourcePath
};
