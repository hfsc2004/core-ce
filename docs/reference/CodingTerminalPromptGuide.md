*Version: 1.1.2*
*Copyright © 2026 Global Science Network*
# Coding Terminal Prompt Guide (Living Document)

Last updated: 2026-02-16  
Status: Active / update as behavior and guardrails evolve

## Purpose
This guide helps users get reliable results from Coding Terminal with Router + Coder.

## Core Idea
- You can speak in normal English.
- Router translates your request into a strict coding contract.
- Coder executes that contract.
- Best results come from clear scope and output format requests.

## Quick Rules
- Name exact files when you want edits.
- Say `fix only` when you want minimal scope.
- Say `do not change anything else` for strict containment.
- Ask for `full corrected <file>` when you want full-file output.
- Ask for `unified diff` only when you specifically want patch format.

## Prompt Templates

### 1) Inspect a File
`Inspect <file> and list only <issue type>. Use exact evidence from the file.`

Example:
`Inspect checkers2.html and list only broken file references.`

### 2) Verify Links Against Project Root
`Inspect <file> and verify linked filenames against actual files in project root. List mismatches only.`

### 3) Single-File Fix (Full File Output)
`Fix only <file> for <issue>. Do not change anything else. Return full corrected <file> only.`

### 4) Single-File Fix (Diff Output)
`Fix only <file> for <issue>. Keep behavior unchanged. Return only a unified diff patch.`

### 5) Multi-File Fix
`Fix only <file1>, <file2>, <file3> for <issue>. Return only modified files. No explanations.`

### 6) New Program Generation
`Generate a complete runnable <app/game/tool> using <tech>. Return full file contents for <file list>. No prose.`

Example:
`Generate a complete runnable checkers game using HTML, CSS, and JavaScript. Return full file contents for index.html, styles.css, and script.js. No prose.`

## Good vs Weak Prompts

Good:
- `Fix only checkers2.html by correcting linked filenames to match project-root files. Return full corrected checkers2.html only.`

Weak:
- `Fix this.`

Why weak prompts fail:
- Missing target files
- Missing output format
- Missing scope constraints

## Output Format Requests
- Use `full corrected <file> only` for full-file responses.
- Use `return only a unified diff patch` for patch responses.
- Avoid asking for both at once.

## Known Failure Patterns (and Fixes)

### A) Wrong File Names Guessed
Symptom:
- model invents `style.css` / `scripts.js` when project has `styles.css` / `script.js`.

Fix prompt:
- `...verify linked filenames against actual files in project root...`

### B) Router Misclassifies Full-File Request as Diff
Symptom:
- strict block with `full-file-request-misclassified`.

Fix prompt:
- keep explicit `Return full corrected <file> only.`

### C) Too Much Extra Prose
Symptom:
- model adds explanations after code.

Fix prompt:
- end with `No explanations.`

## RAG vs Project Root (Important)
- `Project Root` enables authoritative real-file checks and edits.
- `RAG Sources` provides retrieval snippets/context.
- For reliable file edits, set `Project Root` first.

## Recommended Test Sequence
1. Inspect one file.
2. Verify linked filenames vs project root.
3. Fix one file with full-file output.
4. Fix one file with unified diff output.
5. Run multi-file fix.

## Troubleshooting Signals
- `Route Proof`: confirms router rewrite vs final coder input.
- `Grounding proof`: shows retrieval mode and sources.
- `router-strict-v2` errors: strict contract blocked invalid translation.

## Changelog
- 2026-02-16: Initial guide created as living document.

