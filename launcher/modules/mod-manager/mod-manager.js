/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const { MOD_API_MIN, MOD_API_MAX, KNOWN_CAPABILITIES } = require('./mod-constants');
const { loadAndValidateManifest, validateManifest, parseManifest } = require('./mod-manifest');
const { resolveProfile, evaluateCapabilities: evaluateProfileCapabilities } = require('./mod-policy');
const { verifyPackageTrust } = require('./mod-signature');
const securityLayer = require('../security-layer/security-layer');

function createModManager(options = {}) {
  const apiMin = Number.isInteger(options.apiMin) ? options.apiMin : MOD_API_MIN;
  const apiMax = Number.isInteger(options.apiMax) ? options.apiMax : MOD_API_MAX;
  const knownCapabilities = Array.isArray(options.knownCapabilities)
    ? options.knownCapabilities
    : KNOWN_CAPABILITIES;

  function validateManifestInput(manifestInput) {
    return validateManifest(manifestInput, { apiMin, apiMax, knownCapabilities });
  }

  function validateManifestFile(manifestPath) {
    return loadAndValidateManifest(manifestPath, { apiMin, apiMax, knownCapabilities });
  }

  function evaluateCapabilities({ edition, preset, capabilities }) {
    const profile = resolveProfile({ edition, preset });
    return evaluateProfileCapabilities(profile, Array.isArray(capabilities) ? capabilities : []);
  }

  function verifyTrust({ manifest, signature, edition, preset, trustedKeys }) {
    const resolvedEdition = edition || securityLayer.detectEdition();
    return verifyPackageTrust({
      manifest,
      signature,
      edition: resolvedEdition,
      preset,
      trustedKeys
    });
  }

  function preflightPackage({
    manifest,
    signature,
    edition,
    preset,
    trustedKeys
  }) {
    let rawManifest = null;
    try {
      rawManifest = parseManifest(manifest);
    } catch (err) {
      return {
        ok: false,
        stage: 'manifest',
        errors: [`invalid manifest JSON: ${err.message}`]
      };
    }

    const manifestValidation = validateManifestInput(manifest);
    if (!manifestValidation.ok) {
      return {
        ok: false,
        stage: 'manifest',
        errors: manifestValidation.errors
      };
    }

    const parsedManifest = manifestValidation.manifest;
    const trust = verifyTrust({
      manifest: rawManifest,
      signature,
      edition,
      preset,
      trustedKeys
    });
    if (!trust.ok) {
      return {
        ok: false,
        stage: 'trust',
        errors: [trust.reason || 'trust_verification_failed'],
        profile: trust.profile
      };
    }

    const profile = trust.profile || resolveProfile({ edition, preset });
    const capabilities = evaluateProfileCapabilities(profile, parsedManifest.capabilities);
    if (!capabilities.ok) {
      return {
        ok: false,
        stage: 'policy',
        errors: [capabilities.reason || 'policy_evaluation_failed'],
        profile
      };
    }
    if (capabilities.denied.length > 0) {
      return {
        ok: false,
        stage: 'policy',
        errors: [`denied capabilities: ${capabilities.denied.join(', ')}`],
        profile,
        denied: capabilities.denied,
        allowed: capabilities.allowed
      };
    }

    return {
      ok: true,
      profile,
      manifest: parsedManifest,
      allowed: capabilities.allowed,
      denied: capabilities.denied,
      trust
    };
  }

  return {
    apiMin,
    apiMax,
    knownCapabilities: [...knownCapabilities],
    validateManifestInput,
    validateManifestFile,
    evaluateCapabilities,
    verifyTrust,
    preflightPackage
  };
}

module.exports = {
  createModManager
};
