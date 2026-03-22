# Mods User Guide (1.1.2)

## Purpose
This guide explains how end users can install and enable a mod in PSF Offline using the GUI.

Important policy: all editions require signed mods. Unsigned mods will be blocked.

Signature algorithm reference: Ed25519 (RFC 8032)
https://datatracker.ietf.org/doc/html/rfc8032

## Before You Start
1. Launch PSF Offline (Core - Community Edition).
2. Open `Settings`.
3. Go to the `Mods` tab.

You will use these controls:
- `Browse...` (mod folder)
- `Create Keypair`
- `Browse Key...` (private key)
- `Sign + Approve`
- `Install`
- `Enable`

## Typical GUI Flow (Recommended)
1. In `Settings -> Mods`, click `Browse...` and select your mod folder.
Example mod folder in this repo:
`/media/user/Third_4TB/PSF_Offline/PSF_Offline_1.1.2_WORK/mods/voice-pack`

2. Click `Create Keypair`.
This creates a signer keypair used to sign approved mods.

3. Click `Browse Key...` and select the generated private key `.pem`.

4. Confirm `Signer Key ID` is set (for example `ed25519:local-dev-signer`).

5. Click `Sign + Approve`.
This does two things:
- writes `signature.json` into your mod folder
- adds signer public key to trusted key store

6. Click `Install`.
If signing and trust are valid, install succeeds.

7. In `Selected Mod ID`, enter the mod id from `manifest.json`.
Example:
`com.psf.voice-pack`

8. Click `Enable`.
Status should show as `enabled` in Installed Mods list.

## Where Files Are Stored
These locations are important and include hidden directories.

### In-repo mod source (example)
- Mod manifest:
`/media/user/Third_4TB/PSF_Offline/PSF_Offline_1.1.2_WORK/mods/voice-pack/manifest.json`
- Mod signature:
`/media/user/Third_4TB/PSF_Offline/PSF_Offline_1.1.2_WORK/mods/voice-pack/signature.json`

### Hidden mod runtime/trust storage
- Trusted signer keys:
`/media/user/Third_4TB/PSF_Offline/PSF_Offline_1.1.2_WORK/.psf/mods/trust/trusted-keys.json`
- Generated key files:
`/media/user/Third_4TB/PSF_Offline/PSF_Offline_1.1.2_WORK/.psf/mods/trust/keys/`
- Installed mods:
`/media/user/Third_4TB/PSF_Offline/PSF_Offline_1.1.2_WORK/.psf/mods/installed/`
- Mod state:
`/media/user/Third_4TB/PSF_Offline/PSF_Offline_1.1.2_WORK/.psf/mods/state/`
- Attestations:
`/media/user/Third_4TB/PSF_Offline/PSF_Offline_1.1.2_WORK/.psf/mods/attestations/`

### Hidden folder note
`.psf` is hidden (starts with a dot).

Linux/macOS terminal:
```bash
ls -la /media/user/Third_4TB/PSF_Offline/PSF_Offline_1.1.2_WORK/.psf/mods/trust/keys
```

## Status Labels in Installed Mods
Each installed mod shows one status:
- `enabled`: active and loaded
- `disabled`: installed but not active
- `quarantined`: failed to enable (for example timeout/crash)

## Voice Pack Verification
After enabling `com.psf.voice-pack`:
1. Open `Settings -> Speech`
2. Speech controls should be unlocked.
3. Run `Test STT` and `Test TTS`.

If voice pack is disabled or missing, Speech controls lock by policy.

## Common Errors and Fixes
1. `Install failed (trust): signature_required`
- Cause: mod has no `signature.json`.
- Fix: run `Sign + Approve` first.

2. `Install failed (trust): untrusted_signer`
- Cause: signer key not in trusted key store.
- Fix: run `Sign + Approve` with the intended key id.

3. `Browse...` appears to do nothing
- Cause: older window context/scripts.
- Fix: close and reopen Settings (or restart app once).

4. Cannot find private key file
- Cause: key is in hidden `.psf` path.
- Fix: browse to:
`.../.psf/mods/trust/keys/`

## End User Checklist
1. Pick mod folder.
2. Create keypair.
3. Pick private key.
4. Sign + approve mod.
5. Install mod.
6. Enable mod id.
7. Confirm status = `enabled`.
