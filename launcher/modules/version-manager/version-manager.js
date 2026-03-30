/**
 * Pseudo Science Fiction Core Collection - Version Manager
 * Entry point dispatcher for version management module
 * 
 * This module re-exports all version management functionality from the core module.
 * 
 * @module version-manager
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 * @license SEE LICENSE.txt
 */

// Re-export all functionality from core module
const core = require('./version-manager-core');

module.exports = {
  getCurrentVersion: core.getCurrentVersion,
  updateVersion: core.updateVersion,
  getVersionStatus: core.getVersionStatus,
  createLightweightProjectClone: core.createLightweightProjectClone
};
