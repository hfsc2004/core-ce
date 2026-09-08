# Release Notes - 1.1.8

## Update Log - September 8, 2026

This release focuses on reducing PSF Terminal delay before llama.cpp inference begins.

## Highlights

1. Stricter llama.cpp ready checks
- llama.cpp startup now waits for `/health` to report a ready 2xx status.
- HTTP 503 while the model is still loading no longer lets a cold server look ready for first chat.
- BMOC still treats loading llama.cpp sessions as live for reuse, so duplicate session prevention remains intact.

2. Faster normal chat preparation
- Ordinary chat turns no longer build attachment context before the provider request.
- Image attachment scanning now runs only for image/vision-related prompts.
- Terminal keeps a lightweight local attachment-present flag so attached-file workflows can still include context after files are added.

3. Timing diagnostics
- PSF Terminal now logs timing for pre-provider request build, BMOC session ensure, llama.cpp prompt estimate, provider response headers, and first stream chunk.
- These logs make it easier to distinguish app-side preparation delay from model load or prompt-evaluation delay.

## Validation

1. User-tested PSF Terminal responses are much faster after the slow-delay changes.
2. Syntax checks passed for changed JavaScript modules using `node --check`.
3. Terminal chatflow regression tests passed, including coverage that ordinary chat skips attachment context work.

## Notes

1. This release does not include model binaries, local runtime logs, or local catalog experiment changes.
2. Cold llama.cpp launches may spend more time before Terminal is ready, because startup now waits for the model to finish loading rather than shifting that wait into the first prompt.
