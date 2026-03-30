# Release Notes - 1.1.3

## Update Log - March 5, 2026

This release notes file was updated to include post-merge work completed on March 5, 2026.

### Added / Updated

1. Voice + Mods platform hardening
- Global Mods manager framework is now integrated in launcher settings.
- Signed-mod policy is enforced for all editions.
- Trusted signer workflow added (GUI + CLI): keygen, sign, trust approval, verify.
- `Browse...` dialogs in Mods now remember last-used location.

2. Voice capability gating (pilot)
- Voice feature surfaces are now gated by enabled mod capabilities (`voice.stt`, `voice.tts`).
- Startup TTS prewarm skips cleanly when voice capability is not available.

3. Version/About consistency fixes
- Main launcher About version now resolves from Version Manager source-of-truth (`launcher/package.json`).
- Footer version and copyright year now load dynamically.
- Settings About panel now resolves version + copyright year dynamically.
- Version Manager now force-syncs `launcher/package.json` during update runs.

4. Documentation and signing clarification
- End-user Mods guide expanded with production-style signing/trust flow.
- Ed25519 algorithm reference link added (RFC 8032).

### Branch Context

- Base merge reference from handoff: `7ac29c7`
- Current working branch during this update cycle: `feat/next-iteration-20260305-09`

## Scope

This release finalizes a major Coding Terminal renderer refactor and includes a targeted RLM attachment picker fix.

## Highlights

1. Coding Terminal renderer modularization
- Split monolithic renderer into focused modules:
  - `coding-terminal-renderer-bootstrap.js`
  - `coding-terminal-renderer-text.js`
  - `coding-terminal-renderer-shell.js`
  - `coding-terminal-renderer-events.js`
  - `coding-terminal-renderer-runtime.js`
  - `coding-terminal-renderer-runtime-models.js`
  - `coding-terminal-renderer-project.js`
  - `coding-terminal-renderer-ui.js`
  - `coding-terminal-renderer-git-actions.js`
  - `coding-terminal-renderer-editor.js`
  - `coding-terminal-renderer-chat.js`
  - `coding-terminal-renderer-chat-diff.js`
  - `coding-terminal-renderer-rag.js`
  - `coding-terminal-renderer-git.js`
- Main coordinator reduced substantially (`coding-terminal-renderer.js`) with behavior preserved.

2. RLM Folder attach picker fix (Coding Terminal)
- Root cause: `select-import-file` was JSON-filtered globally.
- Fix:
  - `main.js`: `select-import-file` now accepts optional mode/title.
  - `preload.js`: `selectImportFile(options)` now forwards options.
  - `coding-terminal-renderer-project.js`: RLM attach requests `mode=attachment`, enabling generic file selection.
- Result:
  - `RLM Folder -> Attach File` can attach normal files (not JSON-only).
  - Catalog import remains JSON-filtered by default.

## Validation

1. Syntax checks passed (`node --check`) for all changed/new Coding Terminal renderer modules.
2. Main/preload checks passed for picker-path changes.

## Notes

1. This release keeps runtime behavior stable while improving maintainability and future extension points.
2. Documentation updated to reflect mode-aware file picker behavior and RLM/Coding Terminal scope.
