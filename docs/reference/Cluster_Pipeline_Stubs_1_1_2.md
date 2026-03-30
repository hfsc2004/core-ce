# Coding Terminal Cluster Pipeline Stubs (1.1.3)

## Purpose
This document defines the cluster-ready stubs added to Coding Terminal so the current local implementation does not become dead-end code.

Scope in this phase is **metadata and contracts only**. Execution is still local/single-node.

## Why this was added now
- Preserve forward compatibility with Enterprise/Data Center multi-terminal clustering.
- Standardize request tracing (`requestId`, `traceId`, `sessionId`, `terminalId`) before behavior diverges.
- Introduce mailbox envelope semantics early, without changing model behavior.

## What was implemented

### 1) Pipeline utility module
File: `launcher/modules/coding-terminal/coding-terminal-pipeline.js`

Provides:
- `createTurnContext()`
- `createMailboxEnvelope()`
- `appendPipelineEvent()`
- `getPipelineEvents()`
- bounded in-memory event retention (max 400 events)

### 2) Persistent terminal identity
File: `launcher/modules/coding-terminal/coding-terminal-common.js`

Added:
- config field: `terminalId`
- function: `ensureTerminalIdentity()`
- called during module initialization

This gives every Coding Terminal instance a stable identity for future cluster routing.

### 3) IPC and request wiring
File: `launcher/modules/coding-terminal/coding-terminal-ipc.js`

Added:
- new IPC handler: `coding-terminal:get-pipeline-events`
- turn context creation in `prepareChatRequest()`
- `turn.prepare` event append
- pipeline IDs included in `routingDebug`
- `pipeline` object returned with prepared request

### 4) Router mailbox envelopes
File: `launcher/modules/coding-terminal/coding-terminal-ipc-models.js`

Added:
- `pipelineContext` arg on `routeModelViaRouter(...)`
- request envelope (`router.translate.request`)
- response envelope (`router.translate.response`)
- pipeline event append for router request/response
- mailbox metadata returned on router dispatch object

### 5) Preload API exposure
File: `launcher/preload.js`

Added:
- `getCodingPipelineEvents(options)` => `coding-terminal:get-pipeline-events`

### 6) UI trace visibility
File: `launcher/src/coding-terminal-renderer-chat.js`

Added:
- displays trace line after route proof:
  - `request=... | trace=... | terminal=...`

## Mailbox envelope contract (v1 stub)

```json
{
  "msgId": "msg_*",
  "correlationId": "req_*",
  "from": "coding-terminal:<terminalId>",
  "to": "router:<model>",
  "type": "router.translate.request|router.translate.response",
  "payload": {},
  "createdAt": 0,
  "ttlMs": 30000,
  "attempt": 1
}
```

## Turn context contract (v1 stub)

```json
{
  "requestId": "req_*",
  "traceId": "trace_*",
  "sessionId": "sess_*",
  "terminalId": "cterm_*",
  "projectPath": "/path",
  "createdAt": 0
}
```

## Current behavior guarantees
- No change to model selection semantics.
- No change to model output format semantics.
- No distributed queue/broker introduced yet.
- No cross-process mailbox transport yet.
- Router remains rewrite-only behavior per existing config.

## Known limitations
- Event log is in-memory only (lost on process restart).
- No ACK/NACK handshake yet.
- No retry orchestration policy at mailbox layer yet.
- No idempotency key enforcement yet (IDs exist, policy does not).
- No backpressure/rate limiting at cluster boundary yet.

## Immediate usage (debug/test)

From renderer/devtools:

```js
await window.electronAPI.getCodingPipelineEvents({ limit: 20 })
```

Expected event kinds in normal router-on flow:
1. `turn.prepare`
2. `router.request`
3. `router.response`

## Planned next phases

### Phase 1: Durable local event log
- Persist pipeline events to disk (bounded rolling file).
- Add optional `coding-terminal:clear-pipeline-events`.

### Phase 2: Idempotent step runner
- Explicit step states: `prepared`, `routed`, `generated`, `validated`.
- Add idempotency key policy by `requestId + step`.

### Phase 3: Transport abstraction
- Introduce `RouterClient` / `CoderClient` interfaces.
- Add local transport adapter and broker adapter (future Redis/NATS/Kafka).

### Phase 4: Mailbox protocol hardening
- ACK/NACK envelopes.
- retry policy with backoff.
- TTL expiry handling and dead-letter queue semantics.

### Phase 5: Multi-terminal cluster mode
- terminal registry and lease/heartbeat.
- router worker pool assignment strategy.
- trace propagation across node boundaries.

## Design rule (non-negotiable)
All future cluster work must preserve these invariants:
- User-selected coder model is fixed unless explicitly changed by user.
- Router is translation/contract normalization only.
- Validation contract is explicit per request (`inspect`, `unified_diff`, `full_file`).
- No hidden fallback chains.

## Files touched in this phase
- `launcher/modules/coding-terminal/coding-terminal-pipeline.js`
- `launcher/modules/coding-terminal/coding-terminal-common.js`
- `launcher/modules/coding-terminal/coding-terminal-ipc.js`
- `launcher/modules/coding-terminal/coding-terminal-ipc-models.js`
- `launcher/preload.js`
- `launcher/src/coding-terminal-renderer-chat.js`
