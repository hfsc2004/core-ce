# Release Notes - 1.1.22

Date: 2026-10-05

PSF Relay's separate Experiment Assistant can manage NGI experiment drafts through individual Agent chat. BMOC remains the sole owner of model processes, sessions, and persistent state.

## Conversational draft management

Enable **IRG: allow NGI experiment management** on the helper Agent, leave it disabled on the persistent subject, and deploy. The backend binds requester identity to that deployed helper; model-supplied identities cannot grant permission. Requests can inspect, propose source/mapping/drive/trigger/logging configuration, validate, or read draft status/results. Natural-language requests are interpreted by the model, without command phrase matching or backend action-selection fallbacks.

Full Pipeline no longer dispatches IRG tools, regardless of live-mode overrides or generated plans. Use individual Agent chat for tooling. Hardware IRG follows its configured Gateway policy; manual external emulator controls remain explicit UI operations. Apply, Arm, Start, and Stop are unavailable in this phase.

## Managed knowledge and backend trace

NGI helpers automatically receive bounded excerpts from the read-only bundled collection, version `1.0.1`. The collection covers reservoir computing, RWKV7, kT-RAM, the existing emulator API, and observation/mapping/drive distinctions. It reuses Core's source-of-record retriever with managed-only BM25 ranking and source isolation. No embedding model or network download is required; user RAG documents and indexes are unchanged.

The locked **NGI Knowledge — managed by Core** control shows collection version, source text, and references. **Show backend trace** in both chat interfaces reveals actual supplied excerpts, contracts, outcomes, and draft validation. It does not expose internal model reasoning. Model explanations remain fallible despite improved grounding.

See [managed knowledge](../ngi-managed-knowledge.md) and the [Relay operator manual](../relay-operator-manual.md).

## Help and Gateway fixes

Settings includes a Help tab with PSF Relay IRG descriptions, supported tool categories, examples, and NGI setup instructions. Categories are collapsed by default, nested beneath their question, with expand/collapse controls.

Gateway input contrast and deployed endpoint-object URL checks were corrected. Agent assignments and BMOC ownership remain intact. External emulator manual operations and live graph updates were verified by the user after a separate kT-emulator refresh fix; that fix is not part of this repository.

## Limits

Only draft management and existing manual emulator operations are available. Native RWKV state capture, numeric mapping implementation, and the measurement loop are not connected. No feedback, Monitor API publishing, hardware, multi-lane support, or snapshots/cloning were added. Drafts and helper histories reset on redeployment. Restart Core-CE after updating the managed collection. Backend trace rows are temporary to the current chat window.

## Validation

- Full repository regression matrix: **26 of 28 suites pass**. Both failures are the previously established independent IRG few-cycle mood-arc and expanded nested-repeat cases (reproduced previously on baseline `6f71500`).
- All **20 NGI experiment**, **13 managed knowledge/trace/retrieval**, **15 external Gateway**, and **22 BMOC** cases pass, as do coordinator and endpoint-registry suites.
- Syntax checks pass for all 28 changed/new JavaScript files; whitespace and release JSON/version checks pass.
- Live Qwen3 1.7B testing verified ordinary conversation, natural-language drive proposals, retaining noise during instruction changes, draft validation, and backend rejection of Start. Retrieved evidence is visible in the trace. Explanations still sometimes introduce unsupported generalizations; grounding is not a guarantee of accuracy.
