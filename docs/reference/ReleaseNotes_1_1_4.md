# Release Notes - 1.1.4

## Update Log - September 7, 2026

This release focuses on PSF Terminal llama.cpp launch correctness, Qwen3.8 GGUF catalog integration, and local inference stability.

## Highlights

1. BMOC-managed llama.cpp terminal sessions
- PSF Terminal llama.cpp launches now route through BMOC Session Manager.
- Direct PSF Terminal launch opens without preloading an arbitrary GGUF model.
- The selected llama.cpp model starts on first send, using the selected GGUF path and BMOC-owned port.

2. Qwen3.8 GGUF catalog support
- Added Qwen3.8 4B Distill GGUF metadata to active catalog files.
- Kept `ollama_model` unset so llama.cpp launch paths do not wrap the GGUF into Ollama.
- Restored full GPU offload metadata (`gpu_layers: 34`) after resolving the duplicate-server VRAM conflict.

3. Runtime stability and diagnostics
- llama.cpp server selection now prefers the local CUDA build when GPU offload is requested.
- llama.cpp startup writes runtime logs to `.psf/logs/llama-cpp/`.
- Timed-out or failed llama-server startups terminate and wait for the child process group before reporting failure.

4. Chat behavior fixes
- llama.cpp OpenAI-style SSE streaming chunks now parse correctly.
- PSF Terminal llama.cpp requests now include conservative defaults for stop sequences, repeat penalty, output length, English anchoring, and default temperature.
- llama.cpp provider naming is normalized across `llamacpp`, `llama-cpp`, and `llama.cpp`.

5. RLM smoke-test hardening
- RLM-assisted attachment requests now run before backend streaming, so llama.cpp terminals can use the deterministic RLM engine instead of bypassing RLM.
- Added regression coverage for the main RLM engine and terminal chatflow llama.cpp routing.
- Verified deterministic attachment summaries, shared attachment opt-in, no-attachment handling, and mocked model-backed code generation.

## Validation

1. Syntax checks passed for changed JavaScript modules using `node --check`.
2. Active catalog JSON files parse successfully.
3. `git diff --check` / staged diff checks passed before commit.
4. RLM, deterministic-tools, attachments, and bucket-security regression tests passed.

## Notes

1. Model binaries, blobs, local CUDA build output, and runtime logs are not included in this release commit.
2. The Qwen3.8 GGUF required local llama.cpp compatibility work during testing, but generated build artifacts remain local-only.
