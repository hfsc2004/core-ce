/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - Platform Common Helpers
 */

const path = require('path');

function normalizeProjectPath(projectPath, options = {}) {
  const raw = path.resolve(String(projectPath || '')).replace(/\\/g, '/');
  return options.lowercase ? raw.toLowerCase() : raw;
}

module.exports = {
  normalizeProjectPath
};
