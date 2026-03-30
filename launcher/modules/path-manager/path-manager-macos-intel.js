/**
 * Pseudo Science Fiction Core Collection - Path Manager Module
 * MACOS INTEL IMPLEMENTATION
 * 
 * Platform-specific path resolution for macOS Intel (x86_64) systems.
 * This file contains ONLY macOS Intel-specific logic.
 * 
 * STATUS: 🟡 UNTESTED - Extracted from original code but not verified
 * 
 * Key Differences from Other Platforms:
 * - No .exe extension on binaries
 * - Uses 'bin/python' (not 'Scripts/python.exe')
 * - Uses -macos.sh build scripts
 * - Uses 'macos-intel' directory structure
 * - May support universal binaries (fallback to 'macos' folder)
 * 
 * @module path-manager-macos-intel
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
 * Get Ollama binary path (macOS Intel)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to Ollama binary
 */
function getOllamaBinaryPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'macos-intel';
  
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
 * Get Python WebUI Python executable path (macOS Intel)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to Python executable in venv
 */
function getPythonWebUIPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'macos-intel';
  
  // macOS: Uses 'bin/python' (same as Linux)
  return path.join(binariesDir, 'python-webui', key, 'venv', 'bin', 'python');
}

/**
 * Get AnythingLLM path (macOS Intel)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} [platformKey] - Optional platform key override
 * @returns {string} Path to AnythingLLM
 */
function getAnythingLLMPath(fromPath, platformKey = null) {
  const binariesDir = common.getBinariesDir(fromPath);
  const key = platformKey || 'macos-intel';
  
  // AnythingLLM is Node-based, same structure across platforms
  return path.join(binariesDir, 'anythingllm', key, 'server', 'index.js');
}

/**
 * Get Python WebUI build script path (macOS Intel)
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {string} Path to build-python-webui-macos.sh
 */
function getPythonWebUIBuildScript(fromPath) {
  const projectRoot = common.getProjectRoot(fromPath);
  
  // macOS: Uses -macos.sh build script (special for Homebrew Python paths)
  return path.join(projectRoot, 'launcher', 'build-python-webui-macos.sh');
}

/**
 * Get platform-specific executable extension (macOS Intel)
 * @returns {string} Empty string (macOS has no extension)
 */
function getExecutableExtension() {
  // macOS: No extension for executables
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
