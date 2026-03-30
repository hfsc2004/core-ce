# Security And Cluster Stub Roadmap (1.1.3)

See also: EditionSecurityPolicy_1_1_2.md (authoritative edition/security matrix).

## Purpose
This document marks what is implemented now vs intentionally stubbed for future Enterprise DC and Government editions.

## Implemented (Now)
- Security dispatch entrypoint: `launcher/modules/security-layer/security-layer.js`
- Edition security handlers:
- `security-passthrough.js` (standard)
- `security-rbac.js` (enterprise)
- `security-mac.js` (datacenter/government stub)
- `security-buckets.js` (bucket-label and policy decision stub, fail-open by default)
- Optional FIPS preflight hook: `security-fips.js` (stub, fail-closed for FIPS-required operations)
- Audit dispatcher: `launcher/modules/audit/audit-common.js`
- Audit backends:
- `audit-standard.js`
- `audit-enterprise.js`
- `audit-government.js` (hash-chain stub)
- Cluster gateway contract: `cluster-gateway.js`
- Swarm client contracts:
- `swarm-client.js`
- `swarm-auth.js`
- `swarm-routing.js`
- `swarm-fallback.js`
- Inference adapter contracts:
- `adapter-common.js`
- `adapter-llamacpp.js`
- `adapter-ollama.js`
- `adapter-vllm.js` (stub)
- `adapter-exllama.js` (stub)

## Stubbed / Not Compliance-Ready
- Security buckets policy enforcement (current bucket policy path is explicit stub/fail-open)
- FIPS validated crypto enforcement (no certified module integration yet)
- Government immutable signed audit ledger with external trust anchor
- MAC enforcement anchored to SELinux policy labeling and process domains
- Cross-domain guards and CAC/PIV chain-of-trust flow
- Swarm transport protocol and DC API gateway hardening
- vLLM / ExLLaMA2 operational adapters

## Guardrails
- Any `government` / FIPS-sensitive paths should fail closed when required primitives are unavailable.
- Stubs must remain explicit with `STUB` markers in code and logs.
- No certification claims until full compliance implementation and validation.

## Next Implementation Order
1. Enterprise RBAC + enterprise audit end-to-end in active flows.
2. Swarm client transport with authenticated gateway.
3. Adapter abstraction consumption in `inference-manager`.
4. SELinux-label aware MAC checks for Government edition build.
5. FIPS-integrated crypto provider and signed immutable audit.
