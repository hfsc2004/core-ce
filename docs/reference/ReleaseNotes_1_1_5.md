# Release Notes - 1.1.5

## Update Log - September 7, 2026

This release focuses on PSF Terminal's existing RLM-named attachment tool routing, especially when the active local backend is llama.cpp. This is not a full implementation of the MIT Recursive Language Model design.

## Highlights

1. Attachment tool routing for llama.cpp terminals
- RLM-named attachment requests now run before backend streaming.
- llama.cpp terminals can use the deterministic attachment tool engine instead of bypassing it and going straight to provider chat.
- Non-Ollama terminal backends are steered to the main-process attachment tool path for handled requests.

2. Regression coverage
- Added direct engine coverage for no-attachment handling, deterministic attachment summaries, shared attachment opt-in, and mocked model-backed code generation.
- Added terminal chatflow coverage proving llama.cpp attachment-tool requests call `rlm:run-turn` before provider streaming or BMOC llama.cpp startup.
- Added terminal chatflow coverage for reasoning/thinking-only provider stream chunks so similar OpenAI-compatible models do not appear to return empty answers.

3. Provider compatibility
- PSF Terminal now extracts assistant output from `content`, `reasoning_content`, `reasoning`, `thinking`, `text`, and top-level response fields for streaming and non-streaming OpenAI-compatible provider responses.
- The extraction is provider-response-shape based, not model-name based, so it applies to llama.cpp, vLLM, and other OpenAI-compatible backends with similar response fields.

4. Revision metadata
- Bumped PSF Core CE package and active catalog revision metadata to `1.1.5`.

## Validation

1. Syntax checks passed for changed JavaScript modules using `node --check`.
2. Existing RLM-named attachment engine regression tests passed.
3. Terminal chatflow llama.cpp attachment routing regression tests passed.
4. Deterministic tools, attachments, and bucket-security regression tests passed.
5. `git diff --check` passed before commit.

## Notes

1. This release does not include model binaries, local runtime logs, or local CUDA build output.
2. The existing deterministic attachment-tool path is now smoke-tested; a true Recursive Language Model implementation would require a separate REPL/sandbox design that treats the prompt as an external object and supports recursive model calls over prompt slices.
