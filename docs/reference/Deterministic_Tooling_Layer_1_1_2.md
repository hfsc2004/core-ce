# Deterministic Tooling Layer (v1.1.3)

## Purpose

Core shared runtime for deterministic function execution across:

1. `PSF Terminal`
2. `Coding Terminal`
3. `MoE/IRG`

This keeps model behavior flexible while moving safety-critical implementation into tested deterministic tools.

## RLM Positioning

This layer is explicitly designed to support Recursive Language Model (RLM) workflows, but it is not limited to RLM.

Detailed PSF Terminal RLM behavior and operations are documented in:
- `RLM_Assisted_PSF_Terminal_1_1_2.md`

RLM-relevant deterministic capabilities in the default pack:

1. deterministic chunking (`chunk_text`)
2. deterministic local retrieval (`find_lines`)
3. bounded extraction (`extract_between`)
4. planner output parsing (`parse_key_values`)
5. deterministic accumulation (`accumulate_summaries`)

RLM policy preset:
- preset name: `rlm`
- allows only the RLM-safe tool subset for known surfaces/roles

## Core Components

1. Runtime core:
- `launcher/modules/deterministic-tools/deterministic-tools-core.js`
- Registry, policy gate, execution timeout, audit trace

2. Default common tool pack:
- `launcher/modules/deterministic-tools/deterministic-tools-pack-common.js`
- `chunk_text`, `find_lines`, `extract_between`, `parse_key_values`, `accumulate_summaries`

3. Entry module:
- `launcher/modules/deterministic-tools/index.js`

## Platform Wiring (Current)

1. Session manager initializes one shared runtime singleton:
- `launcher/modules/session-manager.js`

2. MoE coordinator receives runtime reference at initialization:
- `launcher/modules/moe/moe-coordinator.js`

3. IPC channels added for renderer access:
- `deterministic-tools-list`
- `deterministic-tools-execute`
- `deterministic-tools-traces`
- `deterministic-tools-clear-traces`
- file: `launcher/modules/ipc-handlers.js`

4. Preload API exposed to renderer:
- `listDeterministicTools()`
- `executeDeterministicTool(toolName, args, context, options)`
- `getDeterministicToolTraces(limit)`
- `clearDeterministicToolTraces()`
- file: `launcher/preload.js`

## Security/Control Model

Runtime policy supports:

1. `defaultAllow`
2. `allowBySurface` / `denyBySurface`
3. `allowByRole` / `denyByRole`

Policy presets available in core:

1. `permissive`
2. `rlm`
3. `irg_strict`

Each execution writes trace records with:
- tool name
- surface/role
- duration
- success/failure
- argument/output previews

## Next Steps

1. Add a lightweight UI pane for tool execution trace in MoE and Coding Terminal.
2. Add signed user tool packs for future Modules feature.
3. Add capability scopes (filesystem/serial/network) before user mod execution.
