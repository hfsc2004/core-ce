# Roberts Rules Profile Manual (PSF Relay)

## Purpose
The Roberts Rules profiles in PSF Relay implement a deterministic, structured multi-agent debate and decision workflow.

They are designed to:
- force role separation (Chair, Proposer, Opposition, Engineer, Safety, Clerk),
- keep outputs machine-parseable,
- reduce conversational drift and “agent chatter chaos,”
- produce a final record suitable for execution planning.

## Profiles Included
Current profile files:
- `config/relay/moe-pipelines/Protocol-RR-Core.json`
- `config/relay/moe-pipelines/Protocol-RR-Core-TinyLlama-6Agent.json`
- `config/relay/moe-pipelines/Protocol-RR-Theater.json` (stylized variant)
- `config/relay/moe-pipelines/MoE-Parliament-Roberts-Rules.json` (parliament framing variant)

Recommended baseline for deterministic work:
- `Protocol-RR-Core.json`

## Architecture
The core profile is a 6-agent, static pipeline:

1. `Chair`
2. `Proposer`
3. `Opposition`
4. `Engineer`
5. `Safety`
6. `Clerk`

Channels are unidirectional and fixed:
- `Chair -> Proposer -> Opposition -> Engineer -> Safety -> Clerk -> end`

This means no free-for-all routing: every stage has a single next stage.

## Role Contracts
Each agent has a strict output contract in its system prompt.

### 1) Chair
Output contract:
- `MOTION: ...`
- `TOKEN_GRANTED: Proposer`

Function:
- restates user request in one concrete motion sentence.

### 2) Proposer
Output contract:
- `FOR_CASE:` with 3 concrete benefits
- `TOKEN_GRANTED: Opposition`

Function:
- argues for adoption.

### 3) Opposition
Output contract:
- `RISKS:` with 3 concrete risks
- `AMENDMENT: ...`
- `TOKEN_GRANTED: Engineer`

Function:
- pressure-tests the motion and proposes one risk-reducing amendment.

### 4) Engineer
Output contract:
- `PLAN:` with implementation and measurable verification
- `TOKEN_GRANTED: Safety`

Function:
- converts motion + amendment into actionable execution steps.

### 5) Safety
Output contract:
- `SAFETY_CHECK: PASS|FAIL`
- `RATIONALE: ...`
- `REQUIRED_GUARDRAIL: ...`
- `TOKEN_GRANTED: Clerk`

Function:
- evaluates whether risk controls are sufficient.

### 6) Clerk
Output contract:
- final `RECORD` with all fields populated:
  - `MOTION`
  - `FOR_CASE`
  - `RISKS`
  - `AMENDMENT`
  - `PLAN`
  - `SAFETY_CHECK`
  - `RESOLUTION`
  - `VOTE_RECOMMENDATION`
  - `NEXT_ACTION`

Function:
- compiles the official final decision artifact.

## Deterministic Tools (Pipeline State)
Core RR profiles enable `pipeline_state` tool access on agent nodes.

Use this when you need guaranteed field carryover between steps:
- `PIPE_STATE_SET: key=value`
- `PIPE_STATE_GET: key`

Reference:
- `docs/pipeline-state-manual.md`

When to use:
- when smaller models forget earlier outputs,
- when Clerk fields show `N/A` despite earlier valid content,
- when strict traceability is required.

## Configuration Fields That Matter Most
In each agent item:
- `provider` (typically `llama.cpp` for local deterministic operation),
- `modelId`, `filename`, `setKey`,
- `systemPrompt` (contract),
- `routingMode` (should be `static` for RR core),
- `routingRules` (single explicit target),
- `tools` (`pipeline_state` if enabled).

In channel items:
- `direction` (`unidirectional`),
- `fromAgentId`, `toAgentId`,
- `onFailure` (`stop` recommended),
- `timeoutMs`, `retryCount`.

## How To Use (Operator Procedure)
1. Open Relay and load `Protocol-RR-Core`.
2. Verify each node has the intended model + provider.
3. Confirm channels are in strict linear order.
4. Deploy pipeline.
5. Send a motion-style user prompt.
6. Review final Clerk `RECORD`.
7. Execute `NEXT_ACTION` manually or through downstream deterministic tooling.

## Prompting For Best Results
Use explicit procedural prompts. Example:

`Motion: Add LED heartbeat at 1Hz. Please follow full procedure.`

For guaranteed carryover, include explicit state instruction:

`Chair must PIPE_STATE_SET key=motion_text. Clerk must PIPE_STATE_GET: motion_text and use it in RECORD.MOTION.`

Avoid vague prompts like:
- `Thoughts on this idea?`

These increase drift and lower deterministic quality.

## Output Quality Checklist
A good RR run should produce:
- all role outputs in expected order,
- no blank template fields,
- concrete risks and amendment,
- measurable verification in plan,
- explicit PASS/FAIL safety determination,
- final Clerk record with actionable next step.

## Common Failure Modes
1. Placeholder leakage (`<...>` text appears in output)
- tighten role prompt and add “Do not output placeholders.”

2. Clerk misses earlier fields
- enforce `PIPE_STATE_SET/GET` for critical fields.

3. Repetitive loops / role drift
- use stronger token/flow control and shorter context.

4. Tiny model degradation
- use stronger model for Chair + Clerk first,
- keep opposition/engineering prompts concise and strict.

## Model Sizing Guidance
For constrained hardware:
- keep all 6 roles on small/medium local models with strict prompts,
- prioritize stronger model on `Chair` and `Clerk` if mixed assignment is needed.

For best consistency:
- use same model family across roles to reduce formatting variance.

## Practical Result Patterns
Use RR profile when you need:
- structured governance outputs,
- auditable decision paths,
- “argue then decide” flow before hardware/action execution.

Do not use RR profile for:
- casual open-ended social chat,
- unstructured brainstorming with high creativity and no fixed schema.

## Recommended Next Step
If the profile is stable in your environment, create:
- one “strict production” RR profile (no stylistic text, hard contracts),
- one “discussion-first” RR variant (same structure, softer prose constraints).
