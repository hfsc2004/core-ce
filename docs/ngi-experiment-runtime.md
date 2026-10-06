# NGI native observation and deterministic run

The first observation capability measures the actual current native RWKV7 sequence contents. BMOC owns the model process, slot, conversation/token context, native serialization, projection worker, and scalar baseline. Relay receives bounded scalar metadata. The external kT-emulator remains a separate subsystem. There is no emulator feedback into RWKV, helper call in the measurement loop, Monitor API, LCT preset, physical hardware, or public snapshot/restore/clone capability.

## Configure and run from the UI

1. Restart Core-CE and redeploy the Relay pipeline so BMOC sessions receive the observation resource metadata. Start the external kT-emulator separately. Add one persistent llama.cpp RWKV7 subject with NGI management disabled. A separate helper can remain deployed, but is optional for running the experiment.
2. Expand the output Gateway, select **kT-emulator HTTP**, assign the subject for existing manual operations, set its emulator base URL (normally `http://127.0.0.1:8000`), and deploy. Manual **Read State** can verify connectivity without evaluating an instruction.
3. Open **NGI Experiment** with **Refresh / open experiment configuration**. Select the subject under **Subject and observation source**. Select **rwkv7-native-sequence · v1**. Missing compatibility is shown as a backend error; it blocks execution instead of substituting token/message counts.
4. Under **Projection and delta**, select **seeded-rademacher · v1**, enter the recorded non-negative seed, and select **successive-q · v1**. Delta parameters must be `{}`.
5. Under **Numeric mapping / scaling**, select **scaled-delta-sign · v1** and edit `{"scale":1}` as required. The scale must be finite. A negative scale reverses sign; zero suppresses all drive decisions. This API cannot send an arbitrary analog amplitude: the scaled signal's sign selects an instruction.
6. Under **Drive instructions**, explicitly select the desired positive and negative instructions and evaluation noise. Both begin unspecified. No choice is recommended or selected automatically. Select drive mode **single-instruction** (the default) or **read-feedback**. A zero signal is skipped.
7. Under **Trigger and reset declarations**, select **after-persistent-turn**. Choose **preserve** or **reset-before-run** independently for model and emulator. Preserve performs no reset. Model reset goes through BMOC; emulator reset uses the configured existing API settings. Every Start establishes a fresh scalar baseline regardless of whether the model is preserved.
8. Enable/configure logging and retention, then click **Update shared draft** and **Validate**. Verify `valid: true`, `readyToRun: true`, and no blockers. Unknown capability IDs/versions, invalid parameters, nonpersistent/non-RWKV subjects, or incompatible installed serialization block Apply.
9. Click **Apply** to freeze the definition and revision. Click **Arm** to bind a new run to that subject's BMOC session/lifetime/generation. Arm performs read-only external Read State and private native-format checks; neither evaluates an emulator instruction. Failed checks leave the run paused with an error.
10. Click **Start**. Only the selected reset-before-run policies execute. Open the subject's individual chat and send a normal message. The first completed turn records **baseline-established**, q, and `d_t: null`, and sends no Evaluate. Starting does not itself generate a model turn.
11. Send another message to the subject. A finite nonzero delta is scaled and selects the explicitly configured positive/negative instruction. Single-instruction sends one Evaluate. Read-feedback sends FF with the configured evaluation noise, captures fresh y, then sends the chosen instruction with noise 0. The two requests share one adapter queue reservation so manual Relay operations cannot interleave. Returned summary y comes from the read; ga, gb, and magnitude come from after feedback. Separate read/feedback records retain each response, request, timestamp, and duration. External emulator clients can still interfere; Relay cannot reserve their access. Returned y, ga, gb, magnitude, instruction, and correlation metadata appear in the run records. The emulator's existing external-command refresh displays its graph updates; an instruction need not change every value.
12. Open **Experiment status / results** to inspect q, delta, status, mapped signal, drive, and emulator results. Armed/running status refreshes every two seconds when a text control is not focused; **Refresh shared draft** remains available. In private subject chat, **Show backend trace** exposes the scalar observation and emulator result. Pipeline traces also include those fields. Logging options can omit fields or disable retention; no hidden model reasoning is displayed.
13. Click **Stop**. New dispatch is revoked immediately. An already sent HTTP operation may finish; Stop waits for it and releases the BMOC observation policy. It does not reset either subsystem. Fields become editable again. Before resuming, Apply if the revision changed, then Arm and Start; the next completed turn establishes a new baseline.
14. Save the portable manifest and export results/provenance separately. Results are bounded by the configured retention limit; the card displays the newest 20. Multiple runs have distinct run IDs. Saving a manifest or loading one does not start a run or restore recurrent state.

The trigger also covers completed subject calls in Full Pipeline, although ordinary pipeline routing may call other Agents. The deterministic NGI loop itself calls no LLM. For a one-Agent trial, the subject's private chat gives the clearest sequence of subject turns.

## Versioned projection definition

`rwkv7-native-sequence` v1 requires a compatible installed llama.cpp recurrent sequence format and GGUF RWKV7 architecture. The reader verifies reviewed source fingerprints, sequence-file magic/version 3, one current logical sequence cell, layer counts, row dimensions, supported F32/F16/BF16 types, finite elements, and complete consumption of the file. It does not guess a changed binary layout. Arm can validate an empty new sequence without treating it as a baseline.

Canonical ordering v1 is all native R rows in ascending layer order, followed by all native S rows in ascending layer order; each logical row uses its serialized ggml element ordering. Physical cache addresses, rollback-plane offsets, tokens, positions, headers, and tensor descriptors are excluded from the numeric vector. llama.cpp selects the current logical recurrent state; Core never writes or reconstructs its dynamics.

For zero-based element index i, group `floor(i/256)` has SHA-256 of this exact UTF-8 string:

```text
Core-CE/rademacher/v1\n<seed as decimal integer>\n<group as decimal integer>\n
```

The `\n` notation above denotes actual newline bytes. Read digest bits in byte order and least-significant-bit-first order. A set bit gives +1; an unset bit gives -1. Sum signed decoded elements in canonical order using compensated double-precision accumulation, then divide by `sqrt(N)`. This is `seeded-rademacher` v1. `successive-q` v1 computes `d_t = q_t - q_(t-1)` in BMOC.

Identical native values, layout, seed, and versions reproduce q. The projection is not a semantic score. Independent model runs on different hardware/runtime builds can produce different native values even with the same projection seed. The observation boundary is the server's current state after completion; no additional token decode is forced to advance a pending final sampled token.

## Lifecycle and failure behavior

BMOC keys the baseline to model process lifetime, generation, projection seed, and tensor layout. Reset, restart, close, seed/configuration change, or a new Start invalidates it. Reset/restart/close revoke an active run; revalidate and Arm/Start before new execution. Invalid native serialization or non-finite data pauses observation; no activity-count proxy is substituted.

HTTP failures and timeouts pause automatic execution. There is no automatic retry because the emulator may already have executed an instruction. In read-feedback mode a failed read prevents feedback, while a failed feedback preserves the successful read record; a partial pair may already have changed emulator state. Stop or invalidation between requests blocks feedback. Review the trace and external emulator state before explicitly starting a fresh run. The subject's successful text response remains successful, and its native continuation is not reset by emulator failures.

Armed/running definitions cannot be edited or reapplied. Stop first. Helper-generated Apply/Arm/Start/Stop remain denied by backend authorization, including when the model repeats a user's request. UI and authenticated CLI lifecycle actions use the same controller. Existing manual controls stay available, share the adapter queue, and are logged as manual interference when lifecycle logging is enabled.

## Cost and provenance

For the installed RWKV7-G1k-2.9B model, N is 5,406,720. A CPU-only native test serialized roughly 21.6 MB and took approximately 0.41 seconds for serialization, worker startup, and projection on the test machine; projection itself was approximately 0.36 seconds. These are observed timings, not GPU or universal estimates. Costs scale with native state size and device-to-host transfer.

Scratch reads are bounded to 16,384 elements per chunk (at most 64 KiB for F32). A short-lived Node worker has additional runtime overhead and is terminated after projection, timeout, or invalidation. BMOC retains only the preceding scalar/layout key; it does not retain two native state vectors. Private temporary files are removed on success/error. No snapshot files are included in manifests or results.

Run records separately carry the applied manifest hash, run/Agent/Gateway/BMOC session identity, lifetime/generation/turn correlation, q/delta/seed/version/element count/status, configured mapping/drive, returned emulator values, and observed cost telemetry according to logging settings. Portable manifests retain only the reproducible definition. The installed native reader is intentionally limited to reviewed serialization layouts; updating conversion/runtime tools may require reader compatibility review, never tensor remapping or a silent tool update.
