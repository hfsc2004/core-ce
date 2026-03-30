*Version: 1.1.3*
*Copyright © 2026 Pseudo SF*
# Provenance Matrix

Last updated: February 14, 2026

## Purpose
Track ownership provenance per path so IP claims, attribution, and release compliance stay consistent.

## Status Keys
- `PSF` = Original work owned by Pseudo SF
- `Third-Party` = Owned by external party; used under external license
- `Mixed` = Third-party base with PSF modifications
- `Generated` = Tool-generated artifact (ownership/license follows generator/input terms)
- `Unknown` = Not yet reviewed

## Matrix Template
| Path Pattern | Owner Class | Primary License | Maintainer | Notes |
|---|---|---|---|---|
| `launcher/modules/**/*.js` | PSF | SEE LICENSE.txt | PSF | Core launcher modules authored by PSF (except embedded vendor code) |
| `launcher/src/**/*.js` | PSF | SEE LICENSE.txt | PSF | Renderer/UI logic authored by PSF unless marked otherwise |
| `launcher/src/lib/*.min.js` | Third-Party | Upstream license | PSF | Vendor/minified bundles; preserve upstream notices |
| `binaries/**` | Third-Party | Upstream licenses | PSF | External packaged binaries and runtimes |
| `models/**/*.gguf` | Third-Party | Model-specific licenses | PSF | Model artifacts from upstream sources |
| `models/*.json` | Mixed | Mixed | PSF | Metadata may contain PSF + upstream fields |
| `licenses/**` | Third-Party | Various | PSF | Canonical upstream notices and license texts |
| `*.md` | PSF | SEE LICENSE.txt | PSF | Project docs unless explicitly copied from third party |
| `compile-configs/**` | PSF | SEE LICENSE.txt | PSF | Build/compile config authored by PSF |

## Review Checklist (Per Release)
1. Confirm all new files are mapped to an owner class.
2. Confirm third-party paths still include required notices.
3. Confirm mixed files preserve upstream headers and identify PSF modifications.
4. Confirm `ATTRIBUTIONS.md` and bundled licenses are up to date.
5. Confirm no proprietary claims are made over third-party-only files.

## Change Log
- 2026-02-14: Initial matrix added.
