# Release Notes - 1.1.16

## Update Log - September 9, 2026

This release improves Recursive RLM behavior in PSF Terminal, especially for chunked prompt decomposition and trace visibility.

## Highlights

1. Recursive RLM chunk mapping
- Added `map_prompt_chunks` for deterministic prompt chunking plus bounded `sub_lm` mapping.
- Chunk summaries are stored in RLM `Scratch` so the root controller can work from compact intermediate state instead of repeatedly reading the prompt.

2. Final composition fallback
- Added `compose_final` to synthesize the final answer from the user task and Scratch summaries.
- Repeated prompt-inspection actions are redirected toward useful composition instead of returning a warning as the answer.

3. Terminal RLM visibility
- Fixed the PSF Terminal chatflow bridge so Recursive RLM uses BMOC-owned started sessions.
- RLM progress events now surface during long RLM work.
- Fresh Terminal windows now show an RLM status line with enabled/provider/profile/verbose state.

## Validation

1. `node --check launcher/modules/rlm-service/rlm-action-executor.js`
2. `node --check launcher/modules/rlm-service/rlm-root-loop.js`
3. `node --check launcher/modules/rlm-service/rlm-environment.js`
4. `node --check launcher/src/terminal-renderer-bootstrap.js`
5. `node --check launcher/src/terminal-renderer-init.js`
6. `node --check launcher/src/terminal-renderer-init-bridge.js`
7. `node launcher/modules/rlm-service/rlm-service.regression.test.js`
8. `node launcher/src/terminal-renderer-bootstrap.regression.test.js`
9. `node launcher/src/terminal-renderer-chatflow.regression.test.js`

## Notes

1. Model files are not included.
2. Local catalog backup files are not included.
