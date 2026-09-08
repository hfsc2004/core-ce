# Release Notes - 1.1.7

## Update Log - September 8, 2026

This release focuses on PSF Terminal llama.cpp launch correctness, cold-load handling, and BMOC session reuse.

## Highlights

1. Catalog launch path wins
- Catalog-launched llama.cpp models now keep their explicit GGUF path when PSF Terminal opens.
- Saved last-used terminal preferences no longer override an explicit launch URL.
- The llama.cpp model dropdown now prefers the launched model before falling back to persisted history.

2. BMOC duplicate-session prevention
- BMOC now compares normalized absolute GGUF paths before deciding whether an existing llama.cpp terminal session can be reused.
- llama.cpp HTTP 503 during model loading is treated as a live reusable process, preventing duplicate warmup sessions.
- First message sends now reuse the Catalog-launched session instead of loading the same model a second time.

3. llama.cpp runtime preparation
- Prepare can refresh stale local llama.cpp source when catalog models require newer architecture support such as `gemma4`.
- Local llama.cpp builds use conservative default parallelism to reduce memory pressure.
- Newer llama.cpp shared runtime libraries are staged alongside the server binary.
- Unsupported architecture failures now show a direct refresh/rebuild diagnostic.

## Validation

1. User-tested Gemma 4 Catalog Launch now opens PSF Terminal with the selected `gemma-4-E2B-it-Q8_0.gguf` model.
2. User-tested first-message flow now avoids the duplicate llama.cpp session and duplicate VRAM load.
3. Syntax checks passed for changed JavaScript modules using `node --check`.

## Notes

1. This release does not include model binaries, local runtime logs, or local CUDA build output.
2. The Gemma 4 GGUF still requires a llama.cpp runtime new enough to support `gemma4`.
