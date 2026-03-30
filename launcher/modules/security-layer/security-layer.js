/**
 * PSF Security Layer - Entry Point
 * Edition detection and security dispatcher
 *
 * Policy: See EditionSecurityPolicy_1_1_1.md for authoritative edition/security matrix.
 * @module security-layer
 * @version 1.1.3 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');
const audit = require('../audit/audit-common');
const fips = require('./security-fips');

// Edition-specific handlers
let securityHandler = null;
let currentEdition = null;
let currentSecurityModel = null; // 'none' | 'rbac' | 'mac'
let initialized = false;

/**
 * Initialize security layer
 * @returns {Promise<boolean>} Success status
 */
async function initialize() {
  if (initialized) return true;

  currentEdition = detectEdition();
  currentSecurityModel = resolveSecurityModel(currentEdition);

  // Load appropriate handler
  switch (currentSecurityModel) {
    case 'mac':
      securityHandler = require('./security-mac');
      break;
    case 'rbac':
      securityHandler = require('./security-rbac');
      break;
    default:
      securityHandler = require('./security-passthrough');
  }

  await securityHandler.initialize();
  await audit.initialize({ edition: currentEdition, securityModel: currentSecurityModel });

  // FIPS is optional for now; non-fatal preflight warning in stub mode.
  if (shouldEnableFips(currentEdition, currentSecurityModel)) {
    const fipsOk = fips.validateFipsMode();
    if (!fipsOk) {
      console.warn('[Security] FIPS requested but unavailable (stub mode)');
    }
  }

  initialized = true;
  console.log(`[Security] Initialized with edition=${currentEdition} model=${currentSecurityModel}`);
  return true;
}

/**
 * Detect current edition
 * @returns {string} 'standard' | 'enterprise' | 'datacenter' | 'government'
 */
function detectEdition() {
  // Check environment variable
  const envEdition = process.env.PSF_EDITION;
  if (envEdition) {
    return String(envEdition).toLowerCase();
  }

  // Check for datacenter markers
  const dcMarkers = [
    '/etc/psf/datacenter.conf',
    '/var/lib/psf/dc.license'
  ];
  for (const marker of dcMarkers) {
    if (fs.existsSync(marker)) {
      return 'datacenter';
    }
  }

  // Check for enterprise markers
  const enterpriseMarkers = [
    path.join(process.cwd(), 'config', 'enterprise.license'),
    path.join(process.cwd(), 'config', 'rbac-policy.json')
  ];
  for (const marker of enterpriseMarkers) {
    if (fs.existsSync(marker)) {
      return 'enterprise';
    }
  }

  return 'standard';
}

/**
 * Resolve security model from edition + optional override.
 * Policy:
 * - standard: none
 * - enterprise: rbac default, mac optional
 * - datacenter: rbac default, mac optional
 * - government: mac default
 */
function resolveSecurityModel(edition) {
  const requested = String(process.env.PSF_SECURITY_MODEL || '').trim().toLowerCase();

  if (edition === 'standard') return 'none';

  if (edition === 'government') {
    if (requested === 'rbac') return 'rbac';
    return 'mac';
  }

  if (edition === 'enterprise' || edition === 'datacenter') {
    if (requested === 'mac') return 'mac';
    return 'rbac';
  }

  return 'none';
}

function shouldEnableFips(edition, securityModel) {
  if (String(process.env.PSF_FIPS_MODE || '').toLowerCase() === 'true') return true;
  return edition === 'government' && securityModel === 'mac';
}

/**
 * Check if operation is allowed
 * @param {string} permission - Permission to check
 * @param {Object} context - Request context
 * @returns {Promise<boolean>} True if allowed
 */
async function checkPermission(permission, context = {}) {
  if (!securityHandler) {
    console.error('[Security] Not initialized');
    return false;
  }

  return securityHandler.checkPermission(permission, context);
}

/**
 * Get current user role
 * @param {Object} context - Request context
 * @returns {string} Role name
 */
function getCurrentRole(context = {}) {
  if (!securityHandler) return 'unknown';
  return securityHandler.getCurrentRole(context);
}

/**
 * Get current edition
 * @returns {string} Edition name
 */
function getEdition() {
  return currentEdition || detectEdition();
}

/**
 * Get current security model.
 * @returns {string}
 */
function getSecurityModel() {
  return currentSecurityModel || resolveSecurityModel(getEdition());
}

/**
 * Get security mode descriptor for diagnostics and UI.
 * @returns {string}
 */
function getSecurityMode() {
  const edition = getEdition();
  const model = getSecurityModel();
  if (edition === 'standard') return 'passthrough';
  if (edition === 'government' && model === 'mac') return 'mac+fips-stub';
  return model;
}

/**
 * Audit log an action
 * @param {string} action - Action performed
 * @param {Object} details - Action details
 */
function auditLog(action, details = {}) {
  if (securityHandler?.auditLog) {
    securityHandler.auditLog(action, details);
  }

  // Canonical audit dispatcher for future shared ingestion.
  audit.record(action, {
    edition: getEdition(),
    securityMode: getSecurityMode(),
    ...details
  });
}

module.exports = {
  initialize,
  checkPermission,
  getCurrentRole,
  getEdition,
  getSecurityMode,
  getSecurityModel,
  detectEdition,
  resolveSecurityModel,
  auditLog
};
