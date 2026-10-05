# PSF Relay Operator Manual

## Purpose
This manual defines how to run PSF Relay pipelines predictably in deterministic mode, with clear targeting, binding resolution, execution behavior, and verification steps.

Related:
- `docs/pipeline-state-manual.md` for permissioned inter-agent variable handoff (`PIPE_STATE_SET` / `PIPE_STATE_GET`).

## 1. Pipeline Intent Syntax
Use explicit target language in prompts.

Good examples:
- `Program raspberry pi pico to blink red 150ms, off 50ms, repeat 5 cycles.`
- `Program esp32 robot at host 172.20.0.15 to drive forward for 2s, then stop.`
- `Flash esp32s3 camera sidecar firmware using serial /dev/ttyACM0.`

Avoid ambiguous examples:
- `Program pi to blink red.`  
  This is ambiguous (`Raspberry Pi SBC` vs `Raspberry Pi Pico`).

## 2. Deterministic Contract Format
Relay live execution should use a structured contract (IRG plan), not free-form prose.

Minimum contract fields:
- `target`
- `action`
- `params`

Example:
```json
{
  "target": "raspberry-pi-pico",
  "action": "blink_multi_phase",
  "params": {
    "phases": [
      { "colors": ["red"], "on_ms": 150, "off_ms": 50 },
      { "colors": ["white"], "on_ms": 50, "off_ms": 50 },
      { "colors": ["white"], "on_ms": 50, "off_ms": 300 }
    ],
    "cycles": 5,
    "pins": { "red": 3, "blue": 2, "green": 4 }
  }
}
```

## 3. Device Target Rules
Target must be explicit and unambiguous.

- `raspberry-pi-pico` = MicroPython/serial toolchain path
- `raspberry-pi` = Linux SBC path (SSH/local shell, not Pico flashing)
- `esp32` = Arduino CLI compile/upload path
- `esp32s3-camera` = camera profile path (board profile + pin profile + network mode)

If the user says only `pi`, execution should reject and ask for clarification.

## 4. Bindings Resolution Rules
Bindings are runtime variables and should be resolved before execution.

Priority:
1. Explicit values in contract
2. Runtime bindings (`gpio.red`, etc.)
3. Gateway defaults

If a required binding is missing:
- Fail clearly with required key names.
- Do not silently substitute unknown pins/hosts.

## 5. Execution Modes
- `simulate`: produce contract/code only, no hardware side effects.
- `live`: execute against hardware.
- `disabled`: IRG execution off.

Recommended development setting:
- Entry: `Deterministic First`
- Fallback: `Off` during validation
- Auto-execute: On only when contract format is trusted for the current profile

## 6. Failure Behavior Policy
During bring-up/testing:
- No hidden fallback.
- Fail fast, fail loud, include reason and command output.

Production can enable controlled fallback later, after baseline behavior is proven.

## 7. Flash and Run Verification Checklist
After deploy or flash:

1. Confirm serial target is correct (`/dev/tty*`).
2. Confirm compile success.
3. Confirm upload success.
4. Confirm post-flash runtime signal:
   - Pico: serial completion line
   - ESP32 robot/camera: health endpoint or serial runtime logs
5. Confirm action behavior on device (LED pattern, motion, stream, etc.).

If post-flash fails:
- Capture full tool output.
- Preserve generated sketch/script artifact path.
- Record board profile/FQBN/port used.

## 8. ESP32-S3 Camera Profile Notes
For S3 camera boards:
- Board profile and FQBN must match actual hardware.
- If required by board behavior/toolchain, preflight erase may be needed.
- Camera and Wi-Fi are separate verification steps:
  1. Camera init health
  2. STA connectivity health

If camera health is reachable but reports camera init error, networking path is likely fine; continue camera pin/profile debugging.

## 9. Post-Deployment Change Rule
If node settings are changed after deployment:
- Show dirty-state warning.
- Require `Stop` + `Deploy` before new settings apply.

## 10. Operator Quick Start
1. Load known-good profile.
2. Confirm gateway serial port.
3. Confirm required bindings.
4. Deploy pipeline.
5. Run deterministic command with explicit target.
6. Verify expected physical output.
7. Save profile snapshot when stable.

## 11. Troubleshooting Template
When reporting an issue, always capture:
- Prompt/intent
- Generated contract
- Active profile name
- Target, port, host
- Full compile/upload/runtime output
- Observed behavior vs expected behavior

## 12. CLI Agent Node (Deterministic Tools)
Relay CLI Agent nodes provide controlled file/shell tooling for an owning agent.

Behavior:
- Owner binding accepts agent ID or agent name.
- If owner is blank and only one agent is active, CLI Agent auto-binds to that agent.
- `projectPath` sets workspace root for tool paths.
- Relative paths (for example `docs/a.txt`) are resolved inside `projectPath`.

Execution:
- Agent emits deterministic tool calls as:
  - `CLI_TOOL_JSON: {"tool":"write_file","args":{"path":"docs/x.txt","content":"..."}}`
- CLI Agent executes allowed tools and appends execution results (`PASS`/`FAIL`) into trace/final output.
- During active testing, keep raw tool JSON and execution logs visible.

Step follow-through:
- If prompt explicitly asks for `Step 2: read_file path=...` and model omits it, runtime can append `read_file` follow-through.
- If `apply_patch` old text is already replaced, runtime returns a successful no-op result instead of hard-failing.

Recommended sandbox for validation:
- `/tmp/psf-cli-agent-sandbox`
- Use this as CLI Agent `projectPath` during prototype testing to avoid touching the main project tree.

## Optional persistent llama.cpp Agent state

In an Agent's settings, enable **Keep model state between calls (llama.cpp)**,
then Stop and Deploy to apply the policy. It is off by default. This is useful
for recurrent models such as RWKV7 and is a capability of the normal BMOC-owned
session, not a separate service.

BMOC serializes turns, retains the matching conversation and exact generated token IDs, and addresses slot 0
of that Agent's dedicated llama.cpp process. llama.cpp owns the native sequence
memory; Core-CE never manipulates RWKV tensors. Ordinary llama.cpp Agent calls
also go through BMOC, retaining their previous per-call conversation behavior.

Use **Reset Agent model state** to erase the native slot and retained conversation.
Stop/Deploy creates a fresh session. State does not survive closing or restarting
the model process. After a failed persistent request, reset before continuing:
the server may have partially processed the request. Conversation length remains
subject to the configured context limit; reset when that limit is reached.

All llama.cpp Agents must use their BMOC-owned endpoint. An endpoint registry
cannot redirect a BMOC session to an unowned server. No snapshot, restore, or clone
operations are provided. Reset clears logical state; closing the process releases
its allocated model and sequence buffers.

### BMOC state visibility

Expand a llama.cpp Agent and use **Refresh state** to read BMOC's current session
metadata. Relay displays the BMOC session ID, persistence policy, state status,
generation, successful turns in that generation, lifetime successful turns,
reset count, model/runtime identity, and recent lifecycle events. Pipeline Status
also writes this metadata to the deployment log. Chat run traces capture the
BMOC metadata returned for each completed or failed model call.

A turn means one successful BMOC model call, including repeated visits to an
Agent within a routing cycle. Failed calls do not increment it. A successful reset
increments the generation and reset count and clears the generation's turn count.
Counters start fresh with a new model session. BMOC logs lifecycle transitions;
its in-memory event list retains the latest 100 events. Refresh reads metadata
only: it does not call the model or alter its state. No native tensor contents,
conversation text, or generated token IDs are exposed by these lifecycle records.

For the BMOC ownership contract, continuation details, and regression commands, see [Persistent Agent state](relay-persistent-agent-state.md).
## External kT-emulator Gateway

In an expanded Gateway, select **kT-emulator HTTP**, assign one Agent, and set the running emulator's base URL (normally `http://127.0.0.1:8000`). This is an output Gateway. Deploy after editing settings; manual actions use the deployed configuration.

**Read State** calls `GET /api/state`. **Evaluate** posts the selected existing instruction and evaluation noise to `/api/evaluate`. **Reset Emulator** posts the displayed reset parameters to `/api/reset`; blank starting y is omitted. Reset affects only the external emulator. Relay never starts, stops, or implicitly resets it, and never changes BMOC/model state through these controls.

Operations are serialized, bounded by the configured timeout, and never automatically retried. A timed-out command may already have executed. The Gateway displays its latest operation trace and logs every operation, including Agent/Gateway/BMOC session identity, generation and turn count at dispatch, request parameters, timing, errors, and returned `y`, `ga`, `gb`, and `magnitude`. These identifiers provide correlation only; no RWKV-to-emulator mapping or feedback is applied.

This first integration supports one enabled external emulator Gateway, one assigned deployed Agent, and the emulator's existing single lane/address. Its UI controls share that same emulator state. No Monitor API is used. Trace views are temporary and are not saved in pipeline configuration.

### Manual connection test

1. Start the existing emulator from its project directory with `./start.sh ui --host 127.0.0.1 --port 8000`. Leave it running and dismiss its browser tutorial. Avoid changing its UI controls during the Relay test.
2. Restart Core-CE to load the new UI. Add/expand a Gateway, select **kT-emulator HTTP**, and select the deployed RWKV7 Agent. Set base URL `http://127.0.0.1:8000` and timeout `5000` ms.
3. Select instruction `FF` and evaluation noise `0`. Set reset model `float`, initialization `medium_noiseless`, seed `1`, read noise `0`, and starting y `0.25`. Enable persistence on the ordinary RWKV7 Agent and deploy the pipeline.
4. Click **Read State** and confirm success, HTTP 200, and numeric results. Click **Reset Emulator**, then **Read State**, and copy the values before the next operation.
5. Click **Evaluate** once. Confirm `/api/evaluate`, the selected instruction/noise, success, and a step increment of one. Compare `y`, `ga`, `gb`, and `magnitude`; magnitude should approximately equal `ga + gb`. One instruction need not change all four fields. Reset returns `y: 0` even when starting y is specified; `FF` reads the initialized pair.
6. Click **Read State** to inspect the resulting state, then **Reset Emulator** to confirm step zero and the selected initialization. Neither operation changes the BMOC generation or Agent turn count.
7. Inspect the latest trace below the Gateway controls. Each operation is also logged as `[Relay Gateway]` in the application terminal and `[Relay Gateway trace]` in the renderer console. These are manual operation traces, separate from Agent chat turns. Stop and Deploy again after any settings edits.
