# Edition Security Policy (1.1.2)

## Purpose
Prevent architecture drift and zombie code by documenting the authoritative edition/security behavior for current and future builds.

## Canonical Matrix
- `standard`
  - Security Model: `none`
  - Security Mode: `passthrough`
  - Cluster/Mesh Join: `blocked`
  - Notes: local-only; no swarm participation.
- `enterprise`
  - Security Model: `rbac` (default), optional `mac`
  - Cluster/Mesh Join: `allowed`
  - Notes: commercial enterprise target.
- `datacenter`
  - Security Model: `rbac` (default), optional `mac`
  - Cluster/Mesh Join: `allowed`
  - Notes: bare-metal/LXC cluster target.
- `government`
  - Security Model: `mac` (default)
  - Security Mode: `mac+fips-stub` currently
  - Cluster/Mesh Join: `allowed`
  - Notes: compliance features are stubs until validated implementation.

## Runtime Controls (Current)
- `PSF_EDITION`
  - Accepted practical values: `standard`, `enterprise`, `datacenter`, `government`.
- `PSF_SECURITY_MODEL`
  - For `enterprise`/`datacenter`: `rbac` (default) or `mac`.
  - Ignored for `standard` (forced to `none`).
  - `government` defaults to `mac`.
- `PSF_FIPS_MODE`
  - Enables FIPS preflight/stub behavior, not certified enforcement.

## Non-Negotiable Guardrails
- Standard edition must never join cluster/mesh.
- Security model resolution must be centralized (single authority):
  - `launcher/modules/security-layer/security-layer.js`
- Any gov/FIPS path must remain explicitly labeled `STUB` until validated.
- No feature should claim compliance based on stub modules.
- If behavior changes, update this file and `SecurityRoadmap_1_1_2.md` in the same commit.

## Files Owning This Policy
- `launcher/modules/security-layer/security-layer.js`
- `launcher/modules/swarm-client/swarm-client.js`
- `launcher/modules/cluster-protocol/cluster-gateway.js`
- `launcher/modules/security-layer/security-fips.js`
- `launcher/modules/audit/audit-common.js`

## Future TODO (Controlled Evolution)
1. Move edition/security policy into signed build metadata for Enterprise/DC distributions.
2. Add startup diagnostics panel showing policy source and active resolution.
3. Add test suite that asserts matrix invariants for every edition.
4. Replace gov stubs with validated implementations (SELinux MLS, signed immutable audit, FIPS module integration).
