/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Windows arm64 Platform Profile
 */

const common = require('./coding-terminal-platform-common');

module.exports = {
  platformKey: 'windows-arm64',
  isWindows: true,
  normalizeProjectPath: (projectPath) => common.normalizeProjectPath(projectPath, { lowercase: true })
};
