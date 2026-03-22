/**
 * PSF Audit - Dispatcher
 *
 * @module audit-common
 * @version 1.1.2 - March 5, 2026
 */

let backend = null;
let edition = 'standard';

async function initialize(options = {}) {
  edition = String(options.edition || process.env.PSF_EDITION || 'standard').toLowerCase();

  if (edition === 'government' || edition === 'datacenter') {
    backend = require('./audit-government');
  } else if (edition === 'enterprise') {
    backend = require('./audit-enterprise');
  } else {
    backend = require('./audit-standard');
  }

  if (backend?.initialize) await backend.initialize(options);
  return true;
}

function record(action, details = {}) {
  if (!backend) {
    backend = require('./audit-standard');
  }
  return backend.record(action, details);
}

function getBackendName() {
  if (!backend) return 'audit-standard';
  return backend.name || 'audit-unknown';
}

module.exports = {
  initialize,
  record,
  getBackendName
};
