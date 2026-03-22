/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
'use strict';

const crypto = require('crypto');
const { resolveProfile, requiresSignature } = require('./mod-policy');
const { isPlainObject } = require('./mod-manager-common');

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function verifyIntegrity(content, expectedSha256) {
  const digest = hashContent(content);
  return {
    ok: digest === String(expectedSha256 || '').toLowerCase(),
    digest
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalizeManifest(manifest) {
  return canonicalize(manifest);
}

function verifySignature({ manifest, signature, trustedKeys = {} }) {
  if (!isPlainObject(signature)) {
    return { ok: false, reason: 'missing_signature' };
  }

  const algorithm = String(signature.algorithm || '').toLowerCase();
  if (algorithm !== 'ed25519') {
    return { ok: false, reason: 'unsupported_algorithm' };
  }

  const keyId = String(signature.keyId || '').trim();
  const signatureValue = String(signature.signature || '').trim();
  const publicKeyPem = String(signature.publicKeyPem || '').trim();
  if (!keyId || !signatureValue || !publicKeyPem) {
    return { ok: false, reason: 'invalid_signature_fields' };
  }

  const trustedKey = trustedKeys[keyId] ? String(trustedKeys[keyId]).trim() : '';
  if (trustedKey && trustedKey !== publicKeyPem) {
    return { ok: false, reason: 'key_id_mismatch' };
  }

  try {
    const payload = Buffer.from(canonicalizeManifest(manifest), 'utf8');
    const sigBuffer = Buffer.from(signatureValue, 'base64');
    const verified = crypto.verify(null, payload, publicKeyPem, sigBuffer);
    if (!verified) {
      return { ok: false, reason: 'signature_verification_failed' };
    }

    if (signature.integrity && signature.integrity.sha256) {
      const integrity = verifyIntegrity(payload, signature.integrity.sha256);
      if (!integrity.ok) {
        return { ok: false, reason: 'integrity_mismatch', digest: integrity.digest };
      }
      return { ok: true, keyId, digest: integrity.digest };
    }

    return { ok: true, keyId };
  } catch (err) {
    return { ok: false, reason: 'signature_error', error: err.message };
  }
}

function verifyPackageTrust({
  manifest,
  signature,
  edition = 'standard',
  preset = '',
  trustedKeys = {}
}) {
  const profile = resolveProfile({ edition, preset });
  const trustedKeyIds = Object.keys(trustedKeys || {});

  if (!signature) {
    if (requiresSignature(profile)) {
      return { ok: false, profile, reason: 'signature_required' };
    }
    return { ok: false, profile, reason: 'unsigned_not_allowed' };
  }

  const verification = verifySignature({ manifest, signature, trustedKeys });
  if (!verification.ok) {
    return { ok: false, profile, ...verification };
  }
  if (!trustedKeyIds.includes(String(signature.keyId || '').trim())) {
    return { ok: false, profile, reason: 'untrusted_signer' };
  }
  return { ok: true, profile, ...verification };
}

module.exports = {
  hashContent,
  verifyIntegrity,
  canonicalizeManifest,
  verifySignature,
  verifyPackageTrust
};
