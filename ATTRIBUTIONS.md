# Attributions

Last updated: 2026-04-26

This document identifies major third-party components used in PSF Core Community Edition.
Third-party components remain the property of their respective owners and are governed by
their original licenses.

## Core Runtime and Frameworks

- Electron
- Node.js runtime and npm package ecosystem
- isomorphic-git
- node-pty
- better-sqlite3
- vectra

## Inference and AI Runtime Components

- llama.cpp runtime binaries and related artifacts
- GGUF model files and associated tokenizer/config assets

## Optional Interface Integrations

- Open WebUI integration paths and launcher integration code
- AnythingLLM integration paths and launcher integration code

## Hardware and Tooling Integrations

- Arduino tooling components
- esptool-related components
- Platform-specific helper binaries

## Explicit Credits

- Open WebUI project and contributors
- AnythingLLM project and contributors
- Node.js project and contributors
- Electron project and contributors
- npm package authors and maintainers across direct and transitive dependencies

## Dependency Inventory

- Full npm dependency attribution inventory (530 packages from lockfile):
  - `docs/reference/THIRD_PARTY_NPM_PACKAGES.md`

## License Source Locations

- Repository license: `LICENSE` (Apache-2.0)
- Convenience copy for UI: `LICENSE.txt`
- Project notice: `NOTICE`
- Third-party notice summary: `THIRD-PARTY-NOTICE.txt`
- Model license obligations: `MODEL-LICENSES.txt`
- Model-level license inventory: `docs/reference/MODEL_LICENSE_INVENTORY.md`
- Model license family pack: `licenses/models/INDEX.md`
- Llama terms pointer: `LLAMA-LICENSE.txt`
- Bundled runtime license folders:
  - `binaries/llama.cpp/*/licenses/`
  - `binaries/anythingllm/` (includes upstream license material)

## Attribution and Compliance Rules

1. Do not remove or alter third-party copyright notices.
2. Preserve upstream license files in redistributed packages.
3. Keep model-level license terms attached to each distributed model.
4. If a file is modified from upstream, preserve upstream notices and mark local changes.
5. Keep this attribution document, third-party notices, and provenance docs in sync for each release.

## Additional Policy References

- `docs/reference/IP_OWNERSHIP_AND_ATTRIBUTION.md`
- `docs/reference/ProvenanceMatrix.md`
- `docs/reference/THIRD_PARTY_NPM_PACKAGES.md`
- `docs/reference/MODEL_LICENSE_INVENTORY.md`
