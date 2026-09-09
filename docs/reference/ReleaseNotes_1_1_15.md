# Release Notes - 1.1.15

## Update Log - September 9, 2026

This release fixes Catalog Browser runtime/status display for llama.cpp GGUF models, including Gemma 4 E2B IT.

## Highlights

1. Gemma 4 catalog runtime metadata
- Added missing `runtimes` metadata for `gemma-4-E2B-it-GGUF` in the active catalog files where the model is present.
- Added accelerator/profile/recommendation metadata so the catalog card is complete.
- The model now displays `llama.cpp` instead of the fallback `runtime?` label.

2. llama.cpp readiness display
- Downloaded `.gguf` models that support llama.cpp now show as ready without requiring the legacy Ollama wrapper state.
- Expanded catalog status text now reports `llama.cpp ready` for downloaded llama.cpp models that are not Ollama-wrapped.

## Validation

1. `node --check launcher/src/renderer/renderer-developer/catalog-browser-render-v2-items.js`
2. `node --check launcher/src/renderer/renderer-developer/catalog-browser-render.js`
3. `git diff --check`

## Notes

1. Downloaded GGUF model files are not included.
2. Generated local catalog backup files are not included.
