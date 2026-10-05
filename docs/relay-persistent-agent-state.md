# Persistent Relay Agent state

Persistent state is an opt-in capability of a normal BMOC-owned llama.cpp session.
RWKV7 remains an ordinary Relay Agent. llama.cpp manages recurrent tensors inside
its slot; Core-CE does not inspect or manipulate WKV, ATT_SHIFT, or FFN_SHIFT.

## Operation

1. Select `llama.cpp` for an Agent and enable **Keep model state between calls**.
2. Stop and Deploy to apply the policy to a fresh BMOC session.
3. Successive calls extend that Agent's sequence, including repeated visits within
   a routing cycle and calls in later chat turns.
4. **Reset Agent model state** clears the native slot and BMOC's matching context.
5. Stop/Deploy or a model-process restart invalidates the previous sequence.

Persistence is disabled by default. Ordinary llama.cpp calls keep their previous
request payload and per-call conversation behavior, while going through BMOC.

Each local Agent currently has a dedicated model process. Persistent sessions
use one server slot (`0`) and serialize operations on that BMOC session. Separate
Agents have separate state and model memory allocations. Reset clears logical
state; closing the process releases its model and sequence buffers. Context remains
bounded by the configured context size. Reset after a context-limit or failed
persistent request, because a failed request may have partially advanced the slot.

No snapshot, restore, clone, disk-backed state, or experiment-specific behavior is
implemented. The empty `--slot-save-path` control directory enables the installed
server's erase action and is removed when the child exits; Core-CE does not save
state files there.

## Ownership and continuation

Relay uses its existing Agent ID to reference a BMOC `moe-agent` session. BMOC owns
process startup, port allocation, the session ID, endpoint, state policy, slot,
conversation/token context, reset, invalidation, and process teardown. Relay's
llama.cpp generation and health checks delegate to BMOC; they never invoke the
model server directly. Endpoint-registry overrides cannot redirect a BMOC session
to an unowned server.

BMOC normalizes messages for llama.cpp using the same role/content behavior as the
previous Relay transport. A non-persistent turn uses `/v1/chat/completions` with
that turn's messages. For persistent turns BMOC uses the installed server's
`/apply-template`, `/tokenize`, and `/completion` interfaces. It retains the exact
prompt/generated token IDs, conversation messages, and appended rendered text.
Subsequent requests append the new template boundary and input tokens to that
exact prefix using `id_slot: 0`, `cache_prompt: true`, and `return_tokens: true`.
This preserves sequence continuity when chat responses omit native reasoning tokens.

Operations identify a runtime lifetime by its process, port, start time, model
path, and persistence policy. Updating harmless registry metadata does not reset
context or reject queued calls. A changed runtime lifetime invalidates the old
state; queued calls cannot continue on the replacement process.

The BMOC interface is `runSessionTurn(sessionId, request)`,
`pingSession(sessionId)`, `resetSessionState(sessionId)`, and
`getSessionStateStatus(sessionId)`. Session closure uses the existing
`closeSession`/`closeAllSessions` lifecycle. Relay does not select slots or manage
native memory.

## Read-only lifecycle metadata

Use **Refresh state** in an expanded Agent or request Pipeline Status. Relay reads
BMOC metadata and displays/logs:

| Field | Meaning |
|---|---|
| `sessionId` | Existing BMOC session identity |
| `enabled` | Effective persistence policy of the deployed session |
| `status` | Empty, busy, ready, resetting, invalid, or invalidated |
| `generation` | Starts at zero; advances after successful reset |
| `turnCount` | Successful model calls in the current generation |
| `totalTurnCount` | Successful model calls across that session's generations |
| `resetCount` | Successful resets |
| `modelId`, `modelName`, `runtime` | Registered model and llama.cpp runtime identity |
| `events` | Recent BMOC lifecycle events with timestamps and counters |

A turn counts one successful model call, including revisiting an Agent during a
routing cycle. Failed calls do not increment it. New model sessions start fresh.
BMOC retains the latest 100 events in memory and writes metadata-only lifecycle
logs. Chat traces contain the BMOC metadata returned by each model call. Displayed
trace metadata is a point-in-time record; Refresh reads the current state.

Observation neither allocates sequence state nor contacts the model server.
Metadata is copied before returning it, so modifying a UI copy cannot change BMOC
state. No prompts, generated token IDs, or native tensor contents are included in
these lifecycle records. `messageCount` and `tokenCount` expose counts only.

## Verification

Run the deterministic regression suite:

```bash
node launcher/modules/session-manager-sequence-state.regression.test.js
```

Run the optional CPU-only native integration test with an installed GGUF:

```bash
node launcher/modules/session-manager-sequence-state.native.test.js /path/to/model.gguf
```

The native test uses an isolated temporary registry and BMOC service startup and
closure. It checks exact-token prefix continuity and the server's `timings.cache_n`,
then verifies native reset, close rejection, and a fresh process/session after
restart. It never initializes or closes the application's normal session registry.

Review validation found an independent IRG failure in mood-arc “few cycles”
alignment, plus a nested-repeat phrase failure hidden behind the first assertion.
Both reproduce from committed baseline `6f71500`; this work leaves IRG code and
tests unchanged.
