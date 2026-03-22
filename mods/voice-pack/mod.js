'use strict';

const fs = require('fs');
const path = require('path');

function writeMarker(ctx = {}, name, payload = {}) {
  const storagePath = String(ctx.storagePath || '').trim();
  if (!storagePath) return;
  fs.mkdirSync(storagePath, { recursive: true });
  const markerPath = path.join(storagePath, `${name}.json`);
  fs.writeFileSync(markerPath, JSON.stringify({
    event: name,
    ts: new Date().toISOString(),
    ...payload
  }, null, 2), 'utf8');
}

async function onInstall(ctx = {}) {
  writeMarker(ctx, 'install', { modId: ctx.modId, version: ctx.version });
}

async function onEnable(ctx = {}) {
  writeMarker(ctx, 'enable', { modId: ctx.modId, version: ctx.version });
}

async function onDisable(ctx = {}) {
  writeMarker(ctx, 'disable', { modId: ctx.modId, version: ctx.version });
}

async function onUninstall(ctx = {}) {
  writeMarker(ctx, 'uninstall', { modId: ctx.modId, version: ctx.version });
}

async function onHealthCheck() {
  return { ok: true };
}

module.exports = {
  onInstall,
  onEnable,
  onDisable,
  onUninstall,
  onHealthCheck
};

