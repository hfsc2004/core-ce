/**
 * PSF Security Layer - Passthrough (Standard Edition)
 * No authentication or authorization - all operations allowed
 * 
 * @module security-passthrough
 * @version 1.1.2 - March 5, 2026
 */

/**
 * Initialize passthrough security
 */
async function initialize() {
  console.log('[Security:Passthrough] Standard Edition - all operations allowed');
}

/**
 * Check permission - always returns true
 * @param {string} permission - Permission to check
 * @param {Object} context - Request context (ignored)
 * @returns {Promise<boolean>} Always true
 */
async function checkPermission(permission, context = {}) {
  return true;
}

/**
 * Get current role - always returns 'admin' (full access)
 * @param {Object} context - Request context (ignored)
 * @returns {string} Always 'admin'
 */
function getCurrentRole(context = {}) {
  return 'admin';
}

/**
 * Audit log - no-op in Standard Edition
 */
function auditLog(action, details = {}) {
  // No audit logging in Standard Edition
}

module.exports = {
  initialize,
  checkPermission,
  getCurrentRole,
  auditLog
};
