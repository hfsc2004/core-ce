/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const { canonicalizeManifest } = require('./mod-signature');

function getTrustDir(rootDir) {
  return path.join(String(rootDir || ''), 'trust');
}

function getTrustedKeysPath(rootDir) {
  return path.join(getTrustDir(rootDir), 'trusted-keys.json');
}

async function loadTrustedKeys(rootDir) {
  const filePath = getTrustedKeysPath(rootDir);
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

async function saveTrustedKeys(rootDir, keys = {}) {
  const trustDir = getTrustDir(rootDir);
  const filePath = getTrustedKeysPath(rootDir);
  await fsp.mkdir(trustDir, { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(keys, null, 2), 'utf8');
  return filePath;
}

async function approveKey(rootDir, keyId, publicKeyPem) {
  const id = String(keyId || '').trim();
  const pub = String(publicKeyPem || '').trim();
  if (!id) throw new Error('keyId is required');
  if (!pub) throw new Error('publicKeyPem is required');
  const keys = await loadTrustedKeys(rootDir);
  keys[id] = pub;
  const filePath = await saveTrustedKeys(rootDir, keys);
  return { ok: true, keyId: id, trustedKeysPath: filePath };
}

async function createKeyPair({ outputDir, keyId = 'ed25519:local-dev-signer' } = {}) {
  const outDir = path.resolve(String(outputDir || process.cwd()));
  await fsp.mkdir(outDir, { recursive: true });

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  const keyStem = String(keyId || 'ed25519-local-dev-signer').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const privateKeyPath = path.join(outDir, `${keyStem}.private.pem`);
  const publicKeyPath = path.join(outDir, `${keyStem}.public.pem`);
  await fsp.writeFile(privateKeyPath, privatePem, { encoding: 'utf8', mode: 0o600 });
  await fsp.writeFile(publicKeyPath, publicPem, { encoding: 'utf8' });

  return {
    ok: true,
    keyId: String(keyId),
    privateKeyPath,
    publicKeyPath
  };
}

async function signDirectory({
  sourceDir,
  keyId,
  privateKeyPath,
  publicKeyPath = '',
  rootDir,
  approve = true
} = {}) {
  const resolvedSource = path.resolve(String(sourceDir || ''));
  if (!resolvedSource || !fs.existsSync(resolvedSource)) {
    throw new Error(`sourceDir not found: ${resolvedSource}`);
  }
  const resolvedPrivate = path.resolve(String(privateKeyPath || ''));
  if (!resolvedPrivate || !fs.existsSync(resolvedPrivate)) {
    throw new Error(`private key not found: ${resolvedPrivate}`);
  }
  const id = String(keyId || '').trim();
  if (!id) throw new Error('keyId is required');

  const manifestPath = path.join(resolvedSource, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  const payload = Buffer.from(canonicalizeManifest(manifest), 'utf8');

  const privatePem = await fsp.readFile(resolvedPrivate, 'utf8');
  const privateKey = crypto.createPrivateKey(privatePem);
  const signatureValue = crypto.sign(null, payload, privateKey).toString('base64');

  let publicPem = '';
  if (String(publicKeyPath || '').trim()) {
    const resolvedPublic = path.resolve(String(publicKeyPath));
    if (!fs.existsSync(resolvedPublic)) throw new Error(`public key not found: ${resolvedPublic}`);
    publicPem = await fsp.readFile(resolvedPublic, 'utf8');
  } else {
    publicPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  }

  const signature = {
    algorithm: 'ed25519',
    keyId: id,
    publicKeyPem: String(publicPem).trim(),
    signature: signatureValue,
    signedAt: new Date().toISOString()
  };
  const signaturePath = path.join(resolvedSource, 'signature.json');
  await fsp.writeFile(signaturePath, JSON.stringify(signature, null, 2), 'utf8');

  let approval = null;
  if (approve === true) {
    approval = await approveKey(rootDir, id, signature.publicKeyPem);
  }

  return {
    ok: true,
    sourceDir: resolvedSource,
    signaturePath,
    keyId: id,
    approved: approve === true,
    trustedKeysPath: approval?.trustedKeysPath || ''
  };
}

module.exports = {
  getTrustedKeysPath,
  loadTrustedKeys,
  saveTrustedKeys,
  approveKey,
  createKeyPair,
  signDirectory
};

