# Release Notes - 1.1.14

## Update Log - September 9, 2026

This release separates PSF Terminal scratch attachments from persistent RAG/shared bucket context and fixes stale image leakage across fresh Terminal windows.

## Highlights

1. PSF Terminal scratch attachments
- The compose-box `+` button attaches files to the current Terminal window's scratch session.
- Scratch attachments are intended for the active chat/session flow, not durable multi-agent shared context.
- New Terminal windows use distinct attachment session IDs even when BMOC reuses the same model server port.

2. RAG/shared bucket surface
- PSF Terminal now exposes a dedicated `RAG` header button for persistent/shared bucket management.
- The existing bucket manager remains the place to list, remove, clear, create, delete, and manage access for durable shared context.
- Bucket behavior remains available for RAG-like and multi-agent workflows.

3. Vision attachment routing
- llama.cpp vision payloads use the current Terminal attachment session, not a port-derived session.
- Image bytes are sent only for image-intent prompts such as `what is this?`, `describe this image`, or `look at this`.
- Plain chat such as `Hello!` no longer scans or sends stale image attachments.

4. Model/runtime support carried forward
- BMOC-owned llama.cpp Terminal reuse, projector path handling, RLM trace separation, stop handling, and model dropdown persistence remain included in this revision.

## Validation

1. `node launcher/src/terminal-renderer-chatflow.regression.test.js`
2. `node launcher/src/terminal-renderer-bootstrap.regression.test.js`
3. `node --check launcher/src/terminal-renderer-chatflow.js`
4. `node --check launcher/src/terminal-renderer-attachments.js`
5. `node --check launcher/src/terminal-renderer-io.js`
6. `node --check launcher/src/terminal-renderer-init.js`
7. `node --check launcher/src/terminal-renderer-attachments-manager.js`
8. `git diff --check`

## Notes

1. Downloaded GGUF model files are not included.
2. Generated local catalog backup files are not included.
3. Saved-session persistence for scratch attachment manifests remains a future schema task.
