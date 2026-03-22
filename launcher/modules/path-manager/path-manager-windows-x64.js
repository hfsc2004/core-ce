/**
 * Pseudo Science Fiction Core Collection - Path Manager Module
 * WINDOWS X64 IMPLEMENTATION
 * 
 * Platform-specific path resolution for Windows x86_64 systems.
 * This file contains ONLY Windows-specific logic.
 * 
 * STATUS: 🟡 UNTESTED - Extracted from original code but not verified
 * 
 * Key Differences from Other Platforms:
 * - Uses .exe extension on binaries
 * - Uses 'Scripts/python.exe' (not 'bin/python')
 * - Uses .bat build scripts
 * - Uses 'windows-x64' directory structure
 * 
 * @module path-manager-windows-x64
 * @version 1.1.2 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const path = require('path');

// Import common utilities for directory resolution
const common = require('./path-manager-common.js');

// ============================================================================
// Platform-Specific Binary Path Resolution
// ============================================================================

/**
 * Get Ollama binary path (Windows x64)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to Ollama binary
 */
function getOllamaBinaryPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'windows-x64';
  
  // Windows: .exe extension required
  return path.join(binariesDir, 'ollama', key, 'bin', 'ollama.exe');
}

/**
 * Get Python WebUI Python executable path (Windows x64)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to Python executable in venv
 */
function getPythonWebUIPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'windows-x64';
  
  // Windows: Uses 'Scripts/python.exe' (not 'bin/python')
  return path.join(binariesDir, 'python-webui', key, 'venv', 'Scripts', 'python.exe');
}

/**
 * Get AnythingLLM path (Windows x64)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to AnythingLLM
 */
function getAnythingLLMPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'windows-x64';
  
  // AnythingLLM is Node-based, same structure across platforms
  return path.join(binariesDir, 'anythingllm', key, 'server', 'index.js');
}

/**
 * Get Python WebUI build script path (Windows x64)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to build-python-webui.bat
 */
function getPythonWebUIBuildScript(fromPath) {
  const projectRoot = common.getProjectRoot(fromPath);
  
  // Windows: Uses .bat build script
  return path.join(projectRoot, 'launcher', 'build-python-webui.bat');
}

/**
 * Get platform-specific executable extension (Windows x64)
 * @returns {string} '.exe' for Windows
 */
function getExecutableExtension() {
  // Windows: .exe extension
  return '.exe';
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
