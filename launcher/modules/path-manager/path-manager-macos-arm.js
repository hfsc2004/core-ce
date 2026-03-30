/**
 * Pseudo Science Fiction Core Collection - Path Manager Module
 * MACOS ARM (APPLE SILICON) IMPLEMENTATION
 * 
 * Platform-specific path resolution for macOS Apple Silicon (M1/M2/M3/M4) systems.
 * This file contains ONLY macOS ARM-specific logic.
 * 
 * STATUS: ðŸŸ¡ UNTESTED - Extracted from original code but not verified
 * 
 * Key Differences from Other Platforms:
 * - No .exe extension on binaries
 * - Uses 'bin/python' (not 'Scripts/python.exe')
 * - Uses -macos.sh build scripts
 * - Uses 'macos-arm' directory structure
 * - May support universal binaries (fallback to 'macos' folder)
 * - Optimized for Apple Silicon architecture
 * 
 * @module path-manager-macos-arm
 * @version 1.1.3 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const path = require('path');
const fs = require('fs');

// Import common utilities for directory resolution
const common = require('./path-manager-common.js');

// ============================================================================
// Platform-Specific Binary Path Resolution
// ============================================================================

/**
 * Get Ollama binary path (macOS ARM)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to Ollama binary
 */
function getOllamaBinaryPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'macos-arm';
  
  // macOS: Check if we need platform-specific or can use universal binary
  const universalPath = path.join(binariesDir, 'ollama', 'macos', 'bin', 'ollama');
  const platformPath = path.join(binariesDir, 'ollama', key, 'bin', 'ollama');
  
  // Prefer platform-specific if it exists, otherwise try universal
  if (fs.existsSync(platformPath)) {
    return platformPath;
  } else if (fs.existsSync(universalPath)) {
    return universalPath;
  } else {
    // Return platform-specific path even if doesn't exist (for error messages)
    return platformPath;
  }
}

/**
 * Get Ollama binary path (alias for compatibility)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to Ollama binary
 */
function getOllamaPath(fromPath, platformKey = null) {
  return getOllamaBinaryPath(fromPath, platformKey);
}

/**
 * Get Python WebUI Python executable path (macOS ARM)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to Python executable in venv
 */
function getPythonWebUIPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'macos-arm';
  
  // macOS ARM: Uses 'bin/python' (same as Linux)
  return path.join(binariesDir, 'python-webui', key, 'venv', 'bin', 'python');
}

/**
 * Get AnythingLLM path (macOS ARM)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to AnythingLLM
 */
function getAnythingLLMPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'macos-arm';
  
  // AnythingLLM is Node-based, same structure across platforms
  return path.join(binariesDir, 'anythingllm', key, 'server', 'index.js');
}

/**
 * Get Python WebUI build script path (macOS ARM)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to build-python-webui-macos.sh
 */
function getPythonWebUIBuildScript(fromPath) {
  const projectRoot = common.getProjectRoot(fromPath);
  
  // macOS ARM: Uses -macos.sh build script (special for Homebrew Python paths)
  // Same script as Intel (detects architecture internally)
  return path.join(projectRoot, 'launcher', 'build-python-webui-macos.sh');
}

/**
 * Get platform-specific executable extension (macOS ARM)
 * @returns {string} Empty string (macOS has no extension)
 */
function getExecutableExtension() {
  // macOS ARM: No extension for executables
  return '';
}

/**
 * Get platform key identifier (macOS ARM)
 * @returns {string} Platform identifier string
 */
function getPlatformKey() {
  return 'macos-arm';
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  getOllamaBinaryPath,
  getOllamaPath,
  getPythonWebUIPath,
  getAnythingLLMPath,
  getPythonWebUIBuildScript,
  getExecutableExtension,
  getPlatformKey
};
