# Release Notes - 1.1.19

## Update Log - September 10, 2026

This release grounds Recursive RLM chapter/file summaries in actual attachment text instead of allowing metadata-only model guesses.

## Highlights

1. Grounded attachment summaries
- Added `summarize_attachment` to the BMOC-owned Recursive RLM action executor.
- File and chapter prompts now select a text-extractable attachment, read extracted text, isolate the requested chapter when possible, summarize bounded chunks, and compose the final answer from those notes only.
- Tested with PDF chapter prompts such as `please summarize chapter 4 of College ESL Writers_ Applied Grammar and Composing Strategies for.pdf`.

2. Attachment actions
- Added `list_attachments`, `read_attachment`, and `search_attachment` action types to the Recursive RLM root action schema.
- Recursive RLM sessions now retain the active attachment session id so the action executor can read from the selected Terminal/RAG bucket.

3. Failure handling
- PSF Terminal now treats handled RLM failures as RLM errors.
- Failed RLM turns display an error and trace instead of sending the same prompt to the normal provider, which previously let the model hallucinate tool execution.

## Validation

1. `node --check launcher/modules/rlm-service/rlm-action-executor.js`
2. `node --check launcher/modules/rlm-service/rlm-environment.js`
3. `node --check launcher/modules/rlm-service/rlm-root-loop.js`
4. `node --check launcher/modules/rlm-service/rlm-session.js`
5. `node --check launcher/modules/rlm-service/rlm-service.js`
6. `node --check launcher/modules/rlm-service/rlm-service.regression.test.js`
7. `node --check launcher/src/terminal-renderer-chatflow.js`
8. `node --check launcher/src/terminal-renderer-chatflow.regression.test.js`
9. `node launcher/modules/rlm-service/rlm-service.regression.test.js`
10. `node launcher/src/terminal-renderer-chatflow.regression.test.js`

## Notes

1. Model files are not included.
2. Local catalog backup files are not included.
3. Chapter extraction is heading-based. If a PDF's extracted text does not preserve recognizable chapter headings, the answer should say that the requested chapter heading was not found before summarizing the closest available extracted text.
