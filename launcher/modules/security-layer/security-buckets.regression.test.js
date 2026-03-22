#!/usr/bin/env node
'use strict';

const assert = require('assert');
const buckets = require('./security-buckets');

function testScopeResolution() {
  assert.equal(buckets.resolveBucketScope('moe-shared'), 'relay-shared');
  assert.equal(buckets.resolveBucketScope('moe-agent-agent-123'), 'relay-agent');
  assert.equal(buckets.resolveBucketScope('terminal-52454'), 'terminal');
  assert.equal(buckets.resolveBucketScope('cterm_abc'), 'coding-terminal');
}

function testDescriptorSchema() {
  const descriptor = buckets.buildBucketDescriptor('moe-agent-agent-123');
  assert.equal(descriptor.scope, 'relay-agent');
  assert.equal(descriptor.ownerAgentId, 'agent-123');
  assert.equal(descriptor.securityLabel.classification, 'UNCLASSIFIED');
  assert.equal(descriptor.securityLabel.schemaVersion, 'bucket-label/v0-stub');
  assert.equal(descriptor.stub, true);
}

async function testAuthorizeStubAllowsByDefault() {
  const decision = await buckets.authorizeBucketAction({
    action: 'read',
    sessionId: 'moe-shared',
    actor: { userId: 'tester' }
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'stub_allow');
  assert.equal(decision.bucket.scope, 'relay-shared');
}

async function run() {
  testScopeResolution();
  testDescriptorSchema();
  await testAuthorizeStubAllowsByDefault();
  process.stdout.write('security-buckets regression tests passed\n');
}

run().catch((err) => {
  process.stderr.write(`security-buckets regression tests failed: ${err.stack || err.message}\n`);
  process.exit(1);
});

