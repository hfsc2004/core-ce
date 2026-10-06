# NGI shared experiment configuration

Selecting **kT-emulator HTTP** turns the existing Gateway into the NGI card. The UI, authenticated local CLI, and IRG helper use one backend controller and draft revision. BMOC owns every model session and the registered RWKV7 native observation/projection. A deterministic completed-turn loop can now drive the external emulator without a helper LLM or feedback into RWKV. See [native observation and run workflow](ngi-experiment-runtime.md) for capability IDs, projection math, lifecycle behavior, and limitations. No LCT preset is provided.

## Manual UI workflow

1. Restart Core-CE to load the changes. In PSF Relay add a persistent llama.cpp subject Agent with NGI management disabled. A separate Experiment Assistant may have NGI management enabled. Start the external kT-emulator separately for manual operations.
2. Expand the Gateway, choose **kT-emulator HTTP**, assign the subject, and use the emulator base URL, normally `http://127.0.0.1:8000`. Deploy the pipeline.
3. Under **NGI Experiment**, click **Refresh / open experiment configuration**. The header shows draft and applied revisions. Subject selection sets a local experiment binding; it does not change the manual Gateway assignment.
4. Expand the configuration groups. Select `rwkv7-native-sequence` v1, `seeded-rademacher` v1 with a recorded seed, `successive-q` v1 with empty parameters, and `scaled-delta-sign` v1 with a finite scale. Choose positive and negative instructions explicitly, select single-instruction or read-feedback drive mode, set noise, choose `after-persistent-turn`, and configure reset/logging. Neither instruction is selected automatically. Unsupported manifest IDs remain visible but block Apply.
5. Click **Update shared draft**. This submits the form once and increments the shared revision. Changes are staged until this button is pressed, except the subject dropdown, which submits immediately. Invalid JSON blocks submission. If another interface changed the revision, refresh and use **Discard form edits** before entering fresh edits.
6. Click **Validate**. Missing fields and runtime blockers appear under **Experiment status / results**. Validation does not increment the revision. `readyToRun` becomes true only for a compatible BMOC session and registered capability versions/parameters, explicit drive choices, and the supported trigger.
7. **Apply** records the validated manifest without executing or resetting anything. **Arm** checks external Read State, verifies native sequence serialization, and binds a run to the current BMOC lifetime. **Start** executes only the explicitly configured reset policies, clears the projection baseline, and enables completed-turn execution. **Stop** prevents new dispatch, drains an in-flight operation, and releases the BMOC observation policy without resetting model/emulator state. Stop before editing an armed/running definition; Apply and Arm again after edits.
8. **Save manifest** downloads `ngi-experiment.json`. **Load manifest** first previews the selected JSON. Confirm **Load into draft** to replace the definition and advance the revision; loading does not Apply, Arm, Start, reset, restore, or change the local subject binding.
9. **Experiment status / results** refreshes while armed/running and displays the newest 20 retained records. **Export results / provenance** downloads the retained records with run/session/generation correlation, manifest hash, and native observation cost telemetry. Logging settings control retention. Save the Relay pipeline to retain the definition/local subject binding across restarts. Redeployment begins a fresh revision/status lifetime and never auto-starts a saved definition.
10. Existing **Read State**, **Evaluate**, and **Reset Emulator** remain independent manual operations with their existing traces. They share the HTTP queue with automatic execution and do not change native RWKV state. Manual operations during a run are marked in its lifecycle log; they can change the emulator trajectory and should be accounted for when comparing experiments.

## Portable manifest

The export has exactly `schemaVersion`, `experimentId` (logical experiment identity), and `definition`. It omits draft revision, Gateway/Agent IDs, session/slot IDs, endpoint/port, timestamps, device/backend identities, status, and results. Local subject selection and the emulator URL remain Relay deployment bindings. Import on another system requires selecting the local subject and configuring that system's Gateway.

Definition sections:

| Section | Fields |
| --- | --- |
| subject | Logical role `subject`, required runtime `llama.cpp`, `persistent: true` |
| observation | Nullable proposed `id`, `version` |
| projection | Nullable proposed `id`, `version`; non-negative integer `seed` |
| delta | Nullable proposed `id`, `version`; flat finite numeric `parameters` |
| mapping | Nullable proposed `id`, `version`; flat finite numeric `parameters` (scaling semantics belong to the future implementation) |
| drive | `mode`: `single-instruction` (default for legacy manifests) or `read-feedback`; `positiveInstruction`, `negativeInstruction`, `noise` 0–1, `zeroPolicy: "skip"` |
| trigger | `id`: `manual` or `after-persistent-turn` (declaration only) |
| reset | `modelState`, `emulator`: `preserve` or `reset-before-run`; `baseline: "new-on-start"`; complete `emulatorSettings` with `seed`, `model`, `init`, `read_noise`, optional `start_y` |
| logging | `enabled`, `maxRecords` 1–10000, `fields` chosen from observation/projection/delta/drive/emulator/errors/lifecycle |

Registered implementations are listed in the runtime workflow. Unknown keys, expressions, non-finite values, and machine-specific manifest fields are rejected. Incomplete or unsupported drafts can be exported/imported, but cannot be Applied. Registration does not imply every installed runtime/model supports the native reader.

Validation provenance and result exports separately record deployment/Gateway/local subject identity, model/runtime, BMOC session/lifetime/generation and read-only lifecycle metadata, endpoint, date, config revision, and SHA-256 of the canonical manifest. Completed observations contain q, delta, seed/version, element count, status, mapped signal, selected instruction/noise, and returned y/ga/gb/magnitude according to logging settings. Native tensors and temporary sequence files are never exported.

## CLI commands

Run from the Core-CE project root while the same pipeline is deployed. The CLI does not start another controller, model, or emulator. It reads an ephemeral mode-0600 connection descriptor in `config/relay/ngi-management.json`, written by the existing BMOC-managed Relay ingress and removed on teardown. The management endpoint requires a random bearer token, local origin, and no browser Origin header. Do not share that descriptor. An alternate descriptor can be selected with `--connection PATH`.

```bash
node launcher/modules/moe/moe-ngi-cli.js list
```

Set the returned Gateway ID in a task-specific shell variable:

```bash
NGI_GATEWAY_ID='gateway-id-from-list'
node launcher/modules/moe/moe-ngi-cli.js inspect --gateway "$NGI_GATEWAY_ID"
node launcher/modules/moe/moe-ngi-cli.js select-source --gateway "$NGI_GATEWAY_ID" --params '{"agentId":"local-subject-agent-id"}'
node launcher/modules/moe/moe-ngi-cli.js configure --gateway "$NGI_GATEWAY_ID" --params '{"mapping":{"id":"scaled-delta-sign","version":"1","parameters":{"scale":1}}}'
node launcher/modules/moe/moe-ngi-cli.js configure --gateway "$NGI_GATEWAY_ID" --params '{"projection":{"seed":42}}' --expected-revision 2
node launcher/modules/moe/moe-ngi-cli.js validate --gateway "$NGI_GATEWAY_ID"
node launcher/modules/moe/moe-ngi-cli.js status --gateway "$NGI_GATEWAY_ID"
node launcher/modules/moe/moe-ngi-cli.js save --gateway "$NGI_GATEWAY_ID" --output /tmp/ngi-experiment.json
node launcher/modules/moe/moe-ngi-cli.js load --gateway "$NGI_GATEWAY_ID" --file /tmp/ngi-experiment.json
node launcher/modules/moe/moe-ngi-cli.js results --gateway "$NGI_GATEWAY_ID" --output /tmp/ngi-results.json
node launcher/modules/moe/moe-ngi-cli.js apply --gateway "$NGI_GATEWAY_ID"
node launcher/modules/moe/moe-ngi-cli.js arm --gateway "$NGI_GATEWAY_ID"
node launcher/modules/moe/moe-ngi-cli.js start --gateway "$NGI_GATEWAY_ID"
node launcher/modules/moe/moe-ngi-cli.js stop --gateway "$NGI_GATEWAY_ID"
```

Replace sample local IDs and choose both drive instructions explicitly in the UI or configuration patch. Use the current revision for `--expected-revision`; stale edits fail rather than overwrite. `configure --file PATCH.json` accepts the same section patch as `--params`. `load --file` accepts an exported manifest. Output files must not already exist. Apply requires runtime-capability validation; Arm requires the current applied revision; Start requires an armed lifetime. Failed commands exit with code 1. All responses are JSON, and validation errors/blockers are backend-owned.

CLI mappings: inspect/status/results/validate/save/load map to `ngi_inspect`, `ngi_status`, `ngi_results`, `ngi_validate`, `ngi_save_manifest`, `ngi_load_manifest`. Configure sends `ngi_configure` with `{patch, expectedRevision?}`; select-source sends `ngi_select_source`. User lifecycle commands use the corresponding `ngi_apply/arm/start/stop` actions. These names are also IRG contracts, but helper lifecycle authorization is always denied.

## Verify one shared revision

1. Refresh the UI and note revision **N**.
2. Change drive settings in the form and click **Update shared draft**: revision **N+1**.
3. Run CLI `inspect`: the same settings and **N+1** must appear. Run CLI `configure` to change the projection seed: **N+2**.
4. Refresh the UI: it must show that seed and **N+2**.
5. In the private Experiment Assistant chat, explicitly request a chosen positive/negative instruction change while preserving the other configured drive values. A successful model-produced `ngi_configure_drive` changes that same definition to **N+3** without executing it. Refresh UI and CLI `inspect` to confirm **N+3** and matching settings.
6. Request validation through the helper and run CLI/UI validation. The revision stays **N+3**, and every interface reports the same missing declaration fields and runtime blockers. Helper model calls advance only the helper's BMOC session; the subject and emulator remain untouched.

This revision check edits a stopped draft. Actual execution still requires explicit user Apply, Arm, and Start; helper output never authorizes those transitions.
