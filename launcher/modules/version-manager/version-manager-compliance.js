/**
 * Version Manager compliance evidence helpers.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getComplianceEvidenceConfigPath(fromPath) {
  return path.join(fromPath, 'config', 'compliance-evidence.json');
}

function getComplianceTrustedKeysPath(fromPath) {
  return path.join(fromPath, 'config', 'compliance-trusted-keys.json');
}

function parseDateOrNull(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function normalizeComplianceEvidence(input = {}) {
  const sig = input?.signature || {};
  return {
    standard: String(input.standard || '').trim(),
    baseline: String(input.baseline || '').trim(),
    profile: String(input.profile || '').trim(),
    evidenceId: String(input.evidenceId || '').trim(),
    assessor: String(input.assessor || '').trim(),
    assessmentDate: String(input.assessmentDate || '').trim(),
    expiresOn: String(input.expiresOn || '').trim(),
    attestation: String(input.attestation || '').trim(),
    signature: {
      present: !!input?.signature?.present,
      verified: !!input?.signature?.verified,
      algorithm: String(sig.algorithm || '').trim(),
      keyId: String(sig.keyId || '').trim(),
      signature: String(sig.signature || '').trim(),
      publicKeyPem: String(sig.publicKeyPem || '').trim()
    }
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

function canonicalizeEvidencePayload(payload = {}) {
  return canonicalize(payload);
}

function readComplianceTrustedKeys(fromPath) {
  const trustedPath = getComplianceTrustedKeysPath(fromPath);
  if (!fs.existsSync(trustedPath)) {
    return { path: trustedPath, keys: {}, exists: false };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(trustedPath, 'utf8'));
    const keys = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    return { path: trustedPath, keys, exists: true };
  } catch {
    return { path: trustedPath, keys: {}, exists: true };
  }
}

function verifyComplianceEvidenceSignature(evidence, trustedKeys = {}) {
  const sig = evidence?.signature || {};
  const algorithm = String(sig.algorithm || '').trim().toLowerCase();
  const keyId = String(sig.keyId || '').trim();
  const signatureValue = String(sig.signature || '').trim();
  const publicKeyPem = String(sig.publicKeyPem || '').trim();

  if (!algorithm && !keyId && !signatureValue && !publicKeyPem) {
    return { present: false, verified: false, reason: 'missing_signature' };
  }
  if (algorithm !== 'ed25519') {
    return { present: true, verified: false, reason: 'unsupported_algorithm' };
  }
  if (!keyId || !signatureValue || !publicKeyPem) {
    return { present: true, verified: false, reason: 'invalid_signature_fields' };
  }

  const trustedKey = String(trustedKeys[keyId] || '').trim();
  if (!trustedKey) {
    return { present: true, verified: false, reason: 'untrusted_signer' };
  }
  if (trustedKey !== publicKeyPem) {
    return { present: true, verified: false, reason: 'key_id_mismatch' };
  }

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

  try {
    const payloadBuffer = Buffer.from(canonicalizeEvidencePayload(payload), 'utf8');
    const signatureBuffer = Buffer.from(signatureValue, 'base64');
    const verified = crypto.verify(null, payloadBuffer, publicKeyPem, signatureBuffer);
    if (!verified) {
      return { present: true, verified: false, reason: 'signature_verification_failed' };
    }
    return { present: true, verified: true, reason: 'verified', keyId };
  } catch (err) {
    return { present: true, verified: false, reason: 'signature_error', error: err.message };
  }
}

function computeComplianceProofState(rawEvidence, trustedKeys = {}) {
  const evidence = normalizeComplianceEvidence(rawEvidence || {});
  const verifiedSig = verifyComplianceEvidenceSignature(evidence, trustedKeys);
  evidence.signature.present = verifiedSig.present;
  evidence.signature.verified = verifiedSig.verified;

  const now = new Date();
  const expiresAt = parseDateOrNull(evidence.expiresOn);
  const isExpired = !!(expiresAt && expiresAt.getTime() < now.getTime());
  const attestation = evidence.attestation.toUpperCase();
  const profile = evidence.profile.toUpperCase();

  let state = 'UNVERIFIED';
  if (isExpired) {
    state = 'EXPIRED';
  } else if (
    attestation === 'COMPLIANT' &&
    evidence.signature.present === true &&
    evidence.signature.verified === true
  ) {
    state = 'COMPLIANT';
  } else if (
    profile === 'PROFILED' ||
    attestation === 'PROFILED' ||
    attestation === 'ASSESSING' ||
    attestation === 'ALIGNED'
  ) {
    state = 'PROFILED';
  }

  const summaryBits = [];
  if (evidence.standard) summaryBits.push(`Standard: ${evidence.standard}`);
  if (evidence.baseline) summaryBits.push(`Baseline: ${evidence.baseline}`);
  if (evidence.evidenceId) summaryBits.push(`Evidence ID: ${evidence.evidenceId}`);
  if (evidence.assessor) summaryBits.push(`Assessor: ${evidence.assessor}`);
  if (evidence.assessmentDate) summaryBits.push(`Assessed: ${evidence.assessmentDate}`);
  if (evidence.expiresOn) summaryBits.push(`Expires: ${evidence.expiresOn}`);
  summaryBits.push(
    `Signature: ${
      evidence.signature.present
        ? (evidence.signature.verified ? 'verified' : 'present-unverified')
        : 'not-present'
    }`
  );
  if (verifiedSig.reason) summaryBits.push(`SigReason: ${verifiedSig.reason}`);

  return {
    state,
    evidence,
    summary: summaryBits.join(' | ')
  };
}

function readComplianceEvidence(fromPath) {
  const evidencePath = getComplianceEvidenceConfigPath(fromPath);
  const trusted = readComplianceTrustedKeys(fromPath);
  if (!fs.existsSync(evidencePath)) {
    return { path: evidencePath, trustedKeysPath: trusted.path, exists: false, ...computeComplianceProofState({}, trusted.keys) };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    return { path: evidencePath, trustedKeysPath: trusted.path, exists: true, ...computeComplianceProofState(parsed, trusted.keys) };
  } catch {
    return { path: evidencePath, trustedKeysPath: trusted.path, exists: true, ...computeComplianceProofState({}, trusted.keys) };
  }
}

function getComplianceEvidenceStatus(fromPath) {
  const compliance = readComplianceEvidence(fromPath);
  const trusted = readComplianceTrustedKeys(fromPath);
  return {
    success: true,
    path: compliance.path,
    trustedKeysPath: trusted.path,
    proofState: compliance.state,
    proofSummary: compliance.summary,
    evidence: compliance.evidence,
    trustedKeyIds: Object.keys(trusted.keys || {})
  };
}

function saveComplianceEvidence(fromPath, payload = {}) {
  const evidencePath = getComplianceEvidenceConfigPath(fromPath);
  const dir = path.dirname(evidencePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const base = normalizeComplianceEvidence(payload || {});
  base.signature = {
    present: false,
    verified: false,
    algorithm: '',
    keyId: '',
    signature: '',
    publicKeyPem: ''
  };
  fs.writeFileSync(evidencePath, `${JSON.stringify(base, null, 2)}\n`, 'utf8');

  const status = getComplianceEvidenceStatus(fromPath);
  return { success: true, message: 'Compliance evidence saved. Signature reset pending re-sign.', ...status };
}

function addComplianceTrustedKey(fromPath, keyId, publicKeyPem) {
  const id = String(keyId || '').trim();
  const pem = String(publicKeyPem || '').trim();
  if (!id) return { success: false, message: 'keyId is required' };
  if (!pem) return { success: false, message: 'publicKeyPem is required' };

  const trustedPath = getComplianceTrustedKeysPath(fromPath);
  const dir = path.dirname(trustedPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let keys = {};
  try {
    if (fs.existsSync(trustedPath)) {
      const parsed = JSON.parse(fs.readFileSync(trustedPath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) keys = parsed;
    }
  } catch {
    keys = {};
  }
  keys[id] = pem;
  fs.writeFileSync(trustedPath, `${JSON.stringify(keys, null, 2)}\n`, 'utf8');

  const status = getComplianceEvidenceStatus(fromPath);
  return { success: true, message: `Trusted key saved: ${id}`, ...status };
}

function removeComplianceTrustedKey(fromPath, keyId) {
  const id = String(keyId || '').trim();
  if (!id) return { success: false, message: 'keyId is required' };
  const trustedPath = getComplianceTrustedKeysPath(fromPath);
  if (!fs.existsSync(trustedPath)) {
    return { success: false, message: 'No trusted keys file found' };
  }
  let keys = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(trustedPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) keys = parsed;
  } catch {
    return { success: false, message: 'Could not read trusted keys file' };
  }
  if (!Object.prototype.hasOwnProperty.call(keys, id)) {
    return { success: false, message: `Key not found: ${id}` };
  }
  delete keys[id];
  fs.writeFileSync(trustedPath, `${JSON.stringify(keys, null, 2)}\n`, 'utf8');
  const status = getComplianceEvidenceStatus(fromPath);
  return { success: true, message: `Trusted key removed: ${id}`, ...status };
}

function signComplianceEvidence(fromPath, options = {}) {
  const evidencePath = getComplianceEvidenceConfigPath(fromPath);
  if (!fs.existsSync(evidencePath)) {
    return { success: false, message: `Evidence file not found: ${evidencePath}` };
  }

  const keyId = String(options.keyId || '').trim();
  const privateKeyPath = path.resolve(String(options.privateKeyPath || ''));
  const publicKeyPath = String(options.publicKeyPath || '').trim()
    ? path.resolve(String(options.publicKeyPath))
    : '';
  const approve = options.approve === true;

  if (!keyId) return { success: false, message: 'keyId is required' };
  if (!privateKeyPath) return { success: false, message: 'privateKeyPath is required' };
  if (!fs.existsSync(privateKeyPath)) return { success: false, message: `Private key not found: ${privateKeyPath}` };
  if (publicKeyPath && !fs.existsSync(publicKeyPath)) return { success: false, message: `Public key not found: ${publicKeyPath}` };

  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  } catch (err) {
    return { success: false, message: `Could not read evidence file: ${err.message}` };
  }

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

  try {
    const privatePem = fs.readFileSync(privateKeyPath, 'utf8');
    const privateKey = crypto.createPrivateKey(privatePem);
    const signatureValue = crypto
      .sign(null, Buffer.from(canonicalizeEvidencePayload(payload), 'utf8'), privateKey)
      .toString('base64');

    let publicPem = '';
    if (publicKeyPath) {
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
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

    if (approve) {
      const trustResult = addComplianceTrustedKey(fromPath, keyId, publicPem);
      if (!trustResult.success) {
        return { success: false, message: `Signed but failed to trust key: ${trustResult.message}` };
      }
    }

    const status = getComplianceEvidenceStatus(fromPath);
    return { success: true, message: `Evidence signed with key ${keyId}`, ...status };
  } catch (err) {
    return { success: false, message: `Signing failed: ${err.message}` };
  }
}

module.exports = {
  getComplianceEvidenceConfigPath,
  getComplianceTrustedKeysPath,
  parseDateOrNull,
  normalizeComplianceEvidence,
  canonicalize,
  canonicalizeEvidencePayload,
  readComplianceTrustedKeys,
  verifyComplianceEvidenceSignature,
  computeComplianceProofState,
  readComplianceEvidence,
  getComplianceEvidenceStatus,
  saveComplianceEvidence,
  addComplianceTrustedKey,
  removeComplianceTrustedKey,
  signComplianceEvidence
};
