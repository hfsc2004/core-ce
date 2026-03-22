'use strict';

const assert = require('assert');
const crypto = require('crypto');

const { createModManager } = require('./mod-manager');
const { canonicalizeManifest } = require('./mod-signature');

function buildManifest() {
  return {
    id: 'com.psf.voice-pack',
    name: 'Voice Pack',
    version: '1.0.0',
    apiVersion: 1,
    apiRange: { min: 1, max: 1 },
    entrypoint: 'mod.js',
    capabilities: ['ui.panel', 'storage.scoped']
  };
}

function signManifest(manifest, keyId = 'ed25519:test-key-1') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const payload = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  const sig = crypto.sign(null, payload, privateKey).toString('base64');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  return {
    signature: {
      algorithm: 'ed25519',
      keyId,
      publicKeyPem,
      signature: sig
    },
    trustedKeys: {
      [keyId]: publicKeyPem
    }
  };
}

function testPreflightManifestFailure() {
  const manager = createModManager();
  const result = manager.preflightPackage({
    manifest: { id: 'bad' },
    edition: 'standard',
    allowUnsignedStandard: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'manifest');
}

function testPreflightTrustFailureForEnterpriseUnsigned() {
  const manager = createModManager();
  const result = manager.preflightPackage({
    manifest: buildManifest(),
    edition: 'enterprise'
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'trust');
}

function testPreflightPolicyFailureForGovernmentVoice() {
  const manager = createModManager();
  const manifest = buildManifest();
  manifest.capabilities.push('voice.stt');
  const { signature, trustedKeys } = signManifest(manifest);

  const result = manager.preflightPackage({
    manifest,
    signature,
    trustedKeys,
    edition: 'government'
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'policy');
  assert.ok(Array.isArray(result.denied));
  assert.ok(result.denied.includes('voice.stt'));
}

function testPreflightSuccess() {
  const manager = createModManager();
  const manifest = buildManifest();
  const { signature, trustedKeys } = signManifest(manifest);

  const result = manager.preflightPackage({
    manifest,
    signature,
    trustedKeys,
    edition: 'enterprise'
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.denied, []);
}

function run() {
  testPreflightManifestFailure();
  testPreflightTrustFailureForEnterpriseUnsigned();
  testPreflightPolicyFailureForGovernmentVoice();
  testPreflightSuccess();
  process.stdout.write('mod-manager regression tests passed\n');
}

run();

