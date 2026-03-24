# PSF Relay Pipeline State Manual

## Purpose
This manual defines the deterministic pipeline variable mechanism for Relay agents.

The mechanism is universal and permissioned:
- Universal: works across profiles and roles.
- Permissioned: an agent can only use it if its node `tools` allows it.
- Explicit: models should only call it when told to.

## Scope
Pipeline state is scoped to one pipeline run (in-memory for that run).

It is intended for handoff values that must survive role-to-role transitions without reintroducing full-history loops.

## Enablement (Per Agent)
In an agent node, set `tools` to include one of:
- `"pipeline_state"` (read + write)
- `"pipeline_state:read"` (read only)
- `"pipeline_state:write"` (write only)

If no pipeline-state tool is listed, all state commands are ignored for that agent.

## Command Syntax
Use these deterministic command lines in model output only when instructed.

### Write
Option A:
`PIPE_STATE_SET: key=value`

Option B:
`PIPE_STATE_SET: {"key":"key_name","value":"value_text"}`

### Read
Option A:
`PIPE_STATE_GET: key1,key2,key3`

Option B:
`PIPE_STATE_GET: {"keys":["key1","key2","key3"]}`

## Behavioral Rules
1. Writes are applied only when the current agent has write permission.
2. Reads are resolved only when the current agent has read permission.
3. Retrieved values are injected into that hop as authoritative context.
4. Missing keys resolve to `N/A`.
5. Later writes overwrite earlier values for the same key.

## Recommended Key Naming
Use lowercase snake-style keys:
- `motion_text`
- `for_case_summary`
- `risk_summary`
- `amendment_text`
- `plan_summary`
- `safety_check`

Avoid spaces and punctuation in keys.

## Relay Profile Pattern (Robert's Rules Example)
Chair:
- Save motion:
`PIPE_STATE_SET: motion_text=<restated motion>`

Proposer:
- Save summary:
`PIPE_STATE_SET: for_case_summary=<one-line summary>`

Opposition:
- Save risks/amendment:
`PIPE_STATE_SET: risk_summary=<one-line summary>`
`PIPE_STATE_SET: amendment_text=<single amendment>`

Engineer:
- Save plan:
`PIPE_STATE_SET: plan_summary=<3-step summary>`

Safety:
- Save safety outcome:
`PIPE_STATE_SET: safety_check=PASS`
or
`PIPE_STATE_SET: safety_check=FAIL`

Clerk:
- Retrieve and fill record:
`PIPE_STATE_GET: motion_text,for_case_summary,risk_summary,amendment_text,plan_summary,safety_check`

## Prompting Guidance
To avoid accidental command usage, system prompts should include:
- "Use PIPE_STATE_SET / PIPE_STATE_GET only when explicitly requested."
- "Do not emit placeholder fields."
- "If a required field is missing, retrieve it with PIPE_STATE_GET."

User-level example:
`Motion: Add LED heartbeat at 1Hz. Chair must save motion_text with PIPE_STATE_SET. Clerk must retrieve motion_text with PIPE_STATE_GET and populate RECORD.MOTION.`

## Observability
Pipeline state is included in MoE trace output as:
- `trace.pipelineState`

Per-step state write operations are tracked in step metadata as:
- `step.pipelineStateOps`

## Failure Modes
If state does not appear to work, check:
1. Agent `tools` permission includes required read/write capability.
2. Command token spelling is exact (`PIPE_STATE_SET` / `PIPE_STATE_GET`).
3. Key names match exactly across set/get.
4. Commands are emitted in agent output text (not only implied).

## Security and Safety
- State is pipeline-scoped and non-executable.
- It is not a code runner or shell channel.
- Keep secrets out of state values unless profile policy explicitly permits it.
