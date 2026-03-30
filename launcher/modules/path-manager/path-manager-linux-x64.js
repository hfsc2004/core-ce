/**
 * Pseudo Science Fiction Core Collection - Path Manager Module
 * LINUX X64 IMPLEMENTATION
 * 
 * Platform-specific path resolution for Linux x86_64 systems.
 * This file contains ONLY Linux-specific logic.
 * 
 * Key Differences from Other Platforms:
 * - No .exe extension on binaries
 * - Uses 'bin/python' (not 'Scripts/python.exe')
 * - Uses .sh build scripts (not .bat)
 * - Uses 'linux-x64' directory structure
 * 
 * @module path-manager-linux-x64
 * @version 1.1.3 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const path = require('path');

// Import common utilities for directory resolution
const common = require('./path-manager-common.js');

// ============================================================================
// Platform-Specific Binary Path Resolution
// ============================================================================

/**
 * Get Ollama binary path (Linux x64)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to Ollama binary
 */
function getOllamaBinaryPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'linux-x64';
  
  // Linux: Binary in bin/, libs in ../lib/ollama/ relative to binary
  return path.join(binariesDir, 'ollama', key, 'bin', 'ollama');
}

/**
 * Get Python WebUI Python executable path (Linux x64)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to Python executable in venv
 */
function getPythonWebUIPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'linux-x64';
  
  // Linux: Uses 'bin/python' (not 'Scripts/python.exe')
  return path.join(binariesDir, 'python-webui', key, 'venv', 'bin', 'python');
}

/**
 * Get AnythingLLM path (Linux x64)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to AnythingLLM
 */
function getAnythingLLMPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'linux-x64';
  
  // AnythingLLM is Node-based, same structure across platforms
  return path.join(binariesDir, 'anythingllm', key, 'server', 'index.js');
}

/**
 * Get Python WebUI build script path (Linux x64)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to build-python-webui.sh
 */
function getPythonWebUIBuildScript(fromPath) {
  const projectRoot = common.getProjectRoot(fromPath);
  
  // Linux: Uses .sh build script
  return path.join(projectRoot, 'launcher', 'build-python-webui.sh');
}

/**
 * Get platform-specific executable extension (Linux x64)
 * @returns {string} Empty string (Linux has no extension)
 */
function getExecutableExtension() {
  // Linux: No extension for executables
  return '';
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  getOllamaBinaryPath,
  getPythonWebUIPath,
  getAnythingLLMPath,
  getPythonWebUIBuildScript,
  getExecutableExtension
};
