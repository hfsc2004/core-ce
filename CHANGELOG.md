# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v1.1.19 Core-CE] - 2026-09-10

### Added
- Added grounded Recursive RLM attachment summarization through `summarize_attachment`, including matching text-extractable attachments, reading extracted PDF/text content, chapter isolation, chunk summaries, and final composition from excerpt notes.
- Added Recursive RLM actions for attachment metadata and text access: `list_attachments`, `read_attachment`, `search_attachment`, and `summarize_attachment`.
- Added regression coverage for chapter-summary trigger detection, grounded attachment chapter reads, and root-loop routing that summarizes attachments before any root-model guesswork.

### Fixed
- Fixed normal file/chapter prompts routed to Recursive RLM so they no longer stop at `inspect_environment_metadata -> set_final` with an ungrounded model guess.
- Fixed handled Recursive RLM failures in PSF Terminal so they show an RLM error/trace instead of falling through to ordinary provider chat.

### Changed
- Bumped package and active catalog revision metadata to `1.1.19`.
- Updated RLM documentation with user-facing trigger instructions and grounded attachment-summary behavior.

## [v1.1.18 Core-CE] - 2026-09-09

### Added
- Added host-mediated `sub_lm(...)` support inside the sandboxed RLM Python helper path, including request trampolining, cache reuse, budget exhaustion handling, and bounded trace metadata.
- Added Recursive RLM root-loop guidance and required-action detection for explicit sandbox/REPL prompts so `execute_sandbox_code` runs when the user asks for the sandbox path.

### Fixed
- Enabled BMOC-owned RLM sandbox execution in PSF Terminal instead of leaving the real Terminal service in disabled sandbox mode.
- Fixed sandbox-action failure propagation so required sandbox actions fail visibly instead of silently falling back to normal root-controller calls.
- Fixed llama.cpp RLM sandbox REPL subcalls being capped like short helper calls; sandbox final-draft calls can now use the larger final-composition budget.
- Fixed Terminal OpenAI-compatible request building so `maxTokens` is honored as `max_tokens` in addition to `num_predict`.

### Changed
- Bumped package and active catalog revision metadata to `1.1.18`.
- Updated RLM documentation with implemented sandbox bridge behavior and remaining REPL persistence work.

## [v1.1.17 Core-CE] - 2026-09-09

### Fixed
- Fixed Recursive RLM final composition truncation for llama.cpp by separating final-composition subcalls from short helper subcalls; root JSON actions and chunk summaries stay tightly capped, while `compose_final` can use the larger requested output budget.
- Fixed repeated `map_prompt_chunks` calls after Scratch summaries already exist by redirecting the second map pass to `compose_final`.
- Preserved llama.cpp/OpenAI-compatible finish reasons in RLM subcall results and traces so future cutoffs can be diagnosed as `length`, `stop`, or provider-specific completion states.

### Changed
- Bumped package and active catalog revision metadata to `1.1.17`.

## [v1.1.16 Core-CE] - 2026-09-09

### Added
- Added `map_prompt_chunks` to the Recursive RLM action executor so Core can deterministically chunk the external prompt, run bounded `sub_lm` calls over selected chunks, and store summaries in `Scratch`.
- Added `compose_final` so Recursive RLM can synthesize a final answer from the user task and Scratch summaries when the root controller gets stuck doing extra prompt inspection.
- Added PSF Terminal startup RLM status output so a fresh Terminal shows whether RLM is enabled, which provider is selected, the active profile, and verbose trace state.
- Added regression coverage for chunk mapping, final composition, repeated chunk inspection recovery, startup RLM status, and the Recursive RLM session-start bridge.

### Fixed
- Fixed PSF Terminal Recursive RLM wiring so the chatflow receives `rlm:start-session`, allowing BMOC-owned RLM sessions, progress events, and final trace messages to work from Terminal.
- Fixed repeated `chunk_prompt` loops by redirecting no-progress prompt inspection toward chunk mapping or final composition instead of spinning until the iteration budget is exhausted.

### Changed
- Bumped package and active catalog revision metadata to `1.1.16`.
- Updated RLM documentation with the implemented chunk-map, progress, and final-composition behavior.

## [v1.1.15 Core-CE] - 2026-09-09

### Fixed
- Fixed Gemma 4 E2B IT GGUF catalog metadata so the Catalog Browser shows `llama.cpp` instead of the fallback `runtime?` label.
- Fixed Catalog Browser readiness indicators so downloaded llama.cpp/GGUF models are treated as runnable without requiring an Ollama wrapper.

### Changed
- Bumped package, installer, and active catalog revision metadata to `1.1.15`.

## [v1.1.14 Core-CE] - 2026-09-09

### Added
- Added a PSF Terminal `RAG` header button for persistent/shared bucket management, keeping durable context separate from one-turn compose attachments.
- Added regression coverage for per-window image attachment scoping and llama.cpp vision message payloads.

### Fixed
- Fixed stale Terminal image attachments leaking into fresh chats when BMOC reused the same llama.cpp port.
- Fixed the compose-box `+` attachment action so it attaches to the current Terminal scratch session instead of silently using an active persistent bucket.
- Fixed ordinary chat prompts so image bytes are not sent unless the prompt has image intent.

### Changed
- Bumped package, installer, and active catalog revision metadata to `1.1.14`.
- Clarified PSF Terminal attachment semantics: compose-box `+` is session scratch context; RAG/buckets remain persistent/shared context for multi-agent workflows.

## [v1.1.13 Core-CE] - 2026-09-09

### Added
- Added first-pass bounded `sub_lm` support to the RLM action executor and root loop, including model-transport routing, subcall usage accounting, budget exhaustion handling, and regression coverage.

### Fixed
- Fixed duplicate llama.cpp PSF Terminal sessions by normalizing BMOC backend metadata (`llama.cpp`, `llama-cpp`, and `llamacpp`) before reuse checks.
- Fixed Catalog-launched llama.cpp terminals so model config runtime parameters are loaded before the initial BMOC server start, preventing first-message context/GPU mismatches from starting a second server.
- Fixed PSF Terminal launcher behavior on fresh installs so llama.cpp terminals no longer require Ollama to be installed.
- Fixed fresh install scripts so they resolve the launcher path relative to the install script location instead of the caller's current directory.
- Disabled the Ollama-only `/api/ps` GPU verifier inside llama.cpp Terminal windows.

### Changed
- Bumped package and active catalog revision metadata to `1.1.13`.

## [v1.1.12 Core-CE] - 2026-09-08

### Changed
- Bumped package and active catalog revision metadata to `1.1.12`.
- Updated RLM documentation to record fresh-session PSF Terminal validation and clarify that the current implementation is the root-loop/prompt-environment foundation, with recursive `sub_lm`/`sub_rlm` calls still pending.

## [v1.1.11 Core-CE] - 2026-09-08

### Added
- Added the RLM root-loop orchestrator for one-action-per-iteration model control, bounded observations, budget exhaustion handling, finalization detection, and IPC/preload access through `rlm:run-loop`.
- Added PSF Terminal opt-in wiring for Recursive RLM mode, including a visible RLM engine selector, recursive-loop routing before provider streaming, llama.cpp/OpenAI-compatible root model transport, compact trace notices, and regression coverage.

### Fixed
- Fixed PSF Terminal bootstrap wiring so Recursive RLM receives the `rlm:run-loop` bridge instead of falling back with `recursive RLM unavailable`.
- Replaced launch failure alerts with copyable/selectable error dialogs so long llama.cpp and Terminal startup errors can be copied for debugging.
- Hid prior conversation text previews from Recursive RLM root metadata by default to reduce task drift during current-prompt RLM turns.

### Changed
- Bumped package and active catalog revision metadata to `1.1.11`.

## [v1.1.10 Core-CE] - 2026-09-08

### Added
- Added the first BMOC-owned RLM service foundation with processless RLM sessions, prompt-environment dry-run support, behavior-aware budgets, IPC/preload hooks, and regression coverage.
- Added an RLM sandbox policy gate that validates model-authored Python REPL snippets, blocks dangerous capabilities, stays execution-disabled by default, and is exposed through BMOC-owned IPC/preload hooks.
- Added a testable short-lived RLM Python worker and Node runner for helper-only snippets with JSON state transfer, timeout handling, bounded output, and sandbox execution disabled in default Core wiring.
- Added a structured RLM action executor for bounded prompt/environment operations, fail-closed action handling, sandbox validation/execution routing, and future root-loop orchestration.
- Added global Electron page zoom controls with Ctrl/Cmd plus mouse wheel, Ctrl/Cmd plus `+`/`-`, and Ctrl/Cmd plus `0` reset.

### Changed
- Bumped package and active catalog revision metadata to `1.1.10`.
- Corrected RLM documentation to align with the MIT Recursive Language Models paper and clarify that the current PSF implementation is a partial document-assist scaffold, not a complete prompt-as-environment RLM.

## [v1.1.9 Core-CE] - 2026-09-08

### Added
- Added Qwen3.8 4B Distill Q8_0 GGUF catalog metadata.
- Added Gemma 4 E2B IT Q8_0 GGUF catalog metadata.

### Changed
- Bumped package revision metadata to `1.1.9`.
- Updated active catalog files only; local catalog backup files remain untracked/uncommitted.

## [v1.1.8 Core-CE] - 2026-09-08

### Changed
- Bumped package revision metadata to `1.1.8`.
- Tightened llama.cpp startup readiness so PSF Terminal waits for a real ready `/health` response instead of treating early loading responses as ready.
- Reduced pre-provider work in PSF Terminal by skipping attachment context and image attachment scans for ordinary chat turns.
- Added lightweight PSF Terminal timing logs for request preparation, BMOC llama.cpp session ensure, prompt estimate, provider response headers, and first stream chunk.

### Fixed
- Fixed a slow first-message path where llama.cpp could still be loading after Terminal opened, causing provider warmup delays before inference began.
- Fixed unconditional attachment IPC/audit work before normal chat prompts.

## [v1.1.7 Core-CE] - 2026-09-08

### Changed
- Bumped package and active catalog revision metadata to `1.1.7`.
- Updated llama.cpp Prepare so stale local source can be refreshed when catalog models require newer GGUF architecture support.
- Reduced default llama.cpp local build parallelism and staged shared runtime libraries for newer llama.cpp builds.
- Extended PSF Terminal llama.cpp warm-load retries so first requests wait for cold model loading instead of failing after a few seconds.

### Fixed
- Fixed Catalog Launch into PSF Terminal so explicit llama.cpp launch paths override saved last-used terminal preferences.
- Fixed the llama.cpp model dropdown so a Catalog-launched model remains selected instead of reverting to the persisted previous model.
- Fixed BMOC llama.cpp session reuse so loading servers returning HTTP 503 are treated as live reusable sessions.
- Fixed duplicate llama.cpp terminal sessions caused by relative-vs-absolute GGUF path comparisons.
- Added a clearer unsupported-GGUF-architecture diagnostic when a stale llama.cpp runtime cannot load a model such as Gemma 4.

## [v1.1.6 Core-CE] - 2026-09-07

### Changed
- Bumped package and active catalog revision metadata to `1.1.6`.
- Removed PSF Terminal's implicit llama.cpp chat output cap; explicit `num_predict` settings still limit generation when configured.
- Raised the default llama.cpp terminal context to the Normal profile target of 32768 tokens.
- Added llama.cpp prompt budgeting that drops older history before provider calls and warns when the current prompt is still too large.

### Fixed
- Fixed PSF Terminal provider parsing so OpenAI-compatible `reasoning_content`, `reasoning`, and `thinking` fields are separated from assistant answer content instead of being treated as empty or displayed inline.

## [v1.1.5 Core-CE] - 2026-09-07

### Added
- Added direct regression coverage for the existing RLM document-assist engine: deterministic attachment summaries, shared attachment opt-in, no-attachment handling, and mocked model-backed code generation.
- Added terminal chatflow regression coverage proving RLM document-assist llama.cpp requests route to the tool engine before provider streaming.

### Changed
- Bumped package and active catalog revision metadata to `1.1.5`.
- Routed the existing RLM document-assist requests before backend streaming so llama.cpp terminals can use the deterministic tool engine.

### Fixed
- Fixed the existing RLM document-assist mode being bypassed whenever PSF Terminal was using a non-Ollama backend.

## [v1.1.4 Core-CE] - 2026-09-07

### Added
- Added Qwen3.8 4B Distill GGUF catalog metadata for llama.cpp-based local inference without committing model binaries.
- Added llama.cpp runtime logging under `.psf/logs/llama-cpp/` for launch arguments, stdout/stderr, and exit status.

### Changed
- Routed PSF Terminal llama.cpp launches through BMOC Session Manager instead of the Ollama wrapper path.
- Changed direct PSF Terminal launch in llama.cpp mode to open model-selector-only, avoiding accidental preload of the first discovered GGUF.
- Restored Qwen3.8 full GPU offload metadata (`gpu_layers: 34`) after selector-only launch removed the duplicate-server VRAM conflict.
- Added llama.cpp chat defaults for PSF Terminal requests: bounded output, repeat penalty, stop sequences, English system anchoring, and lower default temperature.

### Fixed
- Fixed llama.cpp / `llamacpp` / `llama-cpp` provider name mismatches across launcher, terminal renderer, and model dropdown flows.
- Fixed llama.cpp OpenAI-style SSE streaming parse errors in the shared Ollama chat stream parser.
- Fixed terminal model dropdown listing for llama.cpp models when the global inference backend is llama.cpp.
- Fixed failed or timed-out `llama-server` startups leaving process groups around long enough to consume GPU memory on retry.
- Made terminal launch failure alerts copy their full message to the clipboard before displaying.

## [v1.1.3 Core-CE] - 2026-04-26

### Added
- Added this `CHANGELOG.md` to track patch and release updates in a standard format.

### Changed
- Hardened model file operations to constrain reads/deletes to the `models/` tree.
- Hardened mod loading by validating entrypoint paths and preventing install-root escape.
- Restricted external URL opening to approved schemes (`https`, `http`, `mailto`).
- Tightened `.env` token file write behavior with restrictive permissions.
- Pre-hardened future bucket feature IPC paths by deriving actor identity server-side and enforcing bucket authorization for list/create/delete/grant/revoke operations.

### Security
- Added regression coverage for mod entrypoint security validation (absolute/traversal rejection).
- Added regression coverage for bucket access control to enforce owner-only behavior when grants are absent.
