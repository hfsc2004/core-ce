'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { createModLoader } = require('./mod-loader');
const { canonicalizeManifest } = require('./mod-signature');

async function writeModFixture(root, { modId, capabilities, timeoutEnable = false }) {
  const sourceDir = path.join(root, `${modId}-source`);
  await fsp.mkdir(sourceDir, { recursive: true });

  const manifest = {
    id: modId,
    name: modId,
    version: '1.0.0',
    apiVersion: 1,
    apiRange: { min: 1, max: 1 },
    entrypoint: 'mod.js',
    capabilities
  };
  await fsp.writeFile(path.join(sourceDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const modJs = timeoutEnable
    ? `
module.exports = {
  async onEnable() { return new Promise(() => {}); }
};
`.trim()
    : `
const fs = require('fs');
const path = require('path');
module.exports = {
  async onInstall(ctx) {
    fs.mkdirSync(ctx.storagePath, { recursive: true });
    fs.writeFileSync(path.join(ctx.storagePath, 'installed.txt'), 'ok', 'utf8');
  },
  async onEnable(ctx) {
    fs.writeFileSync(path.join(ctx.storagePath, 'enabled.txt'), 'ok', 'utf8');
  },
  async onDisable(ctx) {
    fs.writeFileSync(path.join(ctx.storagePath, 'disabled.txt'), 'ok', 'utf8');
  },
  async onUninstall(ctx) {
    fs.writeFileSync(path.join(ctx.stateDir, ctx.modId, 'uninstalled.txt'), 'ok', 'utf8');
  }
};
`.trim();
  await fsp.writeFile(path.join(sourceDir, 'mod.js'), `${modJs}\n`, 'utf8');

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const payload = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  const signature = crypto.sign(null, payload, privateKey).toString('base64');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keyId = `ed25519:${modId}`;

  await fsp.writeFile(
    path.join(sourceDir, 'signature.json'),
    JSON.stringify(
      {
        algorithm: 'ed25519',
        keyId,
        publicKeyPem,
        signature
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    sourceDir,
    manifest,
    trustedKeys: { [keyId]: publicKeyPem }
  };
}

async function testLifecycleHappyPath() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'psf-mod-loader-'));
  const fixture = await writeModFixture(tempRoot, {
    modId: 'com.psf.test.lifecycle',
    capabilities: ['ui.panel', 'storage.scoped']
  });

  const loader = createModLoader({ rootDir: path.join(tempRoot, 'mods'), hookTimeoutMs: 1000 });
  const installed = await loader.installFromDirectory({
    sourceDir: fixture.sourceDir,
    edition: 'enterprise',
    trustedKeys: fixture.trustedKeys
  });
  assert.equal(installed.ok, true);

  const enabled = await loader.enableMod({ modId: fixture.manifest.id });
  assert.equal(enabled.ok, true);

  const hasVoiceCapability = await loader.hasEnabledCapability('voice.tts');
  assert.equal(hasVoiceCapability.ok, true);
  assert.equal(hasVoiceCapability.available, false);

  const hasUiCapability = await loader.hasEnabledCapability('ui.panel');
  assert.equal(hasUiCapability.ok, true);
  assert.equal(hasUiCapability.available, true);

  const stateAfterEnable = await loader.readState(fixture.manifest.id);
  assert.equal(stateAfterEnable.enabled, true);

  const disabled = await loader.disableMod({ modId: fixture.manifest.id });
  assert.equal(disabled.ok, true);

  const stateAfterDisable = await loader.readState(fixture.manifest.id);
  assert.equal(stateAfterDisable.enabled, false);

  const removed = await loader.removeMod({ modId: fixture.manifest.id, purge: true });
  assert.equal(removed.ok, true);

  const absence = await loader.attest({ capabilityPrefix: 'voice.' });
  assert.equal(absence.ok, true);
  assert.equal(absence.report.absent, true);
  assert.ok(String(absence.filePath || '').endsWith('.json'));

  const stateAfterRemove = await loader.readState(fixture.manifest.id);
  assert.equal(stateAfterRemove, null);
  await fsp.rm(tempRoot, { recursive: true, force: true });
}

async function testQuarantineOnTimeout() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'psf-mod-loader-'));
  const fixture = await writeModFixture(tempRoot, {
    modId: 'com.psf.test.timeout',
    capabilities: ['ui.panel'],
    timeoutEnable: true
  });

  const loader = createModLoader({ rootDir: path.join(tempRoot, 'mods'), hookTimeoutMs: 50 });
  const installed = await loader.installFromDirectory({
    sourceDir: fixture.sourceDir,
    edition: 'enterprise',
    trustedKeys: fixture.trustedKeys
  });
  assert.equal(installed.ok, true);

  const enabled = await loader.enableMod({ modId: fixture.manifest.id });
  assert.equal(enabled.ok, false);
  assert.equal(enabled.reason, 'hook_failed');

  const state = await loader.readState(fixture.manifest.id);
  assert.equal(state.enabled, false);
  assert.equal(state.quarantined, true);

  const hasCapability = await loader.hasEnabledCapability('ui.panel');
  assert.equal(hasCapability.ok, true);
  assert.equal(hasCapability.available, false);

  const attested = await loader.attest({ modId: fixture.manifest.id });
  assert.equal(attested.ok, true);
  assert.equal(attested.report.present, true);
  assert.ok(String(attested.filePath || '').endsWith('.json'));

  await fsp.rm(tempRoot, { recursive: true, force: true });
}

async function run() {
  await testLifecycleHappyPath();
  await testQuarantineOnTimeout();
  process.stdout.write('mod-loader regression tests passed\n');
}

run().catch((err) => {
  process.stderr.write(`mod-loader regression tests failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
