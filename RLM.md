# Recursive Language Model Implementation Plan

## Purpose

This document maps PSF Core CE's current RLM-related code against the MIT CSAIL `Recursive Language Models` paper and defines the plan for implementing a correct RLM service in Core.

Correct acronym:
- `RLM` = Recursive Language Model

Reference paper:
- Local ignored file: `RLM_MIT.pdf`
- Title: `Recursive Language Models`
- Authors: Alex L. Zhang, Tim Kraska, Omar Khattab

## MIT RLM Definition

An RLM is an inference-time scaffold around a base language model. It does not push the whole prompt into the model context. Instead, it treats the prompt as part of an external environment and gives the model a way to inspect, transform, and recursively process that environment.

Required structure:
1. Store the full prompt as an external environment variable.
2. Give the root model compact metadata about the prompt and environment.
3. Run a persistent REPL where model-authored code can execute.
4. Expose safe functions for inspecting prompt slices and environment variables.
5. Expose recursive model-call functions, such as `sub_lm(...)` and `sub_rlm(...)`.
6. Keep intermediate values in the environment instead of model history.
7. Stop when a final answer variable/result is set.

## Current Core Status

Core currently has RLM-related components, but they are not yet a full MIT-style RLM.

Current implementation:
1. `launcher/modules/rlm-engine/rlm-engine.js`
- Main-process engine currently carrying the RLM label.
- Requires an attachment store.
- Lists and reads text attachments.
- Executes deterministic tools.
- Calls model transport for planning, verification, and code-generation assist.

2. `launcher/modules/rlm-engine/rlm-engine-mit-loop.js`
- Named as a MIT loop, but currently plans over attachments.
- Uses strict JSON planning.
- Executes known deterministic tools.
- Does not run model-authored code in a persistent REPL.
- Does not expose recursive sub-RLM calls.

3. `launcher/src/shared-rlm-core*.js`
- Renderer-side shared RLM document-assist scaffold.
- Supports attachment listing, reading, searching, chunking, summarization, evidence collection, and limited verify/repair.
- Contains recursive map-reduce summarization, but that recursion is deterministic reduction, not model-recursive REPL execution.

4. `launcher/modules/deterministic-tools/*`
- Useful support layer for bounded tools.
- Not an RLM by itself.
- Can become part of the RLM environment API.

5. BMOC Session Manager
- Already manages runtime session ownership and cleanup.
- Should own RLM service lifecycle, recursive sub-call sessions, cancellation, and port/process isolation.

Current conclusion:
- Core has a useful RLM document-assist scaffold.
- Core does not yet implement the MIT paper's prompt-as-environment, persistent REPL, model-authored-code, recursive-subcall RLM architecture.

## Gap Analysis

| MIT RLM Requirement | Current Core Status | Gap |
| --- | --- | --- |
| Prompt stored externally as variable | Partial for attachments only | Need generic `Prompt` environment object |
| Root model gets compact metadata | Partial | Need formal metadata contract |
| Persistent REPL | Missing | Need sandboxed REPL service |
| Model-authored code execution | Missing | Need code extraction, execution, observation loop |
| Programmatic recursive model calls | Missing | Need `sub_lm` and `sub_rlm` APIs available inside REPL |
| Environment-held intermediate state | Partial deterministic state only | Need durable per-turn environment state |
| `Final` answer contract | Missing | Need final variable/result protocol |
| Recursive depth/call budgets | Partial | Need model-recursion-specific budgets |
| Output assembled from environment | Missing | Need finalization from env variables |
| BMOC lifecycle control | Partial | Need full RLM session registration/cleanup |

## Target Architecture

### 1. RLM Service

Create a main-process RLM service owned by BMOC.

Proposed files:
1. `launcher/modules/rlm-service/rlm-service.js`
2. `launcher/modules/rlm-service/rlm-session.js`
3. `launcher/modules/rlm-service/rlm-environment.js`
4. `launcher/modules/rlm-service/rlm-repl-runner.js`
5. `launcher/modules/rlm-service/rlm-model-transport.js`
6. `launcher/modules/rlm-service/rlm-budget.js`
7. `launcher/modules/rlm-service/rlm-trace.js`

Responsibilities:
1. Create one RLM session per user turn or explicit long-context task.
2. Register session with BMOC.
3. Initialize the prompt environment.
4. Run the root model loop.
5. Execute sandboxed REPL code.
6. Provide recursive model-call functions.
7. Enforce budgets.
8. Return final answer or structured budget/error result.
9. Cleanup child processes and recursive sessions.

### 2. Prompt Environment

The prompt environment is the core missing piece.

Required variables:
1. `Prompt`
- Full user prompt string.

2. `Messages`
- Conversation history or selected history, stored outside root context.
- Root metadata exposes message count, roles, and lengths only by default.
- Message text previews should not be sent to the root model unless the current prompt explicitly asks for conversation history.

3. `Attachments`
- Attached files as metadata plus lazy read handles.

4. `Workspace`
- Optional codebase/project index or file handles when explicitly allowed.

5. `Scratch`
- Mutable dictionary for model-authored intermediate values.

6. `Final`
- Final answer variable. When set, the RLM returns it.

Required safe helpers:
1. `len_prompt()`
2. `slice_prompt(start, end)`
3. `search_prompt(pattern, max_hits)`
4. `chunk_prompt(chunk_size, overlap)`
5. `read_attachment(id, offset, length)`
6. `search_attachment(id, pattern, max_hits)`
7. `set_value(name, value)`
8. `get_value(name, offset, length)`
9. `list_values()`
10. `set_final(value)`

### 3. Sandboxed REPL

The REPL must execute model-authored code safely.

Recommended first runtime:
- Python subprocess with restricted API surface.

Do not expose:
1. unrestricted filesystem
2. unrestricted network
3. shell execution
4. process spawning
5. arbitrary imports
6. host environment variables

Controls:
1. dedicated working directory under `.psf/rlm/sessions/<session-id>/`
2. CPU/wall-clock timeout per execution
3. stdout/stderr truncation
4. max environment value size
5. max file writes inside sandbox
6. explicit allowlist for helper functions/modules
7. forced cleanup through BMOC

Observation contract:
1. Return executed code hash.
2. Return stdout/stderr prefix and lengths.
3. Return changed variable metadata, not full large values.
4. Return budget usage.
5. Return whether `Final` is set.

### 4. Recursive Model APIs

Expose bounded model calls inside the REPL.

Initial API:
```python
sub_lm(prompt: str, *, model=None, max_tokens=None, temperature=None) -> str
```

Later API:
```python
sub_rlm(prompt: str, *, depth=None, model=None, budgets=None) -> str
```

Rules:
1. Every sub-call goes through BMOC/session manager.
2. Every sub-call increments budget counters.
3. Recursive depth is explicit and enforced.
4. Sub-calls use bounded context and output limits.
5. Sub-call prompts can be programmatically generated from environment slices.
6. Sub-calls are cancelable when the parent session stops.

### 5. Root Loop

Root loop pseudocode:

```text
state = InitEnvironment(prompt=P, messages=M, attachments=A)
state.add_function(sub_lm)
state.add_function(sub_rlm)
history = [rlm_system_prompt, environment_metadata(state)]

while budgets.allow_next_iteration():
    model_output = root_model(history)
    code = extract_code_or_instruction(model_output)
    exec_result = repl.execute(code)
    trace.record(model_output, code, exec_result)
    history.append(code)
    history.append(observation_metadata(exec_result))
    if state.Final is set:
        return state.Final

return budget_or_failure_result(trace)
```

Important:
- The full prompt should not be appended to `history`.
- Large stdout and large variables should not be appended to `history`.
- Only metadata and bounded observations should return to the model.

### 6. Finalization

The model should set final output in the environment.

Accepted finalization forms:
1. Python helper: `set_final(value)`
2. Direct variable: `Final = value`
3. Structured JSON from REPL runner: `{ "final": "..." }`

Final output handling:
1. Read final value from environment.
2. Enforce max final chars unless user explicitly asks for long output.
3. Preserve answer exactly when generated programmatically.
4. Render model thinking separately from RLM trace.
5. Render RLM trace separately from final answer.

## Model Behavior Profiles

RLM should adapt to whether the selected model already has native thinking/reasoning behavior.

This should be treated as a deployment/runtime configuration, not as a separate RLM implementation. The same RLM service should run with different prompts, budgets, stopping rules, and UI defaults based on model behavior.

Recommended values:
1. `thinking`
- Model emits or internally uses reasoning/thinking behavior.
- Examples: Qwen3.8 thinking/distill variants, Gemma 4 reasoning-capable variants, other models with `reasoning_content`, `thinking`, or similar output channels.

2. `non_thinking`
- Model behaves like a standard instruct/chat model.
- It may still reason implicitly, but it does not expose or strongly rely on an explicit thinking trace.

3. `unknown`
- Catalog/runtime metadata is not enough to classify the model.
- User must choose the behavior profile before Recursive REPL mode is enabled.

4. `auto`
- Future convenience setting.
- Uses catalog metadata, model card hints, provider capabilities, and observed response fields to suggest `thinking` or `non_thinking`.
- Must fall back to user selection when confidence is low.

## Thinking Model RLM Policy

Thinking models should use RLM only when the problem is about context scale, dense access, or programmatic decomposition.

Good uses:
1. prompts or source material too large to fit in context
2. dense aggregation across many records
3. pairwise or combinatorial reasoning
4. codebase understanding across many files
5. verification against scattered evidence
6. long output assembled from many intermediate pieces

Avoid by default:
1. normal chat
2. short Q&A
3. simple creative writing
4. simple code snippets
5. prompts where all useful context already fits comfortably

Default behavior for `thinking` profile:
1. shorter root RLM instructions
2. fewer root iterations
3. lower recursion depth
4. lower sub-call count
5. stricter finalization rules
6. one verifier pass by default
7. no automatic recursive re-verification loop unless explicitly requested
8. preserve native model thinking in a separate thinking block
9. keep RLM trace separate from model thinking and final answer

Recommended thinking profile defaults:
1. Fast
- root iterations: 2
- recursion depth: 1
- sub-calls: 4
- runtime: 30 seconds

2. Balanced
- root iterations: 4
- recursion depth: 1
- sub-calls: 16
- runtime: 90 seconds

3. Deep
- root iterations: 8
- recursion depth: 2
- sub-calls: 64
- runtime: 5 minutes

Rationale:
- The model already spends compute on internal reasoning.
- The RLM should mostly provide external memory, prompt slicing, execution, and controlled recursive access.
- Overly permissive RLM settings can cause double-reasoning, slow starts, repeated verification, and runaway sub-calls.

## Non-Thinking Model RLM Policy

Non-thinking models need more scaffold from the RLM controller.

Default behavior for `non_thinking` profile:
1. more explicit root instructions
2. more structured planning prompts
3. more root iterations
4. more verifier/repair guidance
5. stronger JSON/code-output enforcement
6. more deterministic guardrails
7. slightly higher sub-call budgets when hardware allows

Recommended non-thinking profile defaults:
1. Fast
- root iterations: 3
- recursion depth: 1
- sub-calls: 8
- runtime: 45 seconds

2. Balanced
- root iterations: 6
- recursion depth: 2
- sub-calls: 32
- runtime: 120 seconds

3. Deep
- root iterations: 12
- recursion depth: 3
- sub-calls: 128
- runtime: 10 minutes

Rationale:
- The RLM must provide more of the explicit reasoning scaffold.
- The model may need additional planner/verifier structure to use the REPL correctly.
- Deterministic checks are more important because the model is less likely to self-correct internally.

## Deployment Metadata And User Selection

Catalog metadata should optionally declare model behavior.

Suggested catalog/runtime fields:
```json
{
  "rlm": {
    "model_behavior": "thinking",
    "supports_reasoning_output": true,
    "recommended_rlm_mode": "off",
    "recommended_recursive_profile": "balanced",
    "requires_user_confirmation_for_recursive_repl": true
  }
}
```

Allowed `model_behavior` values:
1. `thinking`
2. `non_thinking`
3. `unknown`

Possible metadata sources:
1. curated catalog entry
2. model card tags or description
3. provider capability response
4. observed streaming fields such as `reasoning_content`, `reasoning`, or `thinking`
5. user override

Metadata must not be trusted blindly. If the model card does not clearly identify behavior, Core should set behavior to `unknown`.

When behavior is `unknown`:
1. do not auto-enable Recursive REPL
2. show a model behavior selector
3. explain the impact in one sentence
4. persist the user's choice per model
5. allow later correction in model settings

User-facing choices:
1. `Thinking model`
- Use lighter RLM recursion because the model already reasons internally.

2. `Standard instruct/chat model`
- Use stronger RLM scaffolding and verifier structure.

3. `Not sure`
- Start with conservative limits and require explicit confirmation for Deep/Recursive REPL.

Persistence:
1. store per-model behavior override in PSF settings
2. keep catalog default separate from user override
3. expose both in model diagnostics
4. allow reset to catalog default

Deployment rule:
- RLM mode selection should resolve behavior in this order: user override, catalog metadata, provider capability, observed reasoning fields, `unknown`.

## UI/UX Plan

RLM should be explicit and mode-based.

Recommended modes:
1. `Off`
- Default for normal chat.

2. `Document Assist`
- Existing partial scaffold.
- Good for current attachment summarization/search workflows.

3. `Recursive REPL`
- Full MIT-style RLM mode.
- For long-context reasoning, dense aggregation, codebase understanding, and tasks requiring programmatic decomposition.

4. `Auto`
- Future mode.
- Uses intent detection to select plain chat, document assist, or recursive REPL.

Status display should show:
1. mode
2. model/backend
3. model behavior profile
4. behavior source: user override, catalog, provider, observed, or unknown
5. root iterations used
6. recursion depth
7. sub-call count
8. runtime
9. current budget limit
10. sandbox policy
11. finalization status

Trace display should separate:
1. model thinking
2. root model code
3. REPL observations
4. deterministic tool calls
5. recursive sub-calls
6. final answer

Model behavior selector:
1. Hidden when catalog metadata is confident and user has not requested advanced controls.
2. Shown when behavior is `unknown`.
3. Always available in advanced model settings.
4. Must affect RLM budgets and prompts immediately for new RLM sessions.

## Budget Model

Required RLM budgets:
1. `max_runtime_ms`
2. `max_root_iterations`
3. `max_repl_exec_ms`
4. `max_recursion_depth`
5. `max_subcalls`
6. `max_parallel_subcalls`
7. `max_prompt_slice_chars`
8. `max_stdout_chars_per_iteration`
9. `max_stderr_chars_per_iteration`
10. `max_environment_value_bytes`
11. `max_total_environment_bytes`
12. `max_final_output_chars`
13. `max_tokens_per_subcall`
14. `max_total_tokens`

Generic fallback defaults for `unknown` behavior:
1. Fast
- root iterations: 3
- recursion depth: 1
- sub-calls: 8
- runtime: 30 seconds

2. Balanced
- root iterations: 6
- recursion depth: 2
- sub-calls: 32
- runtime: 120 seconds

3. Deep
- root iterations: 12
- recursion depth: 3
- sub-calls: 128
- runtime: 10 minutes

4. Industrial Safe
- root iterations: 4
- recursion depth: 1
- sub-calls: 12
- runtime: 60 seconds
- stricter sandbox policy
- no filesystem writes except scratch
- no network

Behavior-specific defaults should override generic fallback defaults when model behavior is known.

Prompting differences:
1. `thinking`
- shorter root prompt
- direct instruction to use native reasoning internally but set `Final` promptly
- discourage repeated verification unless evidence changed

2. `non_thinking`
- more explicit algorithm
- stronger examples for slicing/chunking
- stricter JSON/code block extraction rules
- verifier/repair pass included by default

3. `unknown`
- conservative limits
- one root-loop example
- require explicit user confirmation before Deep profile

## BMOC Integration

BMOC must own RLM runtime lifecycle.

Required BMOC responsibilities:
1. Allocate RLM session IDs.
2. Register parent/child recursive sessions.
3. Track model server ports used by sub-calls.
4. Enforce one cleanup path for Stop/close/crash.
5. Kill REPL process groups on cancellation.
6. Release ports and temporary directories.
7. Prevent duplicate model warmups when recursive sub-calls use the same model.
8. Surface RLM status to Terminal/Coding Terminal/MoE.

Session metadata:
1. `service: rlm`
2. `surface: terminal | coding-terminal | moe`
3. `mode: recursive-repl`
4. `parentSessionId`
5. `rootModel`
6. `backend`
7. `sandboxPolicy`
8. `startedAt`
9. `budget`
10. `usage`

## Security Requirements

A full RLM allows model-authored code, so security is non-negotiable.

Minimum controls before enabling:
1. sandboxed subprocess
2. no shell escape
3. no arbitrary imports
4. no unrestricted filesystem access
5. no unrestricted network
6. no secrets in environment
7. no inherited user shell profile
8. per-execution timeout
9. per-session timeout
10. output truncation
11. value-size limits
12. audit trace
13. Stop button cancellation
14. crash cleanup

Future controls:
1. seccomp/firejail/bubblewrap on Linux
2. Job Objects on Windows
3. sandbox-exec replacement strategy on macOS where available
4. containerized RLM runner option
5. per-edition policy profiles

## Implementation Phases

### Phase 0: Documentation And Naming

Status: in progress.

Tasks:
1. Correct project docs to use `RLM`.
2. Clarify that current code is document-assist, not complete RLM.
3. Keep `RLM_MIT.pdf` local and ignored.
4. Add this roadmap.

Acceptance:
1. No project docs define RLM as attachments.
2. No project docs use transposed acronym forms.
3. Current implementation limitations are explicit.

### Phase 1: RLM Session Skeleton

Tasks:
1. Add `launcher/modules/rlm-service/`.
2. Add `createRlmService(deps)`.
3. Add `startSession(request)`, `runTurn(request)`, `stopSession(sessionId)`, `getSession(sessionId)`.
4. Register sessions with BMOC.
5. Add structured trace objects.

Acceptance:
1. RLM sessions appear in BMOC session listings.
2. Stop/close cleans session state.
3. No model-authored code execution yet.

### Phase 2: Prompt Environment

Tasks:
1. Implement `RlmEnvironment`.
2. Store `Prompt`, `Messages`, `Attachments`, `Scratch`, and `Final`.
3. Add safe metadata helpers.
4. Add bounded read/slice/search APIs.
5. Add environment serialization for trace/debug.

Acceptance:
1. Large prompt can be stored without entering model context.
2. Root metadata includes prompt length, prefix preview, available helpers, and budget.
3. Large values are retrievable only through bounded APIs.

### Phase 3: Sandboxed REPL

Tasks:
1. Implement Python runner process.
2. Inject only approved helper functions.
3. Block shell, imports, filesystem, network, and env access by default.
4. Add timeout and output truncation.
5. Persist variables between iterations.

Current implementation status:
1. Added the initial sandbox policy gate in `launcher/modules/rlm-service/rlm-sandbox-policy.js`.
2. The gate validates Python REPL snippets before execution and blocks imports, filesystem access, network access, subprocess access, host environment access, dynamic code execution, introspection, and interactive input.
3. Helper-only snippets can pass validation, but execution remains disabled.
4. The policy gate is exposed through BMOC-owned RLM service methods and IPC/preload channels.
5. This is a pre-execution boundary only; it is not the final runtime isolation layer.
6. Added a short-lived Python worker and Node runner for helper-only snippets.
7. The runner passes prompt and scratch state through JSON stdin/stdout, enforces wall-clock timeout and bounded stdout/stderr, and merges `Scratch`/`Final` back into the RLM environment after successful execution.
8. Core's default service wiring keeps sandbox execution disabled; tests can explicitly enable it to validate the runner.

Acceptance:
1. Simple code can set `Final`.
2. Infinite loops timeout and clean up.
3. Unauthorized filesystem/network attempts fail.
4. stdout/stderr are bounded.

### Phase 4: Root RLM Loop

Tasks:
1. Add root system prompt aligned to MIT RLM behavior.
2. Call root model with environment metadata.
3. Extract executable code blocks.
4. Execute code in REPL.
5. Return bounded observations.
6. Stop when `Final` is set.

Current implementation status:
1. Added a structured action executor in `launcher/modules/rlm-service/rlm-action-executor.js`.
2. The executor supports bounded environment actions: inspect metadata, prompt length, prompt slices, prompt search, prompt chunks, scratch set/get/list, final set, sandbox validation, and sandbox execution.
3. Unsupported actions fail closed.
4. Prompt slices are capped by the session budget before returning text.
5. The action executor is exposed through BMOC-owned service methods and IPC/preload channels.
6. Added a root-loop orchestrator in `launcher/modules/rlm-service/rlm-root-loop.js`.
7. The loop asks the root model for exactly one JSON action per iteration, executes it through the structured action executor, and returns only bounded observations back to the root model.
8. The loop stops when `Final` is set, when the RLM session is stopped, or when the root-iteration budget is exhausted.
9. The full prompt stays in the environment; regression coverage verifies hidden prompt tails are not included in root model messages.
10. IPC/preload expose `rlm:run-loop`.
11. PSF Terminal now has first opt-in wiring for Recursive RLM through the existing RLM toggle plus a visible RLM Engine selector.
12. When `Recursive RLM` is selected, substantive prompts route through `rlm:run-loop` before normal provider streaming.
13. Simple greetings bypass Recursive RLM so normal chat stays fast.
14. Sandbox execution remains disabled by default.
15. Prior conversation message text is hidden from root metadata by default so current-prompt RLM turns do not drift into older tasks.
16. Fresh-session PSF Terminal validation passed with a forced environment workflow: `len_prompt -> slice_prompt -> set_final`.
17. This confirms the root loop, prompt-as-environment access, finalization, and separate trace rendering are working in Terminal.

Current boundary:
- This is the RLM root-loop and environment foundation.
- It is not yet recursive in the full MIT sense of model-authored `sub_lm(...)` or `sub_rlm(...)` decomposition.
- The next major feature is adding bounded recursive sub-calls after sandbox and budget controls are hardened.

Acceptance:
1. Root model can inspect prompt slices.
2. Root model can create Scratch values.
3. Root model can set final output.
4. Full prompt is not sent to root model by default.

### Phase 5: Recursive Sub-Calls

Tasks:
1. Add `sub_lm(prompt, options)` to REPL API.
2. Route calls through existing provider/BMOC model session management.
3. Add budget counters.
4. Add depth tracking.
5. Add `sub_rlm(prompt, options)` after `sub_lm` is stable.

Acceptance:
1. Model-authored loops can call `sub_lm` over prompt chunks.
2. Sub-call count and depth are enforced.
3. Stop button cancels child calls.
4. Trace shows parent/child relationship.

### Phase 6: UI Integration

Tasks:
1. Add RLM mode selector: Off, Document Assist, Recursive REPL, Auto.
2. Update `/rlm status`.
3. Add trace panel sections.
4. Separate model thinking from RLM trace.
5. Add warnings for enabling Recursive REPL.

Current implementation status:
1. PSF Terminal exposes RLM as an opt-in mode through `RLM Mode`.
2. The settings panel now includes an `RLM Engine` selector with `Document Assist` and `Recursive RLM`.
3. `/rlm provider legacy` selects the existing Document Assist path.
4. `/rlm provider engine` selects the Recursive RLM root loop.
5. Recursive RLM uses Ollama transport for Ollama-backed sessions and OpenAI-compatible `/v1/chat/completions` transport for llama.cpp, vLLM, and OpenAI-compatible backends.
6. Recursive RLM output is rendered as the assistant answer, with compact root action trace lines rendered separately as system messages.
7. Verbose trace mode renders bounded root-loop observations as separate `RLM Step` system messages.
8. Full dedicated trace panels, behavior-profile controls, and user warnings are still pending.

Acceptance:
1. Normal chat defaults to Off.
2. Current document-assist workflows remain available.
3. Recursive REPL mode is visibly distinct.
4. Users can inspect code, observations, sub-calls, budgets, and final output.

### Phase 7: Tests And Benchmarks

Tasks:
1. Unit-test environment helpers.
2. Unit-test sandbox denial cases.
3. Unit-test root loop finalization.
4. Unit-test budget stops.
5. Integration-test BMOC cleanup.
6. Benchmark against direct context for long prompts.

Acceptance:
1. Tests prove prompt is not directly stuffed into model context.
2. Tests prove recursive sub-calls work.
3. Tests prove cleanup on Stop/close/crash.
4. Benchmarks show where RLM helps and where it hurts.

## Migration From Current Document Assist

Do not delete the current document-assist code immediately. It is useful and tested.

Migration strategy:
1. Rename user-facing descriptions to `RLM Document Assist` or `Document Assist`.
2. Keep existing attachment tools behind `mode=document-assist`.
3. Build full RLM behind `mode=recursive-repl`.
4. Share deterministic tools between both modes.
5. Let Auto mode choose later.

Code migration targets:
1. Move document-specific logic out of generic RLM naming over time.
2. Keep `rlm-engine` compatibility wrapper during transition.
3. Add new `rlm-service` for the full architecture.
4. Eventually make `rlm-engine` a facade that routes by mode.

## Risks

1. Security risk from model-authored code.
- Mitigation: sandbox first, recursive API later.

2. Runaway recursive model calls.
- Mitigation: strict budgets, BMOC parent/child tracking, Stop cancellation.

3. Poor local-model planner behavior.
- Mitigation: profile-specific prompts, small root iterations, test with thinking and non-thinking models.

4. User confusion between model thinking and RLM trace.
- Mitigation: separate UI sections and clear mode labels.

5. Latency.
- Mitigation: explicit mode, disabled for normal chat, parallel sub-calls only after cleanup is robust.

6. Context pollution.
- Mitigation: never append full prompt or large stdout to root history.

## Open Decisions

1. First sandbox technology per platform.
2. Whether Python is the only REPL initially or whether JavaScript should also be supported.
3. Whether `sub_lm` can use the same loaded llama.cpp session or should use separate BMOC-managed child sessions.
4. How much of Coding Terminal project context should be exposed in `Workspace`.
5. Whether Recursive REPL mode should be available in Core CE by default or hidden behind an advanced toggle.
6. How much trace detail should be persisted to disk.

## Near-Term Next Step

Phase 1 plus a small Phase 2 slice is now implemented as the first runtime foundation:
1. Added `launcher/modules/rlm-service/` with budget normalization, traces, session records, and a prompt environment.
2. Registered RLM sessions with BMOC as processless `rlm` sessions.
3. Created an environment object with `Prompt`, `Scratch`, and `Final` helpers.
4. Added no-code-exec dry-run mode that returns environment metadata to the root controller shape.
5. Added IPC/preload hooks for starting, inspecting, dry-running, listing, and stopping RLM sessions.
6. Added regression coverage proving dry-run mode does not pass the full prompt into root model input.

This gives the project the correct shape before introducing the security risk of model-authored code execution.

The next engineering step is hardening the sandbox boundary:
1. Add OS-level resource limits where supported.
2. Add broader adversarial tests for Python object escape attempts.
3. Add a persistent iteration state design without exposing unsafe Python runtime objects between executions.
4. Prove blocked IO, blocked network, bounded stdout/stderr, and timeout cleanup across supported platforms.
5. Keep recursive `sub_lm` and `sub_rlm` disabled until the sandbox is reliable under test.

The next RLM orchestration step is UI and policy integration:
1. Add model behavior controls for `thinking`, `non_thinking`, and `unknown`.
2. Use behavior-specific prompts and budget presets in the root loop.
3. Add a dedicated trace view so root actions, sandbox observations, model thinking, and final output are visually distinct.
4. Add explicit warnings before enabling Recursive RLM for unknown-behavior models or deep profiles.
5. Keep sandbox execution disabled by default until the hardening list above is complete.
