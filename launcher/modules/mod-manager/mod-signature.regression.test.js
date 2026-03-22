'use strict';

const assert = require('assert');
const crypto = require('crypto');

const {
  hashContent,
  verifyIntegrity,
  canonicalizeManifest,
  verifySignature,
  verifyPackageTrust
} = require('./mod-signature');

function buildManifest() {
  return {
    id: 'com.psf.voice-pack',
    name: 'Voice Pack',
    version: '1.0.0',
    apiVersion: 1,
    apiRange: { min: 1, max: 1 },
    entrypoint: 'mod.js',
    capabilities: ['ui.panel']
  };
}

function testHashAndVerify() {
  const content = '{"id":"com.psf.voice-pack"}';
  const digest = hashContent(content);
  assert.equal(typeof digest, 'string');
  assert.equal(digest.length, 64);

  const ok = verifyIntegrity(content, digest);
  assert.equal(ok.ok, true);

  const bad = verifyIntegrity(content, '0'.repeat(64));
  assert.equal(bad.ok, false);
}

function testEd25519Verify() {
  const manifest = buildManifest();
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const payload = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  const sig = crypto.sign(null, payload, privateKey).toString('base64');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keyId = 'ed25519:test-key-1';

  const signature = {
    algorithm: 'ed25519',
    keyId,
    publicKeyPem,
    signature: sig
  };

  const verified = verifySignature({
    manifest,
    signature,
    trustedKeys: { [keyId]: publicKeyPem }
  });
  assert.equal(verified.ok, true);

  const tampered = { ...manifest, version: '1.0.1' };
  const bad = verifySignature({
    manifest: tampered,
    signature,
    trustedKeys: { [keyId]: publicKeyPem }
  });
  assert.equal(bad.ok, false);

  const untrusted = verifyPackageTrust({
    manifest,
    signature,
    edition: 'enterprise',
    trustedKeys: { 'ed25519:other-key': publicKeyPem }
  });
  assert.equal(untrusted.ok, false);
  assert.equal(untrusted.reason, 'untrusted_signer');
}

function testTrustPolicy() {
  const manifest = buildManifest();

  const standardUnsigned = verifyPackageTrust({
    manifest,
    edition: 'standard'
  });
  assert.equal(standardUnsigned.ok, false);
  assert.equal(standardUnsigned.reason, 'signature_required');

  const enterpriseUnsigned = verifyPackageTrust({
    manifest,
    edition: 'enterprise'
  });
  assert.equal(enterpriseUnsigned.ok, false);
  assert.equal(enterpriseUnsigned.reason, 'signature_required');
}

function run() {
  testHashAndVerify();
  testEd25519Verify();
  testTrustPolicy();
  process.stdout.write('mod-signature regression tests passed\n');
}

run();
