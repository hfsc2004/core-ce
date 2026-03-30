# MoE/IRG Gateway USB + Serial Flow (v1.1.3)

## What Was Added

This update hardens the MoE/IRG gateway path with deterministic serial/USB handling.

1. Added gateway adapter module: `launcher/modules/moe/moe-gateway-adapters.js`
2. Added serial/USB discovery API over IPC:
- `moe-list-serial-ports`
- `window.electronAPI.listMoESerialPorts()`
3. Gateway runtime startup now resolves serial source deterministically:
- `port = auto` selects first detected serial/USB device
- explicit port uses configured path directly
4. MoE UI now supports serial scanning and selection:
- `Scan USB/Serial` button in Gateway -> Input Sources -> Serial
- dropdown with `Auto Detect (recommended)` + detected device paths
5. Gateway serial defaults changed for portability:
- `port: auto`
- `baudRate: 115200`
6. Added IRG runtime controls to Gateway UI:
- `Enable IRG`
- `executeMode`: `simulate` | `live` | `disabled`
- live timeout (`timeoutMs`)
- Pico default GPIO/period/iterations
7. Added live IRG executor path:
- Uses `mpremote` + resolved serial port in `live` mode
- Verifies completion token (`IRG blink complete`)
- Returns deterministic block reason when requirements are not met

## Why This Matters

Before this, serial config used static paths (for example `COM3`) and manual text entry. That is fragile across machines and deployments.

Now the system can discover connected USB serial devices and use auto-selection by default, which is more portable for field and lab hardware.

## Purpose of MoE/IRG

The purpose of MoE/IRG is to combine LLM adaptability with deterministic industrial execution.

1. MoE agents interpret intent, context, and telemetry.
2. IRG converts allowed intent into bounded machine contracts.
3. IRG enforces policy/safety/range checks before any action.
4. IRG executes through deterministic adapters (serial/USB/API).
5. Results are fed back for monitoring, decisions, and audit.

Outcome:
- Faster configuration and troubleshooting with natural language.
- Deterministic, auditable execution suitable for real equipment.
- Clear separation between planning intelligence and control authority.

## Runtime Behavior

On gateway startup (`moe-coordinator -> startGateway`):

1. Gateway sources are normalized (API/Terminal/Serial).
2. If serial source is enabled, available serial devices are discovered.
3. Serial source resolution:
- If port is explicit and non-`auto`: use that value.
- If port is `auto`: choose the first detected port (USB devices prioritized).
4. Gateway runtime reports:
- active sources
- resolved serial port
- warning when serial is enabled but no device is found

For IRG `executeMode=live`:

1. Serial source must be enabled.
2. Serial port must resolve (explicit or `auto`).
3. `mpremote` must be available on host.
4. IRG runs generated MicroPython via `mpremote connect <port> exec <script>`.
5. Verification requires observing `IRG blink complete`.

## MoE/IRG Control Model (Current Direction)

The control boundary is intentional:

1. LLM agents are planners/interpreters.
2. IRG is deterministic validator + gate + executor.
3. No machine action is executed directly from raw LLM prose.

Recommended pipeline pattern for closed-loop control:

1. `Observer Agent`
- Reads endpoint telemetry/events.
- Produces structured state + anomaly summary.

2. `Decision Agent`
- Proposes the next machine intent based on state + goal.

3. `Safety/Policy Agent` (optional)
- Applies business/safety envelope checks before execution.

4. `IRG`
- Deterministic allow/deny.
- Executes bounded contract only.
- Emits auditable execution/result record.

This keeps LLM flexibility while preserving deterministic industrial behavior.

## Example Industrial Flow (Observer -> Decision -> IRG)

Example scenario: door-seal station (automotive line) with edge controller and serial-connected actuator.

1. Operator intent:
- "If seal bead width drifts high for 3 consecutive parts, slow applicator feed by 5% for the next 10 parts."

2. Observer Agent:
- Reads recent part telemetry and quality counters.
- Emits structured summary:
- `drift_detected=true`
- `consecutive_high=3`
- `current_feed_pct=62`

3. Decision Agent:
- Proposes action plan:
- `action=adjust_feed`
- `delta_pct=-5`
- `duration_parts=10`

4. Safety/Policy Agent:
- Checks envelope:
- max adjustment per step
- minimum feed floor
- active maintenance/lockout state
- Approves or rejects with reason.

5. IRG deterministic gate:
- Validates contract fields and ranges.
- Resolves endpoint/port/protocol.
- Executes bounded command (for example serial frame / PLC write).

6. Verification + feedback:
- Confirms endpoint ACK and expected state change.
- Logs deterministic execution record:
- plan source
- resolved values
- result/latency
- Emits result back to Observer for next loop.

Result:
- Closed-loop adaptive behavior from MoE,
- but all machine-side action remains deterministic, bounded, and auditable through IRG.

### Example Pipeline Lineup (Reference Blueprint)

Use this as a practical starter lineup in the MoE Pipeline editor:

1. User Gateway
- Position: `Input`
- Sources:
- `Terminal = enabled`
- `Serial (USB) = enabled`
- Serial target: `Select Microcontroller` (or `Auto Detect`)
- IRG:
- `Enable IRG = true`
- `Entry Mode = LLM Plan First`
- `Execute Mode = live`

2. Runtime Bindings
- Purpose: user-defined hardware variables
- Example entries:
- `gpio.red=2`
- `gpio.blue=3`
- `gpio.green=4`
- `timing.period_ms=400`
- `timing.cycles=8`

3. Channel
- Direction: `Bi-directional`
- Enabled: `true`

4. Agent
- Model: `Gemma 3:4B`
- System Prompt:

```text
You are a hardware planning agent for Mixture of Experts (MoE)/ Industrial Reflex Gateway (IRG).
For machine-control intents, output ONLY one concise execution instruction.
Do not explain, do not add markdown, do not add code blocks.
Prefer explicit values for gpio, colors, period_ms, cycles.
If required inputs are missing, ask one short clarification question.
```

### IRG Entry Modes

`gateway.irg.entryMode`:

1. `deterministic-first`
- IRG evaluates user prompt before agent chain.

2. `llm-plan-first`
- First agent receives gateway + bindings context for planning.
- IRG executes the planned instruction after agent output.
- Keeps LLM in the loop while preserving deterministic execution.

### Strict LLM Gate (Live Mode)

`gateway.irg.requireLlmPlanForLive`:

- `false` (default): live can proceed with deterministic fallbacks.
- `true`: live execution is blocked unless a parseable LLM plan is present.

This is the recommended setting for high-assurance production pipelines.

### Agent Routing Modes (Dynamic vs Static)

Each agent has its own routing mode because different agents in the same pipeline may need different behavior.

1. `Dynamic (LLM-led)`
- Agent decides the next hop based on message context and intent.
- Best for dispatcher/planner agents.
- More flexible, less deterministic.

2. `Static (Rule-led)`
- Engineer-defined routing policy determines next hop.
- Best for control/safety-critical agents.
- Deterministic and auditable.

Why this is per-agent (not global):
- A single pipeline often needs both styles.
- Example: dispatcher agent = `Dynamic`, machine-control guard agent = `Static`.

Operational guidance:
1. Use `Dynamic` early in the pipeline for interpretation/planning.
2. Use `Static` near actuation and safety boundaries.
3. Log decision source (`llm` vs `static-rule`) for traceability.

### Distributed Role Workers (Hardware-Agnostic v1)

MoE now supports an endpoint registry pattern so role workers can run locally or on remote hosts/VMs while keeping IRG deterministic.

1. New module:
- `launcher/modules/moe/moe-endpoint-registry.js`

2. Coordinator integration:
- `moe-coordinator` resolves execution target per agent from `endpointRegistry`.
- If a mapped worker is healthy, requests route there.
- On repeated worker failures, cooldown is applied and selection fails over.
- Local deployed agent endpoint remains fallback.

3. Config contract (top-level pipeline key):

```json
{
  "endpointRegistry": {
    "enabled": true,
    "includeLocalAgents": true,
    "selection": "priority",
    "defaultTimeoutMs": 120000,
    "maxConsecutiveFailures": 2,
    "cooldownMs": 20000,
    "agentRoleMap": {
      "agent-123": "navigator"
    },
    "roles": {
      "navigator": [
        {
          "id": "nav-remote-a",
          "name": "Navigator Remote A",
          "endpoint": { "type": "remote", "host": "10.0.0.22", "port": 52455, "protocol": "http" },
          "modelId": "qwen2.5-vl:3b",
          "priority": 10
        }
      ]
    }
  }
}
```

4. Execution trace:
- Each agent step now includes execution metadata:
- mode (`local-direct` or `registry-worker`)
- role
- worker id
- endpoint used

Design intent:
- Keep role orchestration portable across hardware.
- Keep machine execution deterministic through IRG safety boundaries.

### Supported Deterministic Pico Contracts

1. `blink_gpio`
- Example: `Program raspberry pi pico to blink gpio 25 every 500 ms for 10 blinks`

2. `blink_color_sequence` (red/blue/white/green)
- Example: `Program raspberry pi pico to blink red blue white and green every 500 ms for 10 cycles`
- Default pin map: `red=GPIO2`, `blue=GPIO3`, `green=GPIO4` (`white` = red+blue)

3. `blink_pattern_sequence` (white burst + color cycle)
- Example: `Program raspberry pi pico to strobe white twice quickly and then cycle red blue green for 5 cycles`
- Supports:
- white burst count
- white burst on/off timing
- cycle count
- base color sequence
- Default quick white burst timing: `100ms on / 100ms off` when phrasing uses `quick/quickly`.

### Resolution Trace Metadata

IRG responses now include deterministic resolution provenance:

- `plan_source=llm|bindings|gateway-default`
- `resolved_period_ms`
- `resolved_cycles` / `resolved_iterations`
- `resolved_pins`

This makes execution origin explicit for audit/debug.

## Runtime Bindings Block (Variable Block v1)

New pipeline item type: `bindings`.

Bindings are user-editable key/value pairs injected into IRG policy resolution at runtime.

Supported keys (current):
- `gpio.red`
- `gpio.blue`
- `gpio.green`
- `gpio.default`
- `timing.period_ms`
- `timing.iterations`
- `timing.cycles`

In `llm-plan-first`, parsed planner output is merged with bindings for resolution.
Current precedence:

1. LLM plan bindings
2. Runtime Bindings block
3. Gateway IRG defaults

## USB and Serial Notes

- USB microcontroller boards usually appear as serial devices (`/dev/ttyACM*`, `/dev/ttyUSB*`).
- This release provides Linux and macOS enumeration logic. Windows currently returns an empty discovery list (safe fallback).
- You can still set an explicit serial port manually if needed.

## UI Operator Flow

In MoE screen:

1. Expand Gateway.
2. Enable `Serial` source.
3. Click `Scan USB/Serial`.
4. Leave port on `Auto Detect (recommended)` for portable setups.
5. Set baud rate for device protocol (default 115200).
6. In `IRG Runtime`, choose:
- `simulate` for dry deterministic output
- `live` for serial execution through `mpremote`

## Config + Validation Changes

`moe-config` now includes serial defaults and validation:

- Defaults include `port: auto`, `baudRate: 115200`, `dataBits`, `stopBits`, `parity`.
- Validation checks serial baud range (`300` to `2000000`) and non-empty port string.
- Validation includes IRG strict mode type check (`requireLlmPlanForLive` boolean).

## Regression Coverage (Current)

IRG regression script:
- `launcher/modules/moe/moe-irg.regression.test.js`

Covered cases:
1. LLM plan overrides timing/cycles/pins and trace reports `plan_source=llm`.
2. Strict live mode blocks when no parseable LLM plan exists.
3. Gateway-default labeling is correct when no plan/bindings override values.
4. White strobe pattern contract (`blink_pattern_sequence`) generates expected script structure.

## Pinned Next Steps (Deferred)

1. Preview snapshot execution:
- Reuse dry-run generated contract/script for confirmed live run (avoid second planner pass).

2. Per-gateway policy UI:
- action allowlist
- max cycles
- min/max period
- allowed GPIO range/set

3. Execution audit view:
- immutable timeline (prompt -> plan -> resolution -> execution -> result)
- export JSON/CSV

4. Pattern contract expansion:
- explicit `white on/off` phrasing normalization
- additional deterministic pattern templates

## Files Changed

- `launcher/modules/moe/moe-gateway-adapters.js` (new)
- `launcher/modules/moe/moe-coordinator.js`
- `launcher/modules/moe/moe-config.js`
- `launcher/modules/session-manager.js`
- `launcher/modules/ipc-handlers.js`
- `launcher/preload.js`
- `launcher/src/renderer/renderer-enterprise/moe-state.js`
- `launcher/src/renderer/renderer-enterprise/model-ordering-ui.js`
- `launcher/src/renderer/renderer-enterprise/moe-pipeline-render.js`
- `launcher/src/renderer/renderer-enterprise/moe-pipeline-ops.js`

## Next Recommended Step

Add an alternate live executor that does not depend on `mpremote` (direct serial raw REPL transport), plus Windows COM discovery support.

## Backlog (Do Not Drop)

### IRG Live Executor #2 (Native, no Python dependency)

Status: `planned`

Goal:
- Replace `mpremote` runtime dependency with a deterministic native serial transport in Node.js.

Scope:
1. Open resolved serial device directly.
2. Enter MicroPython raw REPL mode.
3. Push script payload in bounded chunks.
4. Execute and capture stdout/stderr.
5. Verify expected token (`IRG blink complete`).
6. Deterministic timeout/cleanup on every failure path.

Why:
- Removes Python runtime requirement for live IRG.
- Improves portability for constrained/industrial deployments.
- Keeps Binary Manager simpler long-term.
