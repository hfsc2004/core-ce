*Version: 1.1.3*
*Copyright © 2026 Pseudo SF*
# Mods Security Profiles Matrix (1.1.3, v1)

## Purpose
Define mod security posture by edition/profile, with clear enforcement for enterprise and maximum-security government/DoD environments.

This document pairs with `Mods_API_Spec_1_1_2.md`.

## Profiles
- `standard-default`
- `enterprise-managed`
- `datacenter-managed`
- `government-baseline`
- `government-dod-hardened`

`government-dod-hardened` is a strict preset under government edition.

## Control Matrix
| Control | standard-default | enterprise-managed | datacenter-managed | government-baseline | government-dod-hardened |
|---|---|---|---|---|---|
| Unsigned mod install | Optional (off by default) | Deny | Deny | Deny | Deny |
| Signed mod required | Optional | Required | Required | Required | Required + pinned root |
| Publisher allowlist | Optional | Recommended | Recommended | Required | Required (in-house only) |
| Online trust lookup | Allowed | Allowed | Allowed | Optional | Deny (offline only) |
| Dynamic code loading (`eval`, remote scripts) | Deny | Deny | Deny | Deny | Deny |
| Shell execution from mod | Deny | Deny | Deny | Deny | Deny |
| Raw filesystem access | Deny | Deny | Deny | Deny | Deny |
| Scoped mod storage | Allow | Allow | Allow | Allow | Allow (tight quota) |
| Network egress | Allow by user/admin policy | Allowlist only | Allowlist only | Default deny + allowlist | Deny by default; rare explicit exceptions |
| Voice capture capability | Allow by user policy | Allow by admin policy | Allow by admin policy | Default deny unless approved | Deny unless signed mission exception pack |
| Mod UI injection | Allow | Allow | Allow | Allow (admin-approved) | Allow (in-house signed only) |
| Hot reload in production | Optional | Deny | Deny | Deny | Deny |
| Audit log integrity | Basic | Signed append log | Signed append log | Tamper-evident | Tamper-evident + periodic hash attest |
| Mod install/remove attestation | Optional | Required | Required | Required | Required + dual-approval record |

## Capability Policy Defaults
- `standard-default`
  - Allow: `ui.panel`, `commands.register`, `storage.scoped`.
  - Prompt-gated: `events.subscribe.*`, `network.http`, `pipeline.stage`.
- `enterprise-managed` and `datacenter-managed`
  - Admin-granted only.
  - Deny by default for `network.http`, `voice.capture`, `voice.stt`, `voice.tts`.
- `government-baseline`
  - Default deny for all non-core capabilities.
  - Explicit signed approval per capability.
- `government-dod-hardened`
  - Only approved in-house packs.
  - Capabilities granted per mission profile; default deny everywhere.

## Install and Removal Security Requirements
1. Install must verify:
   - manifest schema,
   - package hash,
   - signature chain,
   - edition/profile policy compatibility.
2. Enable must verify:
   - capability grant subset only,
   - sandbox constraints active,
   - audit sink available.
3. Remove must execute:
   - code/data purge,
   - cache/model purge,
   - permission revocation,
   - attestation generation.
4. If any step fails:
   - mod remains disabled,
   - host remains operational,
   - incident logged.

## Voice-Sensitive Compliance Rules
For orgs sensitive to recording technology:
1. Voice code is distributed only via optional voice pack(s).
2. Restricted profiles can enforce `voice.*` capability hard deny.
3. Absence attestation must prove no voice pack artifacts are present.
4. Removal attestation must prove prior artifacts were purged.

## Required Audit Events
- `mod.install.requested`
- `mod.install.verified`
- `mod.install.denied`
- `mod.enabled`
- `mod.disabled`
- `mod.crashed`
- `mod.removed`
- `mod.capability.denied`
- `mod.attestation.generated`

Each event should include:
- timestamp,
- operator/principal,
- edition/profile,
- mod id/version,
- capability set,
- decision reason.

## Operational Modes
- `Dev Mode`
  - Reduced restrictions for local development only.
  - Must be explicitly enabled and visibly flagged in UI.
- `Production Mode`
  - Full policy enforcement.
  - No dev bypass accepted.

## Enforcement Ownership
- Policy resolution authority:
  - `launcher/modules/security-layer/security-layer.js`
- Mod manager authority (new module expected):
  - `launcher/modules/mod-manager/*`
- Audit integration:
  - `launcher/modules/audit/*`

## Acceptance Gates (v1)
1. Policy tests assert deny-by-default behavior per profile.
2. Signature verification tests assert invalid chain rejection.
3. Sandbox escape tests assert blocked unauthorized FS/network/shell access.
4. Install/remove attestation tests assert complete artifact accounting.
5. Government-dod-hardened tests assert:
   - unsigned mods rejected,
   - non-allowlisted publishers rejected,
   - `voice.*` denied without mission exception policy.
