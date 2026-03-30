# Voice Execution TODO (1.1.3)

## Goal
Stabilize voice behavior across all chat surfaces, with focus on hot-mic prevention and consistent UX.

## 1. Cross-Surface Voice Regression
- [ ] Test PSF Terminal: PTT mode
- [ ] Test PSF Terminal: VOX mode
- [ ] Test PSF Terminal: TTS on/off combinations
- [ ] Test PSF Coding Terminal: PTT mode
- [ ] Test PSF Coding Terminal: VOX mode
- [ ] Test PSF Coding Terminal: TTS on/off combinations
- [ ] Test Relay Pipeline Chat: PTT mode
- [ ] Test Relay Pipeline Chat: VOX mode
- [ ] Test Relay Pipeline Chat: TTS on/off combinations

## 2. VOX Hot-Mic / Noise Tuning
- [ ] Tune VOX sensitivity threshold to reduce false triggers
- [ ] Tune silence detection and auto-send delay defaults
- [ ] Add/adjust junk transcript filtering for repeated garbage/noise strings
- [ ] Verify VOX re-arm loop still works correctly after tuning

## 3. STT UX Polish
- [ ] Ensure all long-running STT operations show clear animated status
- [ ] Validate startup prewarm behavior is consistent and non-intrusive
- [ ] Verify mic control remains explicit (no unexpected auto-listen)

## 4. TTS Stability Pass
- [ ] Verify CUDA instability paths fail over cleanly to CPU
- [ ] Confirm no hard-fail regressions on model/runtime edge cases
- [ ] Validate long-form pacing/prosody behavior with punctuation

## 5. Voice Mod + Policy Verification
- [ ] Confirm voice capability gating behaves correctly when mod is disabled
- [ ] Confirm expected behavior when voice pack is enabled
- [ ] Verify signed/trusted mod requirement continues to enforce policy

## 6. Exit Criteria
- [ ] No persistent hot-mic behavior in normal room-noise environment
- [ ] No cross-surface behavior mismatch for PTT/VOX/TTS toggles
- [ ] No blocking runtime errors in STT/TTS flows
- [ ] Results logged in release notes/changelog before merge

## 7. RLM + MicroPython Integration (Next Phase Queue)
- [ ] Define RLM role for hardware flow: planner/reviewer/repair loop around IRG contracts
- [ ] Add dedicated MicroPython-focused RLM context pack (board pins, timing limits, allowed actions)
- [ ] Implement "contract critic" pass: RLM compares user intent vs deterministic contract and proposes minimal fixes
- [ ] Add bounded RLM self-repair retries (max iterations + timeout + deterministic guardrails)
- [ ] Keep deterministic execution source-of-truth (RLM cannot bypass schema/validator)
- [ ] Add explainability output: show original request, RLM deltas, and final contract
- [ ] Add regression tests for weak-model prompts (Gemma-class) showing measurable contract quality lift
- [ ] Add benchmark harness: compare no-RLM vs RLM-assisted resolution latency and intent-match score
- [ ] Add kill switch per edition/profile (standard/enterprise/DoD) for RLM-assisted hardware planning
- [ ] Document deployment guidance and known limits in release notes
