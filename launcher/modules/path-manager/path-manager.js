/**
 * Pseudo Science Fiction Core Collection - Path Manager
 * Platform router - detects OS/architecture and loads appropriate module
 * 
 * Replaces index.js with explicit naming for better maintainability
 * 
 * @module path-manager
 * @version 1.1.2 - March 5, 2026 (Explicit Naming Refactor)
 * @license SEE LICENSE.txt
 */

const os = require('os');

const platform = os.platform();
const arch = os.arch();

let platformModule;

// Load platform-specific module
if (platform === 'linux' && arch === 'x64') {
  platformModule = require('./path-manager-linux-x64');
} else if (platform === 'linux' && arch === 'arm64') {
  platformModule = require('./path-manager-linux-arm64');
} else if (platform === 'darwin' && arch === 'arm64') {
  platformModule = require('./path-manager-macos-arm');
} else if (platform === 'darwin' && arch === 'x64') {
  platformModule = require('./path-manager-macos-intel');
} else if (platform === 'win32' && arch === 'x64') {
  platformModule = require('./path-manager-windows-x64');
} else if (platform === 'win32' && arch === 'arm64') {
  platformModule = require('./path-manager-windows-arm64');
} else {
  throw new Error(`[path-manager] Unsupported platform: ${platform}-${arch}`);
}

// Load common module (shared path utilities)
const commonModule = require('./path-manager-common');

// Export merged API
module.exports = {
  ...platformModule,
  ...commonModule
};
