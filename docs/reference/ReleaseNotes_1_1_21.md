# Release Notes - 1.1.21

Date: 2026-10-04

PSF Relay now supports BMOC-owned persistent llama.cpp Agent state and a manual HTTP Gateway to an existing external kT-emulator instance.

## Persistent Agent state

Persistent Agents retain exact native completion tokens and matching conversation context across successive calls. BMOC owns inference, slot identity, reset, process lifetime, and teardown. Relay displays read-only session identity, state status/generation, turn/reset counts, and model/runtime identity. Ordinary sessions retain their existing behavior. No native recurrent tensors are exposed or manually managed; no snapshot/restore/clone is provided.

See [persistent Agent state](../relay-persistent-agent-state.md).

## External kT-emulator Gateway

An existing Gateway can select the **kT-emulator HTTP** adapter, assign one deployed Agent, and connect to one external emulator origin. Manual **Read State**, **Evaluate**, and **Reset Emulator** actions use the existing HTTP API. Results include `y`, `ga`, `gb`, and `magnitude`, with BMOC session/generation/turn correlation in operation traces.

The emulator owns its existing single lane/address and Core instance. Core-CE does not create another runtime. Operations serialize, time out, and report errors without automatic retries. Reset is explicit and affects only the emulator. No automatic RWKV-to-kT mapping, feedback into RWKV, Monitor API calls, cycle/sample/preset actions, hardware, or multi-lane support is included.

See the [operator manual](../relay-operator-manual.md#external-kt-emulator-gateway) for configuration and a manual test procedure.

## Validation

- All 14 Gateway regression cases pass, including a real loopback HTTP timeout test, deployment assignment preservation, UI/IPC checks, and BMOC state isolation.
- All 22 BMOC regression cases and the Relay coordinator regression suite pass. The native CPU RWKV7 test previously passed exact-token continuity/cache reuse, reset, close, and restart checks.
- Changed JavaScript syntax and whitespace checks pass; release JSON metadata is valid and consistent at `1.1.21`.
- The prior complete repository matrix passed 23 of 24 suites. Two independent IRG cases (few-cycle mood arc and nested-repeat handling) were reproduced on committed baseline `6f71500`; they remain outside this change.

## Limits

Gateway commands use deployed settings; redeploy after editing. The UI shows the latest operation trace, with operation logs in the application terminal/renderer console. Trace views are temporary. Emulator UI controls share the same external state. A timed-out command may already have executed. Live testing against the user's running kT-emulator remains outstanding.

Model weights, external emulator files, local settings, caches, and rotating catalog backups are not included in this release commit.
