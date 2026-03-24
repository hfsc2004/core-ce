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
