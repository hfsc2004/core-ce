/**
 * PSF Security Layer - FIPS Wrapper (Government/DC stub)
 *
 * STUB ONLY: This module does NOT provide validated FIPS compliance.
 * It exists to establish interface contracts for future certified builds.
 *
 * @module security-fips
 * @version 1.1.3 - March 5, 2026
 */

const crypto = require('crypto');

const FIPS_MODE = String(process.env.PSF_FIPS_MODE || '').toLowerCase() === 'true';

function validateFipsMode() {
  if (!FIPS_MODE) {
    console.log('[FIPS] Disabled (PSF_FIPS_MODE not true)');
    return false;
  }

  const runtimeFips = typeof crypto.getFips === 'function' ? crypto.getFips() : 0;
  console.warn('[FIPS] STUB mode enabled; runtimeFips=', runtimeFips);
  return runtimeFips === 1;
}

function failIfFipsRequired(op) {
  if (FIPS_MODE) {
    throw new Error(`[FIPS] STUB: ${op} is not implemented with validated crypto module`);
  }
}

function hash(data, algorithm = 'sha256') {
  failIfFipsRequired('hash');
  return crypto.createHash(algorithm).update(String(data)).digest('hex');
}

function hmac(data, key, algorithm = 'sha256') {
  failIfFipsRequired('hmac');
  return crypto.createHmac(algorithm, key).update(String(data)).digest('hex');
}

function sign() {
  failIfFipsRequired('sign');
  throw new Error('[FIPS] STUB: sign not implemented');
}

function verify() {
  failIfFipsRequired('verify');
  throw new Error('[FIPS] STUB: verify not implemented');
}

function encrypt() {
  failIfFipsRequired('encrypt');
  throw new Error('[FIPS] STUB: encrypt not implemented');
}

function decrypt() {
  failIfFipsRequired('decrypt');
  throw new Error('[FIPS] STUB: decrypt not implemented');
}

module.exports = {
  FIPS_MODE,
  validateFipsMode,
  hash,
  hmac,
  sign,
  verify,
  encrypt,
  decrypt
};
