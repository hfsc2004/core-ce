/**
 * Pseudo Science Fiction Core Collection - GPU Detector
 * Platform router - detects OS/architecture and loads appropriate module
 * 
 * Replaces index.js with explicit naming for better maintainability
 * 
 * @module gpu-detector
 * @version 1.1.2 - March 5, 2026 (Explicit Naming Refactor)
 * @license SEE LICENSE.txt
 */

const os = require('os');

const platform = os.platform();
const arch = os.arch();

let platformModule;

// Load platform-specific module
if (platform === 'linux' && arch === 'x64') {
  platformModule = require('./gpu-detector-linux-x64');
} else if (platform === 'linux' && arch === 'arm64') {
  platformModule = require('./gpu-detector-linux-arm64');
} else if (platform === 'darwin' && arch === 'arm64') {
  platformModule = require('./gpu-detector-macos-arm');
} else if (platform === 'darwin' && arch === 'x64') {
  platformModule = require('./gpu-detector-macos-intel');
} else if (platform === 'win32' && arch === 'x64') {
  platformModule = require('./gpu-detector-windows-x64');
} else if (platform === 'win32' && arch === 'arm64') {
  platformModule = require('./gpu-detector-windows-arm64');
} else {
  throw new Error(`[gpu-detector] Unsupported platform: ${platform}-${arch}`);
}

// Load common module (shared classification logic)
const commonModule = require('./gpu-detector-common');

// Export merged API
module.exports = {
  ...platformModule,
  ...commonModule
};
