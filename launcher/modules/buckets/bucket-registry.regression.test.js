#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createBucketRegistry } = require('./bucket-registry');

async function run() {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'psf-bucket-registry-'));
  const filePath = path.join(tempRoot, 'bucket-registry.json');
  const registry = createBucketRegistry({ filePath });

  const created = await registry.upsertBucket({
    id: 'relay-shared-docs',
    label: 'Relay Shared Docs',
    scope: 'relay-shared',
    sessionId: 'moe-shared',
    ownerPrincipal: 'ops-admin',
    grants: [{ principal: 'relay-agent-a', access: 'read' }]
  });
  assert.equal(created.id, 'relay-shared-docs');
  assert.equal(created.sessionId, 'moe-shared');
  assert.equal(created.scope, 'relay-shared');

  const listAll = await registry.listBuckets();
  assert.equal(Array.isArray(listAll), true);
  assert.equal(listAll.length, 1);

  const denied = await registry.resolveBucketTarget({
    bucketId: 'relay-shared-docs',
    principal: 'unknown-agent',
    action: 'read'
  });
  assert.equal(denied.success, false);

  const granted = await registry.grantAccess({
    bucketId: 'relay-shared-docs',
    principal: 'unknown-agent',
    access: 'read'
  });
  assert.equal(Array.isArray(granted.grants), true);

  const resolved = await registry.resolveBucketTarget({
    bucketId: 'relay-shared-docs',
    principal: 'unknown-agent',
    action: 'read'
  });
  assert.equal(resolved.success, true);
  assert.equal(resolved.sessionId, 'moe-shared');

  const revoked = await registry.revokeAccess({
    bucketId: 'relay-shared-docs',
    principal: 'unknown-agent'
  });
  assert.equal(revoked.updated, true);

  const removed = await registry.deleteBucket('relay-shared-docs');
  assert.equal(removed.removed, true);

  const privateBucket = await registry.upsertBucket({
    id: 'private-owner-only',
    label: 'Private Owner Only',
    scope: 'relay-shared',
    sessionId: 'moe-shared',
    ownerPrincipal: 'owner-user',
    grants: []
  });
  assert.equal(privateBucket.id, 'private-owner-only');

  const ownerAllowed = await registry.resolveBucketTarget({
    bucketId: 'private-owner-only',
    principal: 'owner-user',
    action: 'read'
  });
  assert.equal(ownerAllowed.success, true);

  const nonOwnerDenied = await registry.resolveBucketTarget({
    bucketId: 'private-owner-only',
    principal: 'random-user',
    action: 'read'
  });
  assert.equal(nonOwnerDenied.success, false);
}

run()
  .then(() => {
    process.stdout.write('bucket-registry regression tests passed\n');
  })
  .catch((err) => {
    process.stderr.write(`bucket-registry regression tests failed: ${err.stack || err.message}\n`);
    process.exit(1);
  });
