# Managed NGI knowledge

The collection lives in `launcher/assets/ngi-knowledge/`. `manifest.json` fixes its identity, version, review date, source files, titles, and references. The six Markdown documents are application-owned reference material. Runtime retrieval is offline and read-only, and source selection never uses user attachments or the shared RAG index.

`moe-ngi-knowledge.js` reuses `rag-source-retrieval.js` with an explicit source allowlist. Managed retrieval uses optional BM25 document ranking, title relevance, and whole-token matching that preserves short identifiers such as FF and RF. Ordinary RAG keeps its existing ranking. This ranking selects excerpts; it does not classify chat commands. The helper model still interprets user intent and generates contracts. Neither retrieval nor reference documents can grant tool permission, bypass contract validation, change BMOC ownership, or start experiments.

Only authorized NGI helper requests receive these excerpts, automatically. Normal Agent chat and Full Pipeline do not acquire this managed collection. The subject remains separate. Context is bounded to three excerpts and 3,600 characters, with source filenames/version in the prompt and source metadata in the backend response. This small starting corpus may need additional curated coverage as experiments develop. Lexical source retrieval may still miss synonymous queries; semantic embeddings are not used in this phase. The backend trace reports the ranking method alongside supplied sources.

## Sources and review

The original summaries draw on Core-CE's current implementation and the inspected external `kT-emulator/app.py`, reviewed October 5, 2026. Background sources:

- [RWKV7 Goose paper](https://arxiv.org/abs/2503.14456): recurrent architecture and state evolution.
- [ktram-neural-core architecture](https://github.com/knowm/ktram-neural-core/blob/main/docs/architecture.md): differential lanes, conductance, and instruction behavior.
- [Knowm thermodynamic computing](https://knowm.org/thermodynamic-computing-physik/): kT-RAM read/adaptation concepts.
- [Herbert Jaeger's echo-state network article](https://www.scholarpedia.org/article/Echo_state_network): reservoir computing background.

Installed emulator/API behavior and live Relay capability metadata override background descriptions. The mapping notes describe the purpose of a future observation-to-signal transformation; they do not choose a projection or introduce an implementation. Drive instruction/noise settings are separate.

Helper instructions require conditional claims to retain their conditions, avoid unsupported frequency claims, and check earlier assistant statements against current sources. These are model instructions, not phrase matching, answer replacement, or a guarantee of factual accuracy. Backend traces allow manual verification of the evidence supplied to the model.

Maintainers update bundled documents and manifest version/review date together through normal code review. No remote documents are downloaded automatically. Restart Core-CE after a collection update; the read-only catalogue is cached for the application lifetime. Adding facts must include sources and distinguish available features from proposals.

## Manual verification

Relay's standalone and inline chat provide **Show backend trace**, off by default. It reveals a collapsible record after each private NGI helper reply: exact supplied knowledge excerpts, filenames/references/version, selected contract (including rejected proposals), outcome, draft revision, and validation. It shows observable backend evidence, not internal model reasoning. Turning it on also reveals retained trace rows in the current window. It makes no backend/model calls and does not affect tool permissions or execution. Older replies from before this feature and reloaded conversation transcripts do not acquire traces retroactively.

1. Restart Core-CE. Enable NGI management on the separate Experiment Assistant and deploy. Keep it disabled on the RWKV7 subject.
2. Expand the helper Agent card and open **NGI Knowledge — managed by Core**. Confirm version `1.0.1`, six sources, source text/references, and no edit/upload controls. The subject card retains its existing integrations.
3. In the helper's private chat, ask: "Why does the experiment need a numeric mapping?" Expect an explanation separating native-state observations, numeric mapping, and instruction/noise drive settings. No draft action is necessary. Live model quality still requires manual verification.
4. Ask: "What is the difference between FF and Read State?" The curated notes explain that instruction evaluation can adapt conductances while the HTTP snapshot is separate. Explanation must not execute the emulator.
5. Ask: "Review our configuration for gaps." Expect the model to request `ngi_validate`; the backend still returns unavailable observations/mappings and readiness false.
6. Verify personal uploads do not appear among managed retrieval sources. Redeployment clears draft state, not the bundled collection. Full Pipeline remains unable to dispatch IRG tools.
