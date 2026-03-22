/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const { execFileSync } = require('child_process');

function getCurrentPlatformKey() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    return arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  }
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'macos-arm' : 'macos-intel';
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }

  return 'unknown';
}

function getAllPlatformKeys() {
  return [
    'windows-x64',
    'windows-arm64',
    'linux-x64',
    'linux-arm64',
    'macos-intel',
    'macos-arm'
  ];
}

function isValidPlatformKey(key) {
  return getAllPlatformKeys().includes(key);
}

function resolveSystemGitPath() {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('where', ['git'], { encoding: 'utf8' }).trim();
      const first = output.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      return first || null;
    }
    const output = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    return output || null;
  } catch {
    return null;
  }
}

function resolveGitExecPath(systemGitPath) {
  try {
    const output = execFileSync(systemGitPath, ['--exec-path'], { encoding: 'utf8' }).trim();
    return output || null;
  } catch {
    return null;
  }
}

module.exports = {
  getCurrentPlatformKey,
  getAllPlatformKeys,
  isValidPlatformKey,
  resolveSystemGitPath,
  resolveGitExecPath
};
