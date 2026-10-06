# Release Notes - 1.1.23

Date: 2026-10-05

PSF Relay can configure and explicitly run an observation-only RWKV7-to-kT-emulator experiment through the existing NGI Gateway. BMOC remains the sole owner of model processes, sessions, native sequence state, context, and projection baselines.

## Shared experiment configuration

The NGI card, authenticated local CLI, and authorized Experiment Assistant use one controller and draft revision. Portable manifests contain the experiment definition; local Agent binding and run/session/endpoint provenance remain separate. Only explicit user UI/CLI actions can Apply, Arm, Start, or Stop. Helper proposals cannot authorize runtime transitions.

See the [configuration and CLI guide](../ngi-experiment-configuration.md) and [complete manual run workflow](../ngi-experiment-runtime.md).

## Native scalar observations and execution

Select rwkv7-native-sequence v1, seeded-rademacher v1 with a recorded seed, successive-q v1, and scaled-delta-sign v1 with the desired finite scale. BMOC reads a compatible native sequence serialization, computes q and successive-turn delta, and deletes the private temporary file. Relay receives scalar metadata rather than tensors. Compatibility checks use the installed reviewed llama.cpp serialization layout and fail closed when unsupported.

Apply freezes a validated revision; Arm performs external and native preflight checks; Start honors explicit reset policies and enables completed-subject-turn execution. The first completed turn establishes a baseline without driving the emulator. Later nonzero mapped deltas select the positive or negative instruction chosen by the user. Reset/restart/close invalidate continuation of the run. Stop prevents new dispatch, drains an in-flight operation, and releases the observation baseline without resetting either subsystem.

Projection adds per-turn serialization and worker cost. The installed 2.9B model test observed 5,406,720 elements, roughly 21.6 MB of serialization, and approximately 0.41 seconds of total observation overhead on the CPU test machine; timings vary with hardware and runtime.

## Drive modes and returned values

Single-instruction remains the default, including for older manifests. Read-feedback sends FF with configured evaluation noise, then the configured positive/negative instruction with noise 0. The pair holds the Relay adapter queue so manual Relay operations cannot interleave. Other external emulator clients remain outside that queue.

Read-feedback results use fresh read y and post-feedback ga, gb, and magnitude. Separate read/feedback records preserve response snapshots, requests, timing, and correlation identity. Baseline and zero-signal turns send no Evaluate. Read failure prevents feedback; partial execution is retained and pauses without automatic retries. Emulator failures do not reset or fail a successfully completed subject model turn.

Manual Read State/Evaluate/Reset controls remain available. Managed helper knowledge is version 1.0.4. No helper model participates in the measurement loop and no emulator result enters RWKV inputs. No experiment-specific preset or public state snapshot/restore/clone control is included.

## Verification

- 74 focused NGI/Gateway/configuration/knowledge tests pass, including real HTTP timeout handling, shared CLI revisions, authorization, paired drive ordering, failures, and manual-operation serialization.
- 22 BMOC lifecycle tests, Relay coordinator/endpoint-registry checks, and a real CPU-only native RWKV7 continuity/projection/reset/close/restart test pass.
- JavaScript syntax, whitespace, and release metadata/version checks pass.
- The previously established unrelated IRG few-cycle assertion remains failing. The full repository regression matrix was not rerun for this release.

Restart Core-CE and redeploy Relay after updating. Revalidate and explicitly Apply/Arm/Start before running the subject turns.
