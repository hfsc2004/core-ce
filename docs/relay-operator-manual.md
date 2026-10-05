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

### NGI Experiment Assistant (draft-only phase)

Add a separate helper Agent and enable **IRG: allow NGI experiment management (helper Agent only)** in its expanded card. This capability is off by default. Leave it disabled on the persistent RWKV7 subject; assign the subject, not the helper, to the kT-emulator Gateway. Deploy after permission/configuration edits. Model calls continue through BMOC-owned sessions.

Select the permitted helper in Relay chat's individual Agent selector and enter requests there. Both the standalone chat window and inline chat dispatch NGI draft tools through BMOC's service boundary. Tool results include the draft and validation in the reply. The Gateway's draft panel remains an alternative entry point; **Refresh draft / validation** reads the same backend draft without calling a model or emulator. A model-supplied requester identity cannot grant permission; the backend checks the selected helper's deployed capability and session before and after each response.

Enabling NGI management also enables automatic **NGI Knowledge — managed by Core** retrieval for private helper requests, including ordinary explanatory conversation. The locked control in the Agent's Tools & Integrations area opens a read-only viewer for the collection version, documents, and references. No upload, edit, deletion, or retrieval toggle is exposed. Permission changes require deployment; the viewer itself never calls a model or emulator.

The bundled collection is isolated from personal/shared uploads and contains curated notes on reservoir computing, RWKV7, kT-RAM instructions, the existing emulator API, and observation/mapping/drive boundaries. It reuses Core's source-of-record RAG retriever with fixed source paths, returning at most three excerpts and 3,600 characters. It needs no embedding model, network connection, or vector-index rebuild. The existing FAISS-labelled Agent button is a placeholder; Core's general vector implementation uses Vectra. Managed NGI retrieval does not modify that index or user buckets.

Retrieved filenames, references, collection version, and excerpt ranges accompany helper response metadata; ordinary replies remain plain text. Live backend capability/configuration data takes precedence over reference material. Retrieval failure is reported as unavailable and does not fail the model turn. The first collection is a starter reference set, not model training or a guarantee of expertise. See [managed NGI knowledge](ngi-managed-knowledge.md) for maintenance and verification.

**Full Pipeline has no IRG tool execution**, including hardware and NGI tools, regardless of live-mode overrides or model-generated plans. Select an individual Agent for IRG tooling. Hardware IRG uses the configured Gateway policy and a validated plan from that selected Agent. Manual Gateway controls remain separate explicit operations.

Greetings and explanatory conversation should produce plain text without tool execution or a draft dump. Draft tools are reserved for explicit management requests; missing parameters require clarification. Backend validation still rejects incomplete model proposals.

The helper can request one explicit `target: "ngi-experiment"` contract per response using the existing `IRG_PLAN_JSON` envelope. Supported draft actions are `ngi_inspect`, `ngi_select_source`, `ngi_configure_mapping`, `ngi_configure_drive`, `ngi_configure_trigger_logging`, `ngi_validate`, `ngi_status`, and `ngi_results`. Source Agent IDs are configuration data, not authorization identities. Mapping IDs/versions and flat numeric parameters are declarations only; this phase has no supported recurrent projection implementation. Trigger declarations are `manual` or `after-persistent-turn`; neither creates a measurement loop.

Draft revisions, source identity, proposed mapping/drive/trigger/logging, validation errors, and capability blockers appear below the controls. Structural validity is separate from readiness: `readyToRun` is always false. Apply/Arm/Start/Stop contracts are recognized but blocked, including through generic IRG and replay paths. No draft tool resets or calls the emulator, changes the deployed Gateway settings, reads native recurrent state, or starts an experiment. The existing manual Read State/Evaluate/Reset Emulator controls remain independent user actions.

Drafts and bounded helper conversations live in memory and are discarded on redeployment. Management logs include the backend requester, subject, action, parameters, and draft revision; no measurements exist yet.

Manual verification:

1. Restart Core-CE. Add the persistent RWKV7 subject and a separate model-backed Experiment Assistant. Leave NGI management off on the subject and enable it on the helper.
2. Configure the kT-emulator HTTP Gateway with the subject assignment and deploy. Open its draft panel, select the helper, and request: "Inspect the NGI Gateway and report the current draft and available capabilities."
3. Request: "Propose FF with evaluation noise 0 in the draft only." Confirm the drive proposal and revision change; the emulator must not advance.
4. Request: "Validate the draft." Confirm missing fields and unavailable capabilities are visible, with `readyToRun: false`. The helper must not claim an executable mapping exists.
5. Request: "Apply, arm, and start the experiment." Any emitted transition contract must be blocked. No Apply/Arm/Start UI action is offered in this phase.
6. Confirm Refresh does not advance any Agent turn; helper requests advance only the helper's session. Subject model state and manual Gateway settings remain unchanged. Manual Read State/Evaluate/Reset Emulator still work against a running emulator.

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
