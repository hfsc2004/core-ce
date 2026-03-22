/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Linux arm64 Platform Profile
 */

const common = require('./coding-terminal-platform-common');

module.exports = {
  platformKey: 'linux-arm64',
  isWindows: false,
  normalizeProjectPath: (projectPath) => common.normalizeProjectPath(projectPath, { lowercase: false })
};
