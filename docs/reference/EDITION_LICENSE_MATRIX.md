# Edition License Matrix

## Overview
This repository is the PSF Core Enterprise OSS source line.

## Edition Labels and Display Strings
Use these labels consistently in UI, packaging, docs, and telemetry.

1. Enterprise OSS (free/open)
- Display: `Core v<version> ENTERPRISE OSS`
- Example: `Core v1.1.2 ENTERPRISE OSS`
- License: Apache-2.0
- Purpose: open enterprise baseline, community use, self-hosted operation.

2. Enterprise Subscription (commercial)
- Display: `Core v<version> ENTERPRISE SUBSCRIPTION`
- Example: `Core v1.1.2 ENTERPRISE SUBSCRIPTION`
- License: Commercial EULA
- Purpose: supported enterprise distribution, SLA/support channels, commercial features.

3. Secure Enterprise Profile (hardened/compliance)
- Display: `Core v<version> SEC:ENTERPRISE`
- Example: `Core v1.1.2 SEC:ENTERPRISE`
- License: Commercial EULA + policy/compliance controls
- Purpose: hardened profile for compliance-oriented deployments.

## Naming Rules
- Reserve `SEC:*` labels only for hardened/compliance profiles.
- Do not combine `OSS` with `SEC:*` in the same display string.
- Keep `version`, `edition`, and `security profile` parseable as separate fields.

## Licensing Split
1. Core / Enterprise OSS (this repo)
- License: Apache License 2.0
- Purpose: open development platform, interfaces, tooling, and community-facing runtime pieces.

2. Enterprise Subscription and secure commercial variants (separate distribution)
- License: Commercial EULA (separate terms)
- Purpose: support-bound packaging, hardening automation, operational controls, and enterprise support artifacts.

3. Safety-Critical Robotics Control (private modules)
- License: Proprietary (private)
- Purpose: mobility control intelligence, safety envelopes, and restricted control paths.

## Important
- Do not apply multiple licenses to the same file.
- Public repo files are Apache-2.0 unless explicitly stated otherwise.
- Commercial/private artifacts should remain outside this repository.
