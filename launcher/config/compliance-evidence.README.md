# Compliance Evidence Manifest

File: `launcher/config/compliance-evidence.json`
Trusted keys: `launcher/config/compliance-trusted-keys.json`

This manifest drives the UI proof badge:
- `PROOF:UNVERIFIED`
- `PROOF:PROFILED`
- `PROOF:COMPLIANT`
- `PROOF:EXPIRED`

## State Rules

1. `EXPIRED`
- `expiresOn` exists and is in the past.

2. `COMPLIANT`
- `attestation` is `COMPLIANT`
- signature block is present and verifies (`ed25519`)
- signer key is trusted in `compliance-trusted-keys.json`
- not expired

3. `PROFILED`
- `profile` is `PROFILED`, or
- `attestation` is `PROFILED`, `ASSESSING`, or `ALIGNED`
- not expired

4. `UNVERIFIED`
- fallback when none of the above match.

## Example (Profiled)

```json
{
  "standard": "DODI-8500.01",
  "baseline": "RMF-IL5",
  "profile": "PROFILED",
  "evidenceId": "EV-2026-0007",
  "assessor": "Internal Security Team",
  "assessmentDate": "2026-03-12",
  "expiresOn": "2026-09-30",
  "attestation": "PROFILED",
  "signature": {
    "present": true,
    "verified": false
  }
}
```

## Example (Compliant)

```json
{
  "standard": "DODI-8500.01",
  "baseline": "RMF-IL5",
  "profile": "PROFILED",
  "evidenceId": "EV-2026-0042",
  "assessor": "Authorized 3PAO",
  "assessmentDate": "2026-04-03",
  "expiresOn": "2027-04-03",
  "attestation": "COMPLIANT",
  "signature": {
    "present": true,
    "verified": false,
    "algorithm": "ed25519",
    "keyId": "ed25519:compliance-signer",
    "signature": "<base64-signature>",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
  }
}
```

## Sign Helper

Script:
- `launcher/modules/version-manager/compliance-evidence-sign.js`

Example:

```bash
node launcher/modules/version-manager/compliance-evidence-sign.js \
  --app-dir launcher \
  --key-id ed25519:compliance-signer \
  --private-key /path/to/compliance.private.pem \
  --approve
```

Notes:
- `--approve` adds/updates the signer public key in `compliance-trusted-keys.json`.
- The runtime computes `PROOF:*` and only emits `PROOF:COMPLIANT` when signature verification passes.

## GUI Workflow

Use Settings -> System -> Compliance Evidence Manager:
1. Fill evidence metadata and click `Save Evidence`.
2. Add trusted signer key (`keyId` + PEM) or enable trust during signing.
3. Pick private key and click `Sign Evidence`.
4. Footer/About `PROOF:*` updates from verified status.
