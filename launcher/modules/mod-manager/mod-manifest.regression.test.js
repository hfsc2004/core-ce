'use strict';

const assert = require('assert');

const { validateManifest } = require('./mod-manifest');

function buildValidManifest() {
  return {
    id: 'com.psf.voice-pack',
    name: 'Voice Pack',
    version: '1.0.0',
    apiVersion: 1,
    apiRange: { min: 1, max: 1 },
    entrypoint: 'mod.js',
    capabilities: ['ui.panel', 'commands.register', 'storage.scoped']
  };
}

function testValidManifest() {
  const result = validateManifest(buildValidManifest());
  assert.equal(result.ok, true);
  assert.ok(result.manifest);
  assert.deepEqual(result.manifest.editionSupport, ['standard', 'enterprise', 'datacenter', 'government']);
}

function testUnknownCapabilityRejected() {
  const manifest = buildValidManifest();
  manifest.capabilities.push('network.raw-socket');

  const result = validateManifest(manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('unknown capability')));
}

function testApiRangeCompatibility() {
  const manifest = buildValidManifest();
  manifest.apiRange = { min: 2, max: 3 };

  const result = validateManifest(manifest, { apiMin: 1, apiMax: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('incompatible with host API')));
}

function testEntrypointTraversalRejected() {
  const manifest = buildValidManifest();
  manifest.entrypoint = '../outside.js';
  const result = validateManifest(manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('cannot traverse')));
}

function testEntrypointAbsoluteRejected() {
  const manifest = buildValidManifest();
  manifest.entrypoint = '/tmp/mod.js';
  const result = validateManifest(manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('relative path')));
}

function run() {
  testValidManifest();
  testUnknownCapabilityRejected();
  testApiRangeCompatibility();
  testEntrypointTraversalRejected();
  testEntrypointAbsoluteRejected();
  process.stdout.write('mod-manifest regression tests passed\n');
}

run();
