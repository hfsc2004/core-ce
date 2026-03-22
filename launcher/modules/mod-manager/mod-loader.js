/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const { createModManager } = require('./mod-manager');
const modAudit = require('./mod-audit');

function createModLoader(options = {}) {
  const rootDir = options.rootDir || path.join(process.cwd(), 'mods');
  const installedDir = path.join(rootDir, 'installed');
  const stateDir = path.join(rootDir, 'state');
  const attestDir = path.join(rootDir, 'attestations');
  const manager = options.manager || createModManager(options.managerOptions || {});
  const hookTimeoutMs = Number.isInteger(options.hookTimeoutMs) ? options.hookTimeoutMs : 4000;
  const runtimeByModId = new Map();

  async function initialize() {
    await fsp.mkdir(installedDir, { recursive: true });
    await fsp.mkdir(stateDir, { recursive: true });
    await fsp.mkdir(attestDir, { recursive: true });
    return { rootDir, installedDir, stateDir };
  }

  async function installFromDirectory({
    sourceDir,
    edition,
    preset,
    trustedKeys
  }) {
    await initialize();
    modAudit.modInstallRequested({ sourceDir, edition: edition || 'auto' });

    const manifestPath = path.join(sourceDir, 'manifest.json');
    const manifestRaw = await fsp.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    const signaturePath = path.join(sourceDir, 'signature.json');
    const signature = fs.existsSync(signaturePath)
      ? JSON.parse(await fsp.readFile(signaturePath, 'utf8'))
      : null;

    const preflight = manager.preflightPackage({
      manifest,
      signature,
      edition,
      preset,
      trustedKeys
    });
    if (!preflight.ok) {
      modAudit.modInstallDenied({
        stage: preflight.stage,
        errors: preflight.errors || [],
        profile: preflight.profile || null
      });
      if (preflight.stage === 'policy' && Array.isArray(preflight.denied)) {
        modAudit.modCapabilityDenied({
          profile: preflight.profile || null,
          denied: preflight.denied
        });
      }
      return preflight;
    }

    const modId = preflight.manifest.id;
    const version = preflight.manifest.version;
    const targetDir = path.join(installedDir, modId, version);
    const targetParent = path.dirname(targetDir);
    await fsp.mkdir(targetParent, { recursive: true });
    await fsp.rm(targetDir, { recursive: true, force: true });
    await fsp.cp(sourceDir, targetDir, { recursive: true });

    await writeState(modId, {
      modId,
      installedVersion: version,
      enabled: false,
      quarantined: false,
      installedAt: new Date().toISOString()
    });

    const modModule = await loadModule(preflight.manifest, targetDir);
    await runHook(modModule, 'onInstall', {
      modId,
      version,
      rootDir,
      stateDir,
      storagePath: getScopedStoragePath(modId)
    }, hookTimeoutMs);

    modAudit.modInstallVerified({
      modId,
      version,
      profile: preflight.profile
    });
    await writeAttestation('install', {
      modId,
      version,
      profile: preflight.profile,
      allowed: preflight.allowed || [],
      installPath: targetDir
    });

    return {
      ok: true,
      stage: 'install',
      modId,
      version,
      installPath: targetDir,
      profile: preflight.profile,
      allowed: preflight.allowed
    };
  }

  async function enableMod({ modId }) {
    const state = await readState(modId);
    if (!state || !state.installedVersion) {
      return { ok: false, stage: 'enable', reason: 'not_installed' };
    }
    const installPath = path.join(installedDir, modId, state.installedVersion);
    const manifest = JSON.parse(await fsp.readFile(path.join(installPath, 'manifest.json'), 'utf8'));

    try {
      const modModule = await loadModule(manifest, installPath);
      await runHook(modModule, 'onEnable', {
        modId,
        version: state.installedVersion,
        rootDir,
        stateDir,
        storagePath: getScopedStoragePath(modId)
      }, hookTimeoutMs);

      runtimeByModId.set(modId, {
        modId,
        version: state.installedVersion,
        installPath,
        manifest,
        modModule
      });

      await writeState(modId, {
        ...state,
        enabled: true,
        quarantined: false,
        lastEnabledAt: new Date().toISOString(),
        lastError: null
      });
      modAudit.modEnabled({ modId, version: state.installedVersion });
      return { ok: true, stage: 'enable', modId };
    } catch (err) {
      await writeState(modId, {
        ...state,
        enabled: false,
        quarantined: true,
        lastError: err.message,
        lastFailedEnableAt: new Date().toISOString()
      });
      runtimeByModId.delete(modId);
      modAudit.modCrashed({ modId, stage: 'enable', error: err.message });
      return { ok: false, stage: 'enable', modId, reason: 'hook_failed', error: err.message };
    }
  }

  async function disableMod({ modId }) {
    const state = await readState(modId);
    if (!state || !state.installedVersion) {
      return { ok: false, stage: 'disable', reason: 'not_installed' };
    }
    const runtime = runtimeByModId.get(modId);
    if (runtime?.modModule) {
      await runHook(runtime.modModule, 'onDisable', {
        modId,
        version: runtime.version,
        rootDir,
        stateDir,
        storagePath: getScopedStoragePath(modId)
      }, hookTimeoutMs);
    }
    runtimeByModId.delete(modId);
    await writeState(modId, {
      ...state,
      enabled: false,
      lastDisabledAt: new Date().toISOString()
    });
    modAudit.modDisabled({ modId, version: state.installedVersion });
    return { ok: true, stage: 'disable', modId };
  }

  async function removeMod({ modId, purge = true }) {
    const state = await readState(modId);
    if (!state || !state.installedVersion) {
      return { ok: false, stage: 'remove', reason: 'not_installed' };
    }

    await disableMod({ modId });
    const installPath = path.join(installedDir, modId, state.installedVersion);
    const manifest = JSON.parse(await fsp.readFile(path.join(installPath, 'manifest.json'), 'utf8'));
    const modModule = await loadModule(manifest, installPath);
    await runHook(modModule, 'onUninstall', {
      modId,
      version: state.installedVersion,
      rootDir,
      stateDir,
      storagePath: getScopedStoragePath(modId)
    }, hookTimeoutMs);

    await fsp.rm(path.join(installedDir, modId), { recursive: true, force: true });
    if (purge) {
      await fsp.rm(path.join(stateDir, modId), { recursive: true, force: true });
    }
    runtimeByModId.delete(modId);
    modAudit.modRemoved({
      modId,
      version: state.installedVersion,
      purge
    });
    await writeAttestation('remove', {
      modId,
      version: state.installedVersion,
      purge,
      removedAt: new Date().toISOString()
    });
    return { ok: true, stage: 'remove', modId };
  }

  async function listInstalled() {
    await initialize();
    const result = [];
    const modIds = fs.existsSync(installedDir) ? await fsp.readdir(installedDir) : [];
    for (const modId of modIds) {
      const modBase = path.join(installedDir, modId);
      const stat = await fsp.stat(modBase).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const versions = (await fsp.readdir(modBase))
        .filter((entry) => fs.existsSync(path.join(modBase, entry, 'manifest.json')))
        .sort();
      const latestVersion = versions.length ? versions[versions.length - 1] : '';
      let manifest = null;
      if (latestVersion) {
        const manifestPath = path.join(modBase, latestVersion, 'manifest.json');
        manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
      }
      const state = await readState(modId);
      result.push({
        modId,
        installedVersion: state?.installedVersion || latestVersion || '',
        enabled: state?.enabled === true,
        quarantined: state?.quarantined === true,
        manifest
      });
    }
    return { ok: true, mods: result };
  }

  async function attest({ modId = '', capabilityPrefix = 'voice.' } = {}) {
    const prefix = String(capabilityPrefix || 'voice.').trim();
    const listing = await listInstalled();
    if (!listing.ok) return listing;

    const mods = listing.mods || [];
    const targetId = String(modId || '').trim();
    if (targetId) {
      const entry = mods.find((m) => m.modId === targetId) || null;
      const report = {
        type: 'mod-state',
        modId: targetId,
        present: !!entry,
        state: entry || null,
        generatedAt: new Date().toISOString()
      };
      const filePath = await writeAttestation('state', report);
      return { ok: true, report, filePath };
    }

    const matching = mods.filter((m) => {
      const caps = Array.isArray(m?.manifest?.capabilities) ? m.manifest.capabilities : [];
      return caps.some((cap) => String(cap || '').startsWith(prefix));
    });
    const report = {
      type: 'absence',
      capabilityPrefix: prefix,
      absent: matching.length === 0,
      matches: matching.map((m) => ({
        modId: m.modId,
        version: m.installedVersion,
        capabilities: m?.manifest?.capabilities || []
      })),
      generatedAt: new Date().toISOString()
    };
    const filePath = await writeAttestation('absence', report);
    return { ok: true, report, filePath };
  }

  async function hasEnabledCapability(capability) {
    const target = String(capability || '').trim();
    if (!target) return { ok: false, available: false, reason: 'capability_required' };
    const listing = await listInstalled();
    if (!listing.ok) return { ok: false, available: false, reason: 'list_failed' };
    const mods = Array.isArray(listing.mods) ? listing.mods : [];
    const match = mods.find((entry) => {
      if (entry?.enabled !== true) return false;
      const caps = Array.isArray(entry?.manifest?.capabilities) ? entry.manifest.capabilities : [];
      return caps.some((cap) => String(cap || '').trim() === target);
    });
    return {
      ok: true,
      available: !!match,
      capability: target,
      modId: match?.modId || '',
      version: match?.installedVersion || ''
    };
  }

  function getScopedStoragePath(modId) {
    return path.join(stateDir, modId, 'storage');
  }

  async function readState(modId) {
    const statePath = path.join(stateDir, modId, 'state.json');
    if (!fs.existsSync(statePath)) return null;
    return JSON.parse(await fsp.readFile(statePath, 'utf8'));
  }

  async function writeState(modId, state) {
    const modStateDir = path.join(stateDir, modId);
    await fsp.mkdir(modStateDir, { recursive: true });
    await fsp.writeFile(path.join(modStateDir, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
  }

  async function writeAttestation(kind, payload) {
    await fsp.mkdir(attestDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${kind}-${ts}.json`;
    const filePath = path.join(attestDir, fileName);
    const record = {
      kind,
      ...payload
    };
    await fsp.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
    modAudit.modAttestationGenerated({
      kind,
      filePath
    });
    return filePath;
  }

  async function loadModule(manifest, installPath) {
    const entryPath = path.resolve(installPath, manifest.entrypoint);
    delete require.cache[entryPath];
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(entryPath);
  }

  async function runHook(modModule, hookName, context, timeoutMs) {
    const hook = modModule && typeof modModule[hookName] === 'function' ? modModule[hookName] : null;
    if (!hook) return { ok: true, skipped: true };

    let timeoutHandle = null;
    const timeout = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`${hookName} timeout`)), timeoutMs);
    });
    try {
      const result = await Promise.race([Promise.resolve(hook(context)), timeout]);
      return { ok: true, result };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  return {
    initialize,
    installFromDirectory,
    enableMod,
    disableMod,
    removeMod,
    listInstalled,
    attest,
    hasEnabledCapability,
    readState,
    getScopedStoragePath
  };
}

module.exports = {
  createModLoader
};
