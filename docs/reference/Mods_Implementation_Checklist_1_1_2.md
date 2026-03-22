# Mods Implementation Checklist (1.1.2, v1)

## Goal
Implement a secure mod platform with edition-aware policy enforcement, then ship `voice-pack` as the first production mod.

## Phase 0 - Baseline Prep
1. Create module skeletons:
   - `launcher/modules/mod-manager/mod-manager.js`
   - `launcher/modules/mod-manager/mod-manager-common.js`
   - `launcher/modules/mod-manager/mod-manifest.js`
   - `launcher/modules/mod-manager/mod-policy.js`
   - `launcher/modules/mod-manager/mod-signature.js`
   - `launcher/modules/mod-manager/mod-loader.js`
   - `launcher/modules/mod-manager/mod-audit.js`
2. Add constants and schemas:
   - `launcher/modules/mod-manager/mod-constants.js`
   - `launcher/modules/mod-manager/schemas/manifest-v1.json`
3. Create tests:
   - `launcher/modules/mod-manager/mod-manifest.regression.test.js`
   - `launcher/modules/mod-manager/mod-policy.regression.test.js`
   - `launcher/modules/mod-manager/mod-signature.regression.test.js`

## Phase 1 - Manifest + Compatibility
1. Implement manifest parsing/validation in `mod-manifest.js`.
2. Enforce required fields from `Mods_API_Spec_1_1_2.md`.
3. Add API range checks (`apiRange.min/max`) against host constants.
4. Reject unknown capability IDs by default.
5. Add regression tests for invalid manifest cases.

## Phase 2 - Signature and Integrity
1. Implement package hash verification in `mod-signature.js`.
2. Implement signature verification:
   - Standard: allow unsigned only when policy permits.
   - Enterprise/Datacenter/Government: require valid signature.
3. Add trust policy resolution using:
   - `launcher/modules/security-layer/security-layer.js`
4. Add test vectors for valid/invalid signatures and chain failures.

## Phase 3 - Policy Engine Integration
1. Implement capability grant resolution in `mod-policy.js` using profile matrix:
   - `standard-default`
   - `enterprise-managed`
   - `datacenter-managed`
   - `government-baseline`
   - `government-dod-hardened`
2. Add hard-deny gates for high-risk capabilities by profile.
3. Add explicit `voice.*` capability policy gates.
4. Wire policy checks into install/enable/load paths.
5. Add fail-closed behavior for policy parsing errors.

## Phase 4 - Runtime Loader and Sandbox
1. Implement install/uninstall directories:
   - `mods/installed/<id>/<version>/`
   - `mods/state/<id>/`
2. Implement lifecycle hooks (`onInstall`, `onEnable`, `onDisable`, `onUninstall`, `onHealthCheck`) in `mod-loader.js`.
3. Enforce per-mod scoped storage path.
4. Enforce capability bridge checks on every API call.
5. Implement timeouts for hook execution and crash quarantine.

## Phase 5 - IPC + Host Wiring
1. Register mod IPC handlers:
   - `launcher/modules/ipc-handlers/mods.js`
2. Wire into dispatcher:
   - `launcher/modules/ipc-handlers.js`
3. Add preload bridge endpoints:
   - `launcher/preload.js` (enterprise edition)
   - `launcher/preload-standard.js` (standard/runtime-safe subset)
4. Add settings UI panel integration:
   - `launcher/src/renderer/renderer-enterprise/settings-modal-core.js`
   - `launcher/src/renderer/renderer-enterprise/settings-modal-templates.js`

## Phase 6 - Audit and Attestation
1. Implement mod event audit wrapper in `mod-audit.js`.
2. Emit required events from matrix spec:
   - install requested/verified/denied
   - enabled/disabled/crashed/removed
   - capability denied
   - attestation generated
3. Route events through:
   - `launcher/modules/audit/audit-common.js`
4. Implement attestation outputs:
   - install attestation
   - removal attestation
   - absence attestation for `voice.*`

## Phase 7 - CLI Tooling
1. Add `psf mod` CLI entrypoint (location based on existing tooling conventions).
2. Implement commands:
   - `init`, `dev`, `test`, `pack`, `sign`, `verify`, `install`, `enable`, `disable`, `remove`, `attest`
3. Ensure CLI `verify` runs manifest + signature + policy preflight.

## Phase 8 - Voice Pack Pilot Mod
1. Create pilot package:
   - `mods/voice-pack/manifest.json`
   - `mods/voice-pack/mod.js`
2. Move voice capabilities behind mod gates:
   - `launcher/modules/voice-to-text/*`
   - `launcher/modules/ipc-handlers/voice-to-text.js`
3. Ensure base app behavior when voice pack absent:
   - no `voice.*` hooks callable
   - settings UI hides/locks voice controls per policy
4. Implement removal purge:
   - voice runtime/cache/model artifacts
   - voice settings keys cleanup
   - post-remove attestation

## Phase 9 - Security Hardening (Enterprise/Government)
1. Add publisher allowlist and denylist management.
2. Add offline verification mode for government/DoD.
3. Enforce in-house-only signed mods for `government-dod-hardened`.
4. Disable production hot-reload in managed profiles.
5. Add periodic integrity scan of installed mod artifacts.

## Phase 10 - Release Gates
1. Unit tests pass for manifest/policy/signature/loader/audit.
2. Policy matrix test pass for all edition/profile combinations.
3. Negative tests:
   - unsigned package rejection where required
   - invalid signature rejection
   - unauthorized capability denial
   - failed uninstall leaves mod disabled with incident log
4. Voice absence attestation pass in restricted profile.
5. Documentation sync:
   - `Mods_API_Spec_1_1_2.md`
   - `Mods_Security_Profiles_Matrix_1_1_2.md`
   - `SecurityRoadmap_1_1_2.md`

## Immediate First PR Slice (recommended)
1. Phase 0 + Phase 1 only.
2. Include test scaffolding and schema validation.
3. No runtime loading yet.
4. Deliverable: host can parse and verify a manifest deterministically.
