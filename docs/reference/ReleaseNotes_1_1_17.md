# Release Notes - 1.1.17

## Update Log - September 9, 2026

This release fixes Recursive RLM final-answer cutoff behavior seen during `map_prompt_chunks -> compose_final` testing in PSF Terminal.

## Highlights

1. Final composition token budget
- Found the cutoff cause: llama.cpp RLM IPC capped every subcall at `256 max_tokens`.
- Kept root action and chunk-summary calls small.
- Tagged `compose_final` as `final_composition` so it can use the larger requested final-answer budget.

2. Repeated map recovery
- Repeated `map_prompt_chunks` calls after Scratch summaries exist now redirect to `compose_final`.
- This prevents wasted subcall cycles while preserving the useful chunk-map work.

3. Finish reason diagnostics
- RLM subcall results now preserve provider finish reasons from OpenAI-compatible responses.
- Future cutoffs can be diagnosed from trace data instead of inferred from output shape alone.

## Validation

1. `node --check launcher/modules/rlm-service/rlm-action-executor.js`
2. `node --check launcher/modules/rlm-service/rlm-service.js`
3. `node --check launcher/modules/ipc-handlers/rlm.js`
4. `node --check launcher/modules/rlm-service/rlm-root-loop.js`
5. `node launcher/modules/rlm-service/rlm-service.regression.test.js`

## Notes

1. Model files are not included.
2. Local catalog backup files are not included.
