/**
 * Compliance Evidence Signer
 *
 * Signs launcher/config/compliance-evidence.json with an Ed25519 private key
 * and optionally trusts the signer key in compliance-trusted-keys.json.
 *
 * Usage:
 *   node compliance-evidence-sign.js \
 *     --app-dir /path/to/launcher \
 *     --key-id ed25519:compliance-signer \
 *     --private-key /path/to/private.pem \
 *     [--public-key /path/to/public.pem] \
 *     [--approve]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'approve') {
      out.approve = true;
      continue;
    }
    const next = argv[i + 1];
    if (typeof next === 'undefined' || String(next).startsWith('--')) {
      out[key] = '';
      continue;
    }
    out[key] = String(next);
    i += 1;
  }
  return out;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function resolveAppDir(raw) {
  const p = path.resolve(String(raw || process.cwd()));
  if (path.basename(p) === 'launcher') return p;
  if (fs.existsSync(path.join(p, 'launcher'))) return path.join(p, 'launcher');
  return p;
}

function main() {
  const args = parseArgs(process.argv);
  const appDir = resolveAppDir(args['app-dir'] || process.cwd());
  const keyId = String(args['key-id'] || '').trim();
  const privateKeyPath = path.resolve(String(args['private-key'] || ''));
  const publicKeyPath = String(args['public-key'] || '').trim()
    ? path.resolve(String(args['public-key']))
    : '';
  const approve = !!args.approve;

  if (!keyId) throw new Error('--key-id is required');
  if (!privateKeyPath) throw new Error('--private-key is required');
  if (!fs.existsSync(privateKeyPath)) throw new Error(`Private key not found: ${privateKeyPath}`);

  const configDir = path.join(appDir, 'config');
  const evidencePath = path.join(configDir, 'compliance-evidence.json');
  const trustedKeysPath = path.join(configDir, 'compliance-trusted-keys.json');
  if (!fs.existsSync(evidencePath)) throw new Error(`Evidence file not found: ${evidencePath}`);

  const evidence = loadJson(evidencePath);
  const payload = {
    standard: String(evidence.standard || '').trim(),
    baseline: String(evidence.baseline || '').trim(),
    profile: String(evidence.profile || '').trim(),
    evidenceId: String(evidence.evidenceId || '').trim(),
    assessor: String(evidence.assessor || '').trim(),
    assessmentDate: String(evidence.assessmentDate || '').trim(),
    expiresOn: String(evidence.expiresOn || '').trim(),
    attestation: String(evidence.attestation || '').trim()
  };

  const privatePem = fs.readFileSync(privateKeyPath, 'utf8');
  const privateKey = crypto.createPrivateKey(privatePem);
  const signatureValue = crypto
    .sign(null, Buffer.from(canonicalize(payload), 'utf8'), privateKey)
    .toString('base64');

  let publicPem = '';
  if (publicKeyPath) {
    if (!fs.existsSync(publicKeyPath)) throw new Error(`Public key not found: ${publicKeyPath}`);
    publicPem = fs.readFileSync(publicKeyPath, 'utf8');
  } else {
    publicPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  }

  evidence.signature = {
    present: true,
    verified: false,
    algorithm: 'ed25519',
    keyId,
    signature: signatureValue,
    publicKeyPem: String(publicPem).trim()
  };
  writeJson(evidencePath, evidence);

  if (approve) {
    let trusted = {};
    if (fs.existsSync(trustedKeysPath)) {
      try {
        trusted = loadJson(trustedKeysPath);
      } catch {
        trusted = {};
      }
    }
    trusted[keyId] = String(publicPem).trim();
    writeJson(trustedKeysPath, trusted);
  }

  process.stdout.write(
    `Signed compliance evidence: ${evidencePath}\n` +
    `${approve ? `Trusted key updated: ${trustedKeysPath}\n` : ''}` +
    `keyId=${keyId}\n`
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`compliance-evidence-sign failed: ${err.message}\n`);
  process.exit(1);
}
