# Catalog Editor: local Hugging Face → GGUF conversion

The Catalog Editor delegates conversion to the existing installed llama.cpp source tree. Core does not implement tensor remapping or maintain a list of convertible architectures. Repository Python code is not executed.

## Workflow

The existing **Base Model URL** is optional for any source packaging. It can supply upstream metadata and verified companion assets. Architecture fetching first checks this URL and falls back to Model Page URL if the base repository lacks `config.json`. Conversion uses the actual Model Page repository's configuration and tensors; it never replaces them with base-model tensors. No separate tokenizer URL field is needed.

1. Enter a Hugging Face model repository URL and optionally a revision, branch, tag, or commit. Click **Fetch Model Info** or **Scan repository**.
2. If GGUF files exist, select one and click **Use selected GGUF**. Save the catalog entry and use the normal download workflow. URLs are pinned to the resolved repository commit.
3. For a repository containing configuration, tokenizer assets, and model tensors, Core asks the installed converter's registry to resolve the configuration. Unsupported architectures display: **This model cannot currently be converted by the installed llama.cpp version.** No guessing, remapping, or automatic update follows.
4. Supported sources offer **No GGUF available. Convert locally?** Review the source size and cache option, then click **Convert locally**.
5. Source files are downloaded at the exact resolved commit. When the installed converter exposes `--vocab-only`, Core first downloads metadata/tokenizer assets and invokes that upstream interface before downloading tensors and shard indexes. An architecture recognized by the converter can still have incompatible or incomplete tokenizer packaging. Such failures explain the missing asset and stop before tensor downloads. Safetensors are preferred when both safetensors and PyTorch weights are present. All selected shards, indexes, tokenizer/configuration assets, and other repository data files are preserved. Known upstream SHA-256 values and sizes are checked; local SHA-256 values are recorded for every downloaded file.
6. The installed converter's help determines its supported output types. Core selects F16, then BF16/F32 if F16 is unavailable. The original full-precision GGUF is the only quantization input. Requantization is disabled.
7. After conversion, choose a quantization reported by the installed `llama-quantize`. Preferred choices appear first: Q8_0, Q6_K, Q5_K_M, Q4_K_M. Q5_K_M is the default recommendation for the Tesla P4 8 GB profile when available. Some advanced quantizations may require an importance matrix; if the installed tool rejects a choice, select another.
8. Select a catalog collection and complete required form fields. **Quantize, validate & register** checks GGUF metadata and tensor boundaries, checks architecture identity, and runs the installed `llama-cli` on CPU to load the model. Optional one-token inference is available. Runtime incompatibility prevents registration even if conversion succeeded.

## Tools and resources

Use **Update conversion tools** to explicitly refresh/build llama.cpp through Core's Binary Manager. This builds/stages `llama-server`, `llama-cli`, `llama-gguf-split`, and `llama-quantize`, records the source commit, creates a Python virtual environment under the installed llama.cpp tree, and installs that tree's conversion requirements. Updating runs in a background worker so the interface stays responsive. The status area shows update stages and elapsed time during long operations. A first CUDA rebuild plus dependency installation can take tens of minutes; later builds depend on source changes and cached dependencies. It is never started automatically by conversion.

Plan for roughly 10–30 minutes for the first tool update, possibly longer for a full CUDA rebuild or slow dependency downloads. This is an estimate, not a timeout. Keep Core open until completion is reported. Model download/conversion/quantization is a separate operation whose duration depends on model size, storage speed, memory, and network bandwidth.

The source tree is `binaries/llama.cpp/<platform>/`. Core prefers its `.venv` Python, or `PSF_LLAMA_CPP_PYTHON` when configured, and otherwise tries the system Python. Missing dependencies and unknown converter interfaces are reported explicitly. CPU model validation requires sufficient host RAM; the Tesla P4 recommendation is not a guarantee that every model fits GPU or system memory.

Allow disk space for source weights, a full-precision GGUF, and the quantized output concurrently. The update action additionally needs build and dependency space.

## Cache, cancellation, and failures

- Work files live under `.psf/hf-conversion/work/<session>/`.
- Source files live under `.psf/hf-conversion/sources/<repository-and-commit-hash>/`.
- By default, source tensors and intermediate GGUFs are deleted after successful registration. Provenance remains alongside the generated GGUF and in the catalog.
- **Keep downloaded source tensors in cache** retains the large source files. These are not required to run the model. Scanning the same pinned revision again reuses verified source weights and creates a new full-precision conversion for another quantization.
- Failed conversion removes incomplete output. Failed quantization/load validation removes the rejected final output and keeps the full-precision intermediate for another choice. **Cancel conversion** or closing the editor removes work files and nonretained sources.
- Only one large conversion runs at a time. Tool updates require conversions to be finished or cancelled.
- Cache retention is local disk storage, not a RAG bucket. After an application crash, interrupted work directories may need manual removal when no conversion is running.

## RWKV7 source

`shoumenchougou/RWKV7-G1k-2.9B-20260930-FLA` follows the same Hugging Face workflow as any other source, conditional on installed converter support and successful runtime validation. FLA packaging does not trigger a separate converter.

At source commit `368b3d994bdf576275489f8a5493d221af3f5a3a`, this repository supplies `tokenizer.json` but omits `rwkv_vocab_v20230424.txt`. If the installed converter requests this asset during vocabulary-only checking, Core checks the Base Model repository first. If the file is absent there, it uses BlinkDL/ChatRWKV's canonical data file at commit `02058ba0624a77c20f0913f83550835eb03a8db4`, SHA-256 `e6dee3d4e31b4d5c40ac99508ac6c701ceef4bed681bf2167ce9a908552bca89`.

Before placing a supplemental asset in the source directory, Core compares every token ID and decoded byte sequence with the source `tokenizer.json`, checks its tokenizer semantics, special IDs, vocabulary size, and unused placeholders, and verifies the upstream file hash when available. All 65,529 vocabulary tokens of this FLA model match the canonical file. A mismatch stops before tensor downloads; no token remapping, invented vocabulary, or execution of repository tokenizer Python follows. The installed converter's tokenizer export must then succeed before model download/conversion continues.

To add this model without assistance:

1. Set **Model Page URL** to `https://huggingface.co/shoumenchougou/RWKV7-G1k-2.9B-20260930-FLA`.
2. Set the existing optional **Base Model URL** to `https://huggingface.co/BlinkDL/rwkv7-g1`.
3. Click **Fetch Architecture** if desired; configuration falls back to the actual model repository. Click **Scan repository**, then **Convert locally**.
4. Core retrieves and verifies the missing vocabulary automatically, then uses the installed llama.cpp converter. Choose quantization and register only after normal GGUF validation succeeds.

Supplementation is keyed by the missing asset and an exact verification method, not a model-architecture allowlist. The current companion format is RWKV World vocabulary text; unknown formats remain explicit errors until an exact verifier is available. New model architectures remain the installed converter's decision. No additional conversion-tool rebuild is needed to load this Core change; restart Core.

Generated catalog metadata uses:

- Display name: `RWKV7-G1k-2.9B-20260930`
- Family: `RWKV-7 Goose`
- Architecture key: `rwkv7` (upstream GGUF identity)
- Architecture description: `RWKV7 recurrent`
- Runtime: `llama.cpp`

The workflow rejects an output that identifies this source as another architecture.

## Provenance

Generated GGUFs are placed in `models/<collection>/`. A neighboring `<filename>.provenance.json` and the catalog entry record repository ID, exact source commit and requested revision, original model name/architecture/type, source tensor format and datatypes, source hashes, conversion date, llama.cpp commit when available and runtime version, converter SHA-256, intermediate precision, requested and actual GGUF quantization, generated-file SHA-256, validation results, and source-retention choice.

The provenance sidecar is retained when source tensors are deleted. Model licenses remain those of the source repository; conversion does not change them. Existing Core catalog/SKU build controls continue to determine generated distribution catalogs.

Supplemental tokenizer provenance also records its repository, pinned commit, original path, immutable URL, SHA-256, expected upstream hash, and compatibility-check results. Retained supplemental assets are reverified and recorded on each conversion. When checked, the Base Model repository and exact revision are also retained.

## Regression checks

From the project root, run:

```bash
node launcher/modules/hf-gguf-conversion.regression.test.js
node launcher/modules/conversion-companion-assets.regression.test.js
node launcher/src/model-editor-conversion.regression.test.js
node launcher/modules/binary-manager/binary-manager-llamacpp-worker.regression.test.js
```

Workflow tests use small local fixtures and fake model tools rather than downloading real weights. Installed GGUF reader tests exercise real metadata parsing when the local source tree is present. A full model conversion is a separate integration check requiring installed conversion dependencies and source weights.
