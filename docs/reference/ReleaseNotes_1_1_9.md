# Release Notes - 1.1.9

## Update Log - September 8, 2026

This release publishes the tested catalog entries for new llama.cpp GGUF models.

## Highlights

1. Qwen3.8 catalog entry
- Added Qwen3.8 4B Distill Q8_0 GGUF metadata to the active catalog files.
- The catalog entry points at the GGUF artifact only; no model binary is committed.

2. Gemma 4 catalog entry
- Added Gemma 4 E2B IT Q8_0 GGUF metadata to the active catalog files.
- The catalog entry is intended for llama.cpp runtimes that support the `gemma4` GGUF architecture.

## Validation

1. Active catalog JSON files were parsed successfully.
2. Local catalog backup files were intentionally excluded from this release.

## Notes

1. This release does not include downloaded GGUF model files.
2. This release does not include automatically generated local catalog backup files.
