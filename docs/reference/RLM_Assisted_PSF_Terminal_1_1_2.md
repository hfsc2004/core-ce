# Recursive Language Models - PSF Terminal Alignment (v1.1.10)

## Source Definition

The local reference paper is `RLM_MIT.pdf`, titled `Recursive Language Models`, by Alex L. Zhang, Tim Kraska, and Omar Khattab from MIT CSAIL.

Correct acronym:
- `RLM` = Recursive Language Model

Use `RLM` everywhere in code, docs, UI labels, and release notes.

## What An RLM Is

A Recursive Language Model is an inference-time scaffold around a base language model. It is designed to process prompts that are too large, too dense, or too structurally complex to place directly into the model context.

Core idea:
1. The full user prompt is stored outside the model context as an environment variable.
2. The model receives compact metadata about that environment, not the whole prompt.
3. The model writes code in a persistent REPL to inspect, slice, transform, and aggregate the external prompt.
4. The REPL can expose model-call functions so generated code can recursively call the same model or sub-models on selected prompt slices.
5. Intermediate values live in the environment, not in the model history.
6. The loop stops when the environment sets or returns the final answer.

An RLM is not defined by attachments. Files, attachments, codebases, pasted text, chat history, and generated intermediate artifacts can all become external prompt objects, but they are data sources inside the environment rather than the definition of RLM itself.

## Required Architecture

A correct PSF RLM implementation should include these parts.

1. Prompt Environment
- Stores the complete prompt and referenced materials as addressable variables.
- Provides safe read/slice/search helpers.
- Keeps large intermediate values out of the root model context.

2. Persistent REPL
- Executes model-authored code in a sandbox.
- Preserves variables between loop iterations.
- Returns bounded stdout/stderr metadata to the root model.

3. Recursive Model Calls
- Exposes a bounded `sub_rlm(prompt, options)` function.
- Allows generated code to call sub-models or sub-RLMs inside loops.
- Enforces recursion depth, wall-clock time, token, and call-count budgets.

4. Root Loop
- Calls the base model with environment metadata and recent bounded observations.
- Executes returned code.
- Updates environment state.
- Stops only when a final answer variable/result is set.

5. Finalization
- Returns a final answer from the environment.
- Avoids relying on a direct autoregressive answer when the answer was built programmatically.
- Supports long outputs assembled from environment variables.

## Difference From Current PSF Implementation

Current PSF code has an RLM document-assist scaffold. It can plan over attachments, execute deterministic tools, summarize chunks, and run limited verification/repair passes.

That is useful, but it is not yet a complete MIT-style Recursive Language Model.

Current implementation characteristics:
1. Triggered mostly by document/file/attachment intents.
2. Uses deterministic tools such as chunking, local search, extraction, and summary accumulation.
3. Does not yet create a general prompt-as-variable REPL environment.
4. Does not yet allow model-authored code to recursively invoke sub-RLM calls over arbitrary slices.
5. Does not yet support unbounded prompt/output handling through environment state.

Preferred terminology:
- `RLM` for the target MIT-style Recursive Language Model architecture.
- `RLM document-assist scaffold` for the current partial implementation.
- `deterministic tools` for bounded helper functions used by the scaffold.
- `attachments` for one possible external data source.

Avoid:
- Defining RLM as file/attachment handling.
- Using transposed or misspelled acronym forms.
- Calling the current attachment workflow a complete RLM.

## Interaction With Thinking Models

Models such as Qwen3.8 and Gemma 4 may already emit reasoning or thinking tokens. That is model-internal reasoning.

RLM is external inference-time recursion:
1. The model can think internally.
2. The RLM loop can also make the model act through a REPL.
3. The REPL can recursively call models over slices of external prompt state.

These are complementary for hard long-context tasks, but they should not be enabled blindly.

Recommended behavior:
1. Normal chat: RLM off.
2. Short creative writing: RLM off.
3. Long-context analysis: RLM available.
4. Dense aggregation or pairwise reasoning: RLM useful.
5. Codebase/document-corpus understanding: RLM useful when implemented with a real prompt environment.
6. Hardware or filesystem actions: RLM must run inside strict sandbox and policy controls.

## Safe Implementation Plan

Phase 1: Naming and Documentation
- Correct all transposed acronym references to `RLM`.
- Document the current scaffold as partial.
- Keep the MIT paper local and ignored from git.

Phase 2: Sandbox Design
- Add a restricted REPL process with CPU, memory, time, filesystem, and network limits.
- Provide only approved APIs to the REPL.
- Record every code execution and model sub-call in an audit trace.

Phase 3: Prompt Environment
- Store the complete user prompt as `Prompt`.
- Store attachments/codebase/chat history as explicit environment objects.
- Provide deterministic functions such as `len_prompt()`, `slice_prompt(start, end)`, `search_prompt(pattern)`, and `chunk_prompt(size, overlap)`.

Phase 4: Recursive API
- Expose `sub_lm(prompt, options)` and later `sub_rlm(prompt, options)`.
- Enforce `max_recursion_depth`, `max_subcalls`, `max_runtime_ms`, and `max_output_chars`.
- Support parallel sub-calls only after cancellation and cleanup are reliable.

Phase 5: Root Controller
- Implement the root loop:
  1. Send bounded environment metadata to the model.
  2. Execute returned code.
  3. Return bounded execution observations.
  4. Continue until `Final` is set or budget is exhausted.

Phase 6: UI
- Make RLM an explicit mode for long-context reasoning, not a default chat path.
- Show recursion depth, sub-call count, runtime, and finalization state.
- Keep model thinking output separate from RLM trace output.

## Budget Controls

RLM budgets should control both deterministic tool execution and recursive model behavior.

Required budgets:
1. `max_runtime_ms`
2. `max_root_iterations`
3. `max_recursion_depth`
4. `max_subcalls`
5. `max_parallel_subcalls`
6. `max_stdout_chars_per_iteration`
7. `max_environment_value_bytes`
8. `max_final_output_chars`

Current budget names such as `max_tool_calls`, `max_chunks_processed`, and `max_evidence_hits` belong to the document-assist scaffold. They may remain, but they are not sufficient for a full RLM.

## Existing Commands

Current UI/commands:
1. `/rlm status`
2. `/rlm on`
3. `/rlm off`
4. `/rlm verbose on`
5. `/rlm verbose off`
6. `/rlm quality fast`
7. `/rlm quality balanced`
8. `/rlm quality deep`
9. `/rlm shared on`
10. `/rlm shared off`
11. `/rlm budget tools <value>`
12. `/rlm budget depth <value>`
13. `/rlm budget chunks <value>`
14. `/rlm budget runtime <value>`
15. `/rlm budget evidence <value>`

These currently configure the partial document-assist scaffold. When a full RLM is implemented, `/rlm status` should distinguish:
1. `mode=document-assist`
2. `mode=recursive-repl`
3. current model/backend
4. prompt environment size
5. recursion depth limit
6. active sandbox policy

## Validation Checklist

A full RLM implementation is not complete until all are true:
1. The root model never receives the entire large prompt by default.
2. The prompt is accessible as an external variable.
3. Model-authored code can inspect and transform prompt slices.
4. Recursive sub-calls can be launched programmatically from the REPL.
5. Intermediate outputs can be stored in environment variables.
6. The final answer can be assembled from environment state.
7. Budgets stop runaway recursion and long loops.
8. The sandbox prevents unauthorized filesystem, shell, network, and process access.
9. Logs separate model thinking, RLM code, REPL observations, sub-calls, and final answer.
10. Simple chat bypasses RLM unless explicitly requested.

## Current Known Limits

1. Current PSF RLM code is mostly a deterministic document-assist path.
2. It should not be treated as the finished MIT-style RLM design.
3. The app needs a sandboxed REPL before allowing general model-authored code execution.
4. Recursive sub-calls need explicit cleanup and cancellation support through BMOC Session Manager.
