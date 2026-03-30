/**
 * Pseudo Science Fiction Core Collection - AnythingLLM Manager
 * Platform router - detects OS/architecture and loads appropriate module
 * 
 * Replaces index.js with explicit naming for better maintainability
 * 
 * @module anythingllm-manager
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 * @license SEE LICENSE.txt
 */

const os = require('os');

const platform = os.platform();
const arch = os.arch();

let platformModule;

// Load platform-specific module
if (platform === 'linux' && arch === 'x64') {
  platformModule = require('./anythingllm-manager-linux-x64');
} else if (platform === 'linux' && arch === 'arm64') {
  platformModule = require('./anythingllm-manager-linux-arm64');
} else if (platform === 'darwin' && arch === 'arm64') {
  platformModule = require('./anythingllm-manager-macos-arm');
} else if (platform === 'darwin' && arch === 'x64') {
  platformModule = require('./anythingllm-manager-macos-intel');
} else if (platform === 'win32' && arch === 'x64') {
  platformModule = require('./anythingllm-manager-windows-x64');
} else if (platform === 'win32' && arch === 'arm64') {
  platformModule = require('./anythingllm-manager-windows-arm64');
} else {
  throw new Error(`[anythingllm-manager] Unsupported platform: ${platform}-${arch}`);
}

// Load common module (shared utilities)
const commonModule = require('./anythingllm-manager-common');

// Export merged API
module.exports = {
  ...platformModule,
  ...commonModule
};
