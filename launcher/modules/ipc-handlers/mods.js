/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const fs = require('fs');
const path = require('path');
const signing = require('../mod-manager/mod-signing');

function getUiStatePath(ctx) {
  const root = String(ctx?.modRootDir || '').trim();
  if (!root) return '';
  return path.join(root, 'ui-state.json');
}

async function loadUiState(ctx) {
  const uiStatePath = getUiStatePath(ctx);
  if (!uiStatePath || !fs.existsSync(uiStatePath)) return {};
  try {
    const raw = await fs.promises.readFile(uiStatePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (_err) {
    return {};
  }
}

async function saveUiState(ctx, patch = {}) {
  const uiStatePath = getUiStatePath(ctx);
  if (!uiStatePath) return;
  const next = {
    ...(await loadUiState(ctx)),
    ...(patch && typeof patch === 'object' ? patch : {})
  };
  await fs.promises.mkdir(path.dirname(uiStatePath), { recursive: true });
  await fs.promises.writeFile(uiStatePath, JSON.stringify(next, null, 2), 'utf8');
}

function createModHandlers() {
  return {
    'mods:pick-directory': async (ctx) => {
      if (!ctx.dialog || typeof ctx.dialog.showOpenDialog !== 'function') {
        return { ok: false, error: 'directory picker unavailable' };
      }
      const uiState = await loadUiState(ctx);
      const defaultPath = String(uiState.lastModSourceDir || '').trim();
      const result = await ctx.dialog.showOpenDialog({
        title: 'Select Mod Source Directory',
        properties: ['openDirectory', 'dontAddToRecent'],
        defaultPath: defaultPath || undefined
      });
      if (result?.canceled || !Array.isArray(result?.filePaths) || result.filePaths.length === 0) {
        return { ok: true, canceled: true, sourceDir: '' };
      }
      const sourceDir = String(result.filePaths[0] || '');
      await saveUiState(ctx, { lastModSourceDir: sourceDir });
      return { ok: true, canceled: false, sourceDir };
    },

    'mods:pick-key-file': async (ctx) => {
      if (!ctx.dialog || typeof ctx.dialog.showOpenDialog !== 'function') {
        return { ok: false, error: 'file picker unavailable' };
      }
      const uiState = await loadUiState(ctx);
      const defaultPath = String(uiState.lastPrivateKeyPath || uiState.lastPrivateKeyDir || uiState.lastModSourceDir || '').trim();
      const result = await ctx.dialog.showOpenDialog({
        title: 'Select Private Key File',
        properties: ['openFile', 'dontAddToRecent'],
        defaultPath: defaultPath || undefined,
        filters: [
          { name: 'PEM keys', extensions: ['pem', 'key'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (result?.canceled || !Array.isArray(result?.filePaths) || result.filePaths.length === 0) {
        return { ok: true, canceled: true, filePath: '' };
      }
      const filePath = String(result.filePaths[0] || '');
      await saveUiState(ctx, {
        lastPrivateKeyPath: filePath,
        lastPrivateKeyDir: path.dirname(filePath)
      });
      return { ok: true, canceled: false, filePath };
    },

    'mods:list-installed': async (ctx) => {
      if (!ctx.modLoader) return { ok: false, error: 'mod loader unavailable' };
      return ctx.modLoader.listInstalled();
    },

    'mods:install-directory': async (ctx, event, payload = {}) => {
      if (!ctx.modLoader) return { ok: false, error: 'mod loader unavailable' };
      const sourceDir = String(payload.sourceDir || '').trim();
      if (!sourceDir) return { ok: false, error: 'sourceDir is required' };

      const resolved = path.resolve(sourceDir);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return { ok: false, error: `sourceDir not found: ${resolved}` };
      }
      await saveUiState(ctx, { lastModSourceDir: resolved });

      const trustedKeys = await signing.loadTrustedKeys(ctx.modRootDir);
      return ctx.modLoader.installFromDirectory({
        sourceDir: resolved,
        edition: payload.edition,
        preset: payload.preset,
        trustedKeys
      });
    },

    'mods:sign-directory': async (ctx, event, payload = {}) => {
      const sourceDir = String(payload.sourceDir || '').trim();
      const privateKeyPath = String(payload.privateKeyPath || '').trim();
      const keyId = String(payload.keyId || '').trim();
      if (!sourceDir) return { ok: false, error: 'sourceDir is required' };
      if (!privateKeyPath) return { ok: false, error: 'privateKeyPath is required' };
      if (!keyId) return { ok: false, error: 'keyId is required' };

      try {
        return await signing.signDirectory({
          sourceDir,
          keyId,
          privateKeyPath,
          rootDir: ctx.modRootDir,
          approve: true
        });
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    'mods:create-keypair': async (ctx, event, payload = {}) => {
      try {
        const keyId = String(payload.keyId || 'ed25519:local-dev-signer').trim();
        const outputDir = String(payload.outputDir || path.join(ctx.modRootDir, 'trust', 'keys')).trim();
        return await signing.createKeyPair({ outputDir, keyId });
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    'mods:list-trusted-keys': async (ctx) => {
      const trusted = await signing.loadTrustedKeys(ctx.modRootDir);
      return {
        ok: true,
        trustedKeysPath: signing.getTrustedKeysPath(ctx.modRootDir),
        keys: trusted
      };
    },

    'mods:enable': async (ctx, event, payload = {}) => {
      if (!ctx.modLoader) return { ok: false, error: 'mod loader unavailable' };
      const modId = String(payload.modId || '').trim();
      if (!modId) return { ok: false, error: 'modId is required' };
      return ctx.modLoader.enableMod({ modId });
    },

    'mods:disable': async (ctx, event, payload = {}) => {
      if (!ctx.modLoader) return { ok: false, error: 'mod loader unavailable' };
      const modId = String(payload.modId || '').trim();
      if (!modId) return { ok: false, error: 'modId is required' };
      return ctx.modLoader.disableMod({ modId });
    },

    'mods:remove': async (ctx, event, payload = {}) => {
      if (!ctx.modLoader) return { ok: false, error: 'mod loader unavailable' };
      const modId = String(payload.modId || '').trim();
      if (!modId) return { ok: false, error: 'modId is required' };
      return ctx.modLoader.removeMod({ modId, purge: payload.purge !== false });
    },

    'mods:read-state': async (ctx, event, payload = {}) => {
      if (!ctx.modLoader) return { ok: false, error: 'mod loader unavailable' };
      const modId = String(payload.modId || '').trim();
      if (!modId) return { ok: false, error: 'modId is required' };
      const state = await ctx.modLoader.readState(modId);
      return { ok: true, state };
    },

    'mods:attest': async (ctx, event, payload = {}) => {
      if (!ctx.modLoader) return { ok: false, error: 'mod loader unavailable' };
      return ctx.modLoader.attest({
        modId: payload.modId,
        capabilityPrefix: payload.capabilityPrefix || 'voice.'
      });
    },

    'mods:has-capability': async (ctx, event, payload = {}) => {
      if (!ctx.modLoader) return { ok: false, available: false, error: 'mod loader unavailable' };
      const capability = String(payload.capability || '').trim();
      if (!capability) return { ok: false, available: false, error: 'capability is required' };
      return ctx.modLoader.hasEnabledCapability(capability);
    }
  };
}

module.exports = {
  createModHandlers
};
