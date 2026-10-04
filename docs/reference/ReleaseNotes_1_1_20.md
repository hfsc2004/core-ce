# Release Notes - 1.1.20

## Update Log - October 4, 2026

Catalog Editor can convert supported Hugging Face model sources into validated GGUFs using the installed llama.cpp toolchain. Local inference device selection now supports individual cards, multiple cards, all detected GPUs, and CPU.

## Catalog conversion

- Existing GGUF repositories continue through normal catalog downloads. For sources without GGUF, the installed converter's registry decides architecture compatibility. Core does not maintain a convertible-architecture list or implement tensor remapping.
- Downloads are pinned to the exact source commit, checked against known hashes and sizes, and retained with provenance. Quantization choices come from the installed llama-quantize binary and use the original full-precision GGUF.
- Generated files require readable metadata, matching architecture, complete tensors, and a minimal model load. Optional short inference validation is available. Failed outputs are removed before registration.
- Source tensors and temporary precision files are deleted after success unless the user chooses source retention. Retained tensors allow another quantization without a large repeat download.
- Tool updates use the established Binary Manager in a background worker, with stages and elapsed-time progress. Updates require an explicit action. A first CUDA build can take tens of minutes or longer.

## Base metadata and tokenizer assets

The existing optional Base Model URL works with any source packaging. When it lacks config.json, architecture fetching falls back to Model Page URL. Missing supported vocabulary data can come from the pinned base repository or a verified upstream companion source. Assets require exact source token-ID/byte compatibility and hash checks; their repository, commit, path, and verification results are recorded in provenance. Unknown formats fail explicitly rather than inventing mappings. The currently implemented companion format is RWKV World vocabulary text.

RWKV7-G1k-2.9B-20260930-FLA omits the vocabulary text required by the installed converter. The canonical BlinkDL/ChatRWKV file was verified against all 65,529 source vocabulary tokens and used successfully by the installed converter. The generated Q5_K_M entry retains **RWKV-7 Goose**, **RWKV7 recurrent**, and **llama.cpp** identity.

## AI hardware settings

Settings → Hardware permits one card, any selected combination, all detected GPUs, Automatic, or CPU. NVIDIA choices use persistent UUIDs. Missing selected devices produce errors instead of silently substituting another GPU. Explicit multiple-card selections override legacy single-GPU launch defaults.

Separate CUDA build targets can cover selected cards, all detected architectures, or custom targets. Changing settings does not rebuild tools or alter an update already running. Restart Core to apply settings to existing sessions. The installed backend and available model/memory determine actual multi-GPU placement and utilization.

## Validation

- 60 regression tests passed across HF conversion, supplemental vocabulary verification, Catalog Editor, GPU selection, and background tool updates.
- The existing RLM service and Terminal chatflow regression suites also passed for the grounded attachment-summary changes included in this PR.
- Live workflow validation confirmed the pinned vocabulary hash, all 65,529 token-ID/byte comparisons, and successful tokenizer export by the installed llama.cpp converter.
- The user completed a full RWKV7 Q5_K_M conversion and registration, then confirmed successful interactive chat. The catalog records metadata/model-load validation; its optional one-token smoke-test flag remains false because that option was not selected.
- Application package, package-lock root metadata, master catalog, all generated SKU catalogs, and runtime SKU configuration are updated to 1.1.20.
- This PR also carries the previously local 1.1.19 grounded RLM attachment-summary changes, documented in [the preceding release notes](ReleaseNotes_1_1_19.md).

## Guides

- [HF → GGUF conversion](../hf-gguf-conversion.md)
- [AI device settings](../ai-device-settings.md)

Model weights, installed tool binaries, local settings, credentials, caches, and rotating catalog backups are not included in the release commit. The catalog preserves the locally generated model's provenance; it does not provide a hosted GGUF download URL.
