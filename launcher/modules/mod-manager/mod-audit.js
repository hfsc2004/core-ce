/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const audit = require('../audit/audit-common');

function record(event, details = {}) {
  return audit.record(event, {
    domain: 'mod-manager',
    ...details
  });
}

function modInstallRequested(details = {}) {
  return record('mod.install.requested', details);
}

function modInstallVerified(details = {}) {
  return record('mod.install.verified', details);
}

function modInstallDenied(details = {}) {
  return record('mod.install.denied', details);
}

function modEnabled(details = {}) {
  return record('mod.enabled', details);
}

function modDisabled(details = {}) {
  return record('mod.disabled', details);
}

function modCrashed(details = {}) {
  return record('mod.crashed', details);
}

function modRemoved(details = {}) {
  return record('mod.removed', details);
}

function modCapabilityDenied(details = {}) {
  return record('mod.capability.denied', details);
}

function modAttestationGenerated(details = {}) {
  return record('mod.attestation.generated', details);
}

module.exports = {
  record,
  modInstallRequested,
  modInstallVerified,
  modInstallDenied,
  modEnabled,
  modDisabled,
  modCrashed,
  modRemoved,
  modCapabilityDenied,
  modAttestationGenerated
};
