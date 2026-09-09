# Release Notes - 1.1.10

## Update Log - September 8, 2026

This release adds global Electron zoom controls and lays down the first testable foundation for a MIT-style Recursive Language Model service.

## Highlights

1. Global Electron zoom
- Ctrl/Cmd plus mouse wheel now zooms Electron pages in and out.
- Ctrl/Cmd plus `+` and `-` zooms with the keyboard.
- Ctrl/Cmd plus `0` resets zoom to 100%.
- Zoom is handled through a shared main-process module and preload IPC so it applies broadly to Core renderer windows that use the standard preload.

2. RLM foundation
- Added a BMOC-owned `rlm` service skeleton.
- RLM sessions are registered as processless BMOC sessions.
- Added a prompt environment with external `Prompt`, `Messages`, `Attachments`, `Scratch`, and `Final` state.
- Added dry-run root input generation that exposes bounded metadata instead of pushing the full prompt into model context.
- Added behavior-aware budgets for `thinking`, `non_thinking`, and `unknown` model profiles.

3. RLM sandbox groundwork
- Added a sandbox policy validator for model-authored Python snippets.
- Added a short-lived Python worker and Node runner for helper-only snippets.
- The runner transfers state through JSON, captures print output without corrupting the control channel, applies timeout/output limits, and merges `Scratch`/`Final` back into the environment when explicitly enabled for tests.
- Default Core wiring keeps sandbox execution disabled.

4. RLM structured actions
- Added a structured action executor for bounded prompt/environment operations.
- Supported actions include metadata inspection, prompt length, prompt slicing, prompt search, prompt chunking, scratch set/get/list, final set, sandbox validation, and sandbox execution routing.
- Unsupported actions fail closed.

## Still To Implement

1. Root RLM loop
- Ask the root model for one structured JSON action per iteration.
- Execute actions through `rlm:run-action`.
- Return only bounded observations and trace summaries to the model.
- Stop when `Final` is set or the budget expires.

2. Production sandbox hardening
- Add more adversarial escape tests.
- Add OS-level resource limits across supported platforms where possible.
- Decide when and how sandbox execution may be enabled outside the test harness.

3. Recursive model calls
- Add controlled `sub_lm` calls.
- Add `sub_rlm` only after `sub_lm` is reliable.
- Track parent/child sessions through BMOC.

4. User-facing integration
- Add Terminal UI mode/profile controls for Off, Document Assist, Recursive REPL, and Auto.
- Keep native model thinking, RLM trace, sandbox output, and final answer visually separate.
- Add user-selectable behavior profiles for thinking and non-thinking models when metadata is insufficient.

## Validation

1. Zoom regression tests passed.
2. RLM service regression tests passed.
3. JavaScript syntax checks passed for touched main-process, preload, RLM, and zoom modules.
4. The RLM Python worker compiled successfully.

## Notes

1. This release does not enable live model-authored code execution by default.
2. This release does not implement recursive `sub_lm` or `sub_rlm` calls yet.
3. This release does not include downloaded GGUF model files or generated local catalog backup files.
