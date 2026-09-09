# Release Notes - 1.1.18

## Update Log - September 9, 2026

This release advances Recursive RLM from structured prompt actions into the first working sandbox REPL execution path in PSF Terminal.

## Highlights

1. Sandboxed RLM execution
- Enabled BMOC-owned RLM sandbox execution for PSF Terminal.
- Added `sub_lm(...)` support inside sandboxed Python helper code through a host-mediated trampoline.
- The Python worker does not receive provider credentials, network access, or direct model transport.

2. Direct sandbox routing
- Prompts that explicitly ask for the RLM sandbox or REPL now require `execute_sandbox_code`.
- Sandbox directives no longer drift into ordinary `slice_prompt` / `sub_lm` controller loops.
- Required sandbox failures now stop clearly instead of silently falling back to normal answers.

3. Output budget fix
- Sandbox REPL subcalls can now use the larger final-composition token budget.
- The generated sandbox final-draft helper requests `1024` tokens.
- Terminal OpenAI-compatible request building now honors `maxTokens` as `max_tokens`.

## Validation

1. `node --check launcher/modules/ipc-handlers/rlm.js`
2. `node --check launcher/modules/session-manager.js`
3. `node --check launcher/modules/rlm-service/rlm-action-executor.js`
4. `node --check launcher/modules/rlm-service/rlm-environment.js`
5. `node --check launcher/modules/rlm-service/rlm-python-runner.js`
6. `node --check launcher/modules/rlm-service/rlm-root-loop.js`
7. `node --check launcher/modules/rlm-service/rlm-service.js`
8. `node --check launcher/modules/rlm-service/rlm-service.regression.test.js`
9. `python3 -m py_compile launcher/modules/rlm-service/rlm_python_worker.py`
10. `node launcher/modules/rlm-service/rlm-service.regression.test.js`
11. `node launcher/src/terminal-renderer-chatflow.regression.test.js`

## Notes

1. Model files are not included.
2. Local catalog backup files are not included.
3. Persistent multi-step REPL state is still planned; the current sandbox path replays one bounded helper program with host-mediated subcall cache.
