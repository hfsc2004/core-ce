*Version: 1.1.2*
*Copyright © 2026 Global Science Network*
# Mods API Spec (1.1.2, v1)

## Purpose
Define a pullable, removable mod system that supports:
- user-made mods in permissive editions,
- enterprise-governed mods,
- high-assurance government/DoD deployments with strict controls.

This spec is intentionally capability-scoped and fail-closed.

## Design Principles
- Good House Guest: mods must not assume unrestricted host access.
- JIT installability: mods can be added/removed post-deploy without core rebuild.
- Least privilege: every mod capability is explicit and policy-gated.
- Deterministic operations: install/enable/disable/remove flows are auditable.
- Absence guarantee support: features like voice can be physically absent unless a pack is installed.

## Runtime Architecture
- `Mod Host` (core): discovers packs, verifies signatures, enforces policy.
- `Mod Sandbox` (per mod process): isolated runtime for mod code.
- `Capability Bridge`: minimal IPC surface from sandbox to host.
- `Policy Engine`: resolves edition + org policy + allowlist/denylist.
- `Audit Sink`: immutable install/load/action events (edition-dependent strength).

## Package Format
- Extension: `.psfmod`
- Required contents:
  - `manifest.json`
  - `mod.js` (entrypoint)
  - `assets/` (optional)
  - `signature.json` (required in enterprise/datacenter/government)
- Optional:
  - `sbom.json`
  - `attestation.json`

## Manifest Contract (v1)
```json
{
  "id": "com.example.voice-pack",
  "name": "Voice Intelligence Pack",
  "version": "1.0.0",
  "apiVersion": 1,
  "apiRange": { "min": 1, "max": 1 },
  "editionSupport": ["standard", "enterprise", "datacenter", "government"],
  "publisher": {
    "name": "Example Corp",
    "signingKeyId": "ed25519:abcd1234"
  },
  "entrypoint": "mod.js",
  "capabilities": [
    "ui.panel",
    "commands.register",
    "events.subscribe.session",
    "events.emit.custom",
    "pipeline.stage",
    "storage.scoped",
    "network.http"
  ],
  "permissions": {
    "network": {
      "domains": ["localhost", "intranet.example.local"]
    },
    "storage": {
      "quotaMb": 256
    }
  },
  "integrity": {
    "sha256": "..."
  }
}
```

## Hook Surface (v1)
All hooks are async and must return structured errors.

- Lifecycle:
  - `onInstall(ctx)`
  - `onEnable(ctx)`
  - `onDisable(ctx)`
  - `onUninstall(ctx)`
  - `onHealthCheck(ctx)`
- UI:
  - `ui.registerPanel({ id, title, route, mount })`
- Commands:
  - `commands.register({ id, title, run })`
- Events:
  - `events.subscribe(channel, handler)` (allowlisted channels only)
  - `events.emit("mod.<modId>.*", payload)` (mod namespace only)
- Pipeline:
  - `pipeline.registerStage({ id, before, after, run })`
- Storage:
  - `storage.get(key)`, `storage.set(key, value)`, `storage.delete(key)`
  - scope: `mods/<modId>/...` only
- Network:
  - `network.request({ method, url, headers, body })`
  - domain/protocol policy enforced by host

## Capability Registry (v1)
- `ui.panel`
- `commands.register`
- `events.subscribe.session`
- `events.subscribe.models`
- `events.emit.custom`
- `pipeline.stage`
- `storage.scoped`
- `network.http`
- `voice.capture` (restricted; off by default; commonly blocked in government)
- `voice.stt`
- `voice.tts`

Future capabilities require `apiVersion` bump or compatibility declaration.

## Compatibility Rules
- Host declares `MOD_API_MIN` and `MOD_API_MAX`.
- Pack loads only when ranges overlap.
- Unknown capabilities are denied.
- Policy denial does not partially grant a capability bundle unless explicitly marked splittable.

## Install/Enable/Disable/Remove Lifecycle
1. Install:
   - unpack to `mods/installed/<modId>/<version>/`
   - verify checksum/signature
   - validate manifest schema
   - evaluate policy
   - write audit event
2. Enable:
   - spawn sandbox
   - establish capability bridge
   - run `onEnable`
3. Disable:
   - stop accepting mod-originated actions
   - run `onDisable`
   - terminate sandbox
4. Remove:
   - run `onUninstall` with timeout
   - delete binaries/assets/cache
   - delete scoped storage
   - emit removal attestation record

## CLI and Enterprise Workflow (v1)
- `psf mod init <mod-id>`: scaffold mod template + manifest + sample hooks.
- `psf mod dev`: run local sandboxed mod host.
- `psf mod test`: run hook contract tests + capability tests.
- `psf mod pack`: build `.psfmod`.
- `psf mod sign --key <keyref>`: produce `signature.json`.
- `psf mod verify <file.psfmod>`: schema + integrity + signature + policy preflight.
- `psf mod install <file.psfmod>`
- `psf mod enable <mod-id>`
- `psf mod disable <mod-id>`
- `psf mod remove <mod-id> --purge`
- `psf mod attest <mod-id|--absence voice.*>`: generate evidence report.

## Trust and Signing
- Standard: unsigned allowed by policy (default off for production build).
- Enterprise/Datacenter: signed mods required; optional publisher allowlist.
- Government/DoD: signed mods required, pinned trust roots, offline verification.

## Failure Behavior (Fail-Closed)
- Signature failure: refuse install/load.
- Policy mismatch: refuse capability grant.
- Runtime crash: disable mod, keep host healthy, emit audit.
- Hook timeout: terminate hook, mark unhealthy.

## Voice Pack Guidance
For compliance-sensitive deployments:
- Base app must not contain voice capture runtime by default.
- `voice-pack` installs as an optional `.psfmod`.
- Removal flow must purge all voice model/runtime artifacts and produce attestation.

## Implementation Phases
1. Host + sandbox + manifest + signature verification.
2. Core hooks (`lifecycle`, `ui.panel`, `commands.register`, `storage.scoped`).
3. Policy engine + audit integration + capability gating.
4. Voice Pack as first production mod.
5. Public SDK/docs for community mods (non-government profiles).
