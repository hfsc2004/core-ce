# Release Notes - 1.1.5

## Update Log - September 7, 2026

This release focuses on RLM hardening for PSF Terminal, especially when the active local backend is llama.cpp.

## Highlights

1. RLM routing for llama.cpp terminals
- RLM-assisted attachment requests now run before backend streaming.
- llama.cpp terminals can use the deterministic RLM engine instead of bypassing RLM and going straight to provider chat.
- Non-Ollama terminal backends are steered to the main-process RLM engine path for RLM-handled requests.

2. Regression coverage
- Added direct RLM engine coverage for no-attachment handling, deterministic attachment summaries, shared attachment opt-in, and mocked model-backed code generation.
- Added terminal chatflow coverage proving llama.cpp RLM requests call `rlm:run-turn` before provider streaming or BMOC llama.cpp startup.

3. Revision metadata
- Bumped PSF Core CE package and active catalog revision metadata to `1.1.5`.

## Validation

1. Syntax checks passed for changed JavaScript modules using `node --check`.
2. RLM engine regression tests passed.
3. Terminal chatflow llama.cpp routing regression tests passed.
4. Deterministic tools, attachments, and bucket-security regression tests passed.
5. `git diff --check` passed before commit.

## Notes

1. This release does not include model binaries, local runtime logs, or local CUDA build output.
2. The deterministic RLM path is now smoke-tested; broader model-backed tool execution still needs a real sandbox design before exposing general code/tool autonomy.
