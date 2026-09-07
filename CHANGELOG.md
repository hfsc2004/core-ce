# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v1.1.5 Core-CE] - 2026-09-07

### Added
- Added direct RLM engine regression coverage for deterministic attachment summaries, shared attachment opt-in, no-attachment handling, and mocked model-backed code generation.
- Added terminal chatflow regression coverage proving RLM-assisted llama.cpp attachment requests route to the RLM engine before provider streaming.

### Changed
- Bumped package and active catalog revision metadata to `1.1.5`.
- Routed RLM-assisted attachment requests before backend streaming so llama.cpp terminals can use the deterministic RLM engine.

### Fixed
- Fixed RLM-assisted mode being bypassed whenever PSF Terminal was using a non-Ollama backend.

## [v1.1.4 Core-CE] - 2026-09-07

### Added
- Added Qwen3.8 4B Distill GGUF catalog metadata for llama.cpp-based local inference without committing model binaries.
- Added llama.cpp runtime logging under `.psf/logs/llama-cpp/` for launch arguments, stdout/stderr, and exit status.

### Changed
- Routed PSF Terminal llama.cpp launches through BMOC Session Manager instead of the Ollama wrapper path.
- Changed direct PSF Terminal launch in llama.cpp mode to open model-selector-only, avoiding accidental preload of the first discovered GGUF.
- Restored Qwen3.8 full GPU offload metadata (`gpu_layers: 34`) after selector-only launch removed the duplicate-server VRAM conflict.
- Added llama.cpp chat defaults for PSF Terminal requests: bounded output, repeat penalty, stop sequences, English system anchoring, and lower default temperature.

### Fixed
- Fixed llama.cpp / `llamacpp` / `llama-cpp` provider name mismatches across launcher, terminal renderer, and model dropdown flows.
- Fixed llama.cpp OpenAI-style SSE streaming parse errors in the shared Ollama chat stream parser.
- Fixed terminal model dropdown listing for llama.cpp models when the global inference backend is llama.cpp.
- Fixed failed or timed-out `llama-server` startups leaving process groups around long enough to consume GPU memory on retry.
- Made terminal launch failure alerts copy their full message to the clipboard before displaying.

## [v1.1.3 Core-CE] - 2026-04-26

### Added
- Added this `CHANGELOG.md` to track patch and release updates in a standard format.

### Changed
- Hardened model file operations to constrain reads/deletes to the `models/` tree.
- Hardened mod loading by validating entrypoint paths and preventing install-root escape.
- Restricted external URL opening to approved schemes (`https`, `http`, `mailto`).
- Tightened `.env` token file write behavior with restrictive permissions.
- Pre-hardened future bucket feature IPC paths by deriving actor identity server-side and enforcing bucket authorization for list/create/delete/grant/revoke operations.

### Security
- Added regression coverage for mod entrypoint security validation (absolute/traversal rejection).
- Added regression coverage for bucket access control to enforce owner-only behavior when grants are absent.
