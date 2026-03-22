/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - Platform Dispatcher
 */

let platformImpl = null;

function getPlatformModule() {
  if (platformImpl) return platformImpl;

  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    platformImpl = arch === 'arm64'
      ? require('./coding-terminal-platform-windows-arm64')
      : require('./coding-terminal-platform-windows-x64');
    return platformImpl;
  }

  if (platform === 'darwin') {
    platformImpl = arch === 'arm64'
      ? require('./coding-terminal-platform-macos-arm')
      : require('./coding-terminal-platform-macos-intel');
    return platformImpl;
  }

  platformImpl = arch === 'arm64'
    ? require('./coding-terminal-platform-linux-arm64')
    : require('./coding-terminal-platform-linux-x64');
  return platformImpl;
}

function getPlatformKey() {
  return getPlatformModule().platformKey;
}

function isWindows() {
  return !!getPlatformModule().isWindows;
}

function normalizeProjectPath(projectPath) {
  return getPlatformModule().normalizeProjectPath(projectPath);
}

module.exports = {
  getPlatformKey,
  isWindows,
  normalizeProjectPath
};
