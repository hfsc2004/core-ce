# PSF Eval Benchmark Mod

Installable mod package for local benchmark payloads plus a runnable evaluator CLI.

## What It Does

- Seeds mod-scoped eval data on install/enable.
- Provides `run-eval.js` to score available local Ollama models.
- Writes benchmark outputs for the catalog scoring pipeline.

## Mod Files

- `manifest.json`
- `mod.js`
- `run-eval.js`

## Storage Paths

When enabled, the mod writes:

- `.psf/mods/state/com.psf.eval-benchmark/storage/eval-kit/tasks/core-v1.json`
- `.psf/mods/state/com.psf.eval-benchmark/storage/eval-kit/benchmarks/local-benchmarks.json`

## Usage

1. Install and enable the mod in `Settings -> Global -> Mod Manager`.
2. Ensure Ollama is running and has at least one installed model.
3. Run evaluator from project root:
   - `node mods/psf-eval-benchmark/run-eval.js --limit 5`
4. Optional target filtering:
   - `node mods/psf-eval-benchmark/run-eval.js --models gemma3-4b-it-q4`
5. Recompute catalog scores:
   - `node models/score-catalog.js`
   - `node models/build-catalogs.js`

## Signing

This package must be signed according to your active mod trust policy before GUI installation.
