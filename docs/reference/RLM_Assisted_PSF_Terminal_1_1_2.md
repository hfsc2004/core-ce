# RLM Assisted Mode - PSF Terminal (v1.1.3)

## Purpose

RLM Assisted Mode adds a deterministic tool layer in front of normal chat replies for file/attachment workflows.

Goal:
1. Keep responses grounded to attached files.
2. Reduce model drift/hallucination on document tasks.
3. Preserve normal chat behavior for non-file prompts.

## Scope

Current implementation is in `PSF Terminal` renderer flow.

Primary files:
1. `launcher/src/terminal-renderer-rlm.js`
2. `launcher/src/shared-rlm-core.js` (shared orchestration core)
3. `launcher/src/terminal-renderer-chatflow.js`
4. `launcher/src/terminal-renderer-commands.js`
5. `launcher/src/terminal-renderer.js`
6. `launcher/src/terminal.html`
7. `launcher/modules/ipc-handlers.js`
8. `launcher/preload.js`

Coding Terminal RLM integration (current):
1. `launcher/src/coding-terminal-renderer-chat.js`
2. `launcher/src/coding-terminal-renderer-project.js`
3. `launcher/src/shared-rlm-core.js`
4. `launcher/main.js` (`select-import-file` now supports mode-aware picker behavior)
5. `launcher/preload.js` (`selectImportFile(options)`)

## Reuse Architecture

RLM orchestration is now split for reuse:
1. `shared-rlm-core.js`: common planner/tool orchestration.
2. `terminal-renderer-rlm.js`: thin surface adapter for PSF Terminal.

This allows Coding Terminal and MoE/IRG Pipeline Chat to import the same core behavior without re-implementing orchestration logic.

Current reuse status:
1. PSF Terminal: fully wired through adapter.
2. Coding Terminal: wired for attachment/document summarize intents using shared transport (`coding-terminal-renderer-chat.js`) on both `ollama` and `llama-cpp` backends.
3. MoE/IRG Pipeline Chat: pending adapter wiring.

Coding Terminal attachment workflow update:
1. `RLM Folder -> Attach File` now requests a generic file picker (`mode=attachment`) instead of JSON-only import filtering.
2. Catalog/model import flow remains JSON-filtered by default.

## Backend-Agnostic Transport Contract

`shared-rlm-core.js` now supports a pluggable inference transport:

1. `deps.sendMessage(modelName, messages, options)`
- Required for multi-backend reuse.
- Must return normalized response shape:
  - `{ success: true, response: { message: { content } } }`

2. Default fallback (when `deps.sendMessage` is omitted):
- Uses `window.electronAPI.ollamaSendMessage(...)`.

Coding Terminal transport endpoint:
1. IPC channel: `coding-terminal:send-inference-messages`
2. Preload API: `window.electronAPI.sendCodingInferenceMessages(payload)`
3. Backend routing:
- `ollama` or `llama-cpp` selected by Coding Terminal runtime config.

## How It Works

For eligible prompts, execution path is:
1. LLM planner returns strict JSON plan.
2. Deterministic tools execute the plan steps.
3. Final answer is produced from deterministic output.

Supported tool names:
1. `list_attachments`
2. `read_attachment`
3. `search_attachment`
4. `summarize_text`
5. `extract_query_terms`
6. `rank_chunks_by_terms`
7. `coverage_guard`

## Planner Model Contract

Planner JSON schema (preferred):

```json
{
  "steps": [
    { "tool": "list_attachments", "args": {} },
    { "tool": "summarize_text", "args": { "attachmentId": "..." } }
  ],
  "reason": "short"
}
```

Compatibility schema (still accepted):

```json
{
  "tool": "summarize_text",
  "args": { "attachmentId": "..." },
  "reason": "short"
}
```

## Multi-Step Planning

Planner can emit multiple tool steps, with preset-based limits:
1. `Fast`: up to 1 step
2. `Balanced`: up to 2 steps
3. `Deep`: up to 4 steps

This allows useful chaining such as:
1. `list_attachments -> summarize_text`
2. `read_attachment -> search_attachment`

## Quality Presets

`RLM Quality Preset` controls planner depth and summarization coverage.

1. `Fast`
- lowest latency
- fewer chunks and shorter summaries

2. `Balanced`
- default
- balanced latency and coverage

3. `Deep`
- highest coverage
- more chunk processing and larger summaries

## Budget Controls (Current)

RLM now enforces deterministic per-turn safety budgets, with explicit stop reasons reported in trace output.

Budget keys:
1. `max_tool_calls`
2. `max_recursion_depth`
3. `max_chunks_processed`
4. `max_runtime_ms`
5. `max_evidence_hits`

Default budgets by quality:
1. `Fast`
- tool calls: 20
- recursion depth: 2
- chunks processed: 24
- runtime: 20000 ms
- evidence hits: 16

2. `Balanced`
- tool calls: 40
- recursion depth: 3
- chunks processed: 48
- runtime: 45000 ms
- evidence hits: 28

3. `Deep`
- tool calls: 80
- recursion depth: 5
- chunks processed: 120
- runtime: 90000 ms
- evidence hits: 64

## Verbose Trace Mode

When `RLM Verbose Trace` is ON, terminal prints:
1. Planner JSON payload.
2. Per-step execution trace.
3. Coverage metadata for summarize flow.

Example trace:
1. `RLM Trace: tool=list_attachments -> summarize_text source=deterministic coverage=100% (3/3 chunks)`
2. `RLM Plan JSON: {...}`
3. `RLM Step: #1 list_attachments => ok`
4. `RLM Step: #2 summarize_text => ok`
5. `RLM Trace: ... stop=max_runtime_ms` (when a budget limit is reached)

## Attachment Selection Behavior

Selection order:
1. explicit `attachmentId`
2. explicit `attachmentName`
3. filename hint extracted from user prompt
4. auto-select if exactly one text-extractable attachment exists
5. deterministic clarification if multiple attachments remain

When ambiguous, user gets attachment IDs and prompt guidance instead of silent fallback.

## Trigger Gating

RLM path runs only when all are true:
1. `RLM Assisted Mode` enabled.
2. prompt looks like file/document intent.

Simple chit-chat prompts are excluded, so non-document chat stays normal.

## Settings and Commands

UI settings (Model Configuration):
1. `RLM Assisted Mode`
2. `RLM Quality Preset` (`Fast`, `Balanced`, `Deep`)
3. `RLM Verbose Trace`
4. `RLM Include Shared Attachments`
5. `RLM Budgets`:
- `Max Tool Calls`
- `Max Recursion Depth`
- `Max Chunks Processed`
- `Max Runtime (ms)`
- `Max Evidence Hits`

Terminal commands:
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

## Persistence

RLM preferences are persisted in browser local storage:
1. `psf_terminal_rlm_assisted`
2. `psf_terminal_rlm_verbose_trace`
3. `psf_terminal_rlm_quality`
4. `psf_terminal_rlm_include_shared_attachments`
5. `psf_terminal_rlm_budgets`

## Deterministic Tools Used

The RLM flow relies on deterministic tool runtime via IPC:
1. `chunk_text`
2. `find_lines`
3. `accumulate_summaries`

Attachment text access IPC:
1. `terminal:attachments-read-text`
2. `window.electronAPI.terminalAttachmentsReadText(...)`

## Operational Notes

1. RLM does not replace the base chat path. It is a selective assist layer.
2. Summarization uses deterministic extraction first, optional LLM rewrite second.
3. Rewrite is guarded to avoid regressions like asking users to re-upload files.
4. Budget stops are surfaced in trace with `stop=<reason>` for deterministic observability.

## UX Layer (Current)

Profile-first UX is now implemented:
1. `RLM Profile` selector:
- `Fast`
- `Balanced`
- `Deep`
- `Industrial Safe`
- `Custom`
2. Raw budget knobs are hidden behind `Advanced RLM Budgets`.
3. UI labels are user-facing:
- `Planning Steps Limit`
- `Reasoning Depth`
- `Document Coverage Limit`
- `Time Limit`
- `Evidence Sampling Limit`
4. Friendly stop notices are shown when limits are hit.
5. `/rlm budget ...` remains available for power users and diagnostics.

## Known Limits

1. Non-text binary attachments need extraction support before deterministic text tools can operate.
2. Very large files are bounded by read/chunk limits and preset caps.
3. Planner quality still depends on model instruction-following quality.

## Recommended Test Sequence

1. Attach one `.md` file.
2. Run `/rlm on`.
3. Run `/rlm quality deep`.
4. Ask: `Can you summarize the attached file?`
5. Confirm deterministic trace includes coverage.
6. Attach a second file and ask same question.
7. Confirm deterministic attachment selection prompt appears.

## Troubleshooting

1. Symptom: `RLM fallback: summarize_text requires text or attachmentId`
- Check `/attachments`.
- Ensure at least one text-extractable attachment exists.
- Provide explicit `attachmentId`.

2. Symptom: model asks to upload/provide file even when attached
- Ensure `RLM Assisted Mode` is ON.
- Use `/rlm status` to confirm quality/verbose state.
- Re-test with one attached file first.

3. Symptom: summary too short
- Set `/rlm quality deep`.

4. Symptom: RLM triggers on non-file prompts
- Verify gating in `terminal-renderer-chatflow.js` was not overridden by custom prompt logic.
