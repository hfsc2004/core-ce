# Release Notes - 1.1.6

## Update Log - September 7, 2026

This release focuses on PSF Terminal provider response handling and llama.cpp context behavior.

## Highlights

1. Provider thinking separation
- PSF Terminal now keeps OpenAI-compatible `reasoning_content`, `reasoning`, and `thinking` fields separate from final assistant answer content.
- Reasoning/thinking output is displayed in a distinct thinking block instead of inline with the answer.
- Thinking-only responses now produce a clear provider diagnostic instead of being treated as final answer text.

2. Longer local generation
- PSF Terminal no longer applies an implicit llama.cpp output cap when no explicit `num_predict` value is configured.
- Long generations are controlled by model stop behavior, configured stop sequences, explicit `num_predict`, or the Stop button.

3. Normal llama.cpp context
- The default llama.cpp terminal context is now 32768 tokens.
- BMOC records the effective llama.cpp context size in session metadata.
- Existing llama.cpp sessions with unknown or smaller context metadata are not reused when a larger context is requested.

4. Prompt budgeting
- PSF Terminal can omit older chat history when needed to fit a llama.cpp request into context.
- The current user message is not silently trimmed.
- If the current message is still too large, PSF Terminal shows an estimated token count and a reduce-by estimate before calling the provider.

## Validation

1. Syntax checks passed for changed JavaScript modules using `node --check`.
2. Terminal chatflow regression tests passed.
3. Existing RLM document-assist engine regression tests passed.
4. Deterministic tools, attachments, and bucket-security regression tests passed.
5. `git diff --check` passed before commit.

## Notes

1. This release does not include model binaries, local runtime logs, or local CUDA build output.
2. Existing explicit `num_ctx` and `num_predict` settings still override the new defaults.
