#!/usr/bin/env node
'use strict';

const assert = require('assert');
const coordinator = require('./moe-coordinator');

async function testAttachmentSessionResolutionUsesExplicitId() {
  const sessions = coordinator.__test.getRlmAttachmentSessionsForAgent({
    id: 'agent-abc',
    rlmAttachmentSessionId: 'moe-agent-persisted-123'
  });
  assert.deepEqual(sessions, ['moe-agent-persisted-123', 'moe-shared']);
}

async function testAttachmentSessionResolutionFallsBackToDerivedId() {
  const sessions = coordinator.__test.getRlmAttachmentSessionsForAgent({
    id: 'agent-xyz'
  });
  assert.deepEqual(sessions, ['moe-agent-agent-xyz', 'moe-shared']);
}

async function testCollectAttachmentEvidenceReadsAgentAndSharedBuckets() {
  const calls = [];
  const store = {
    async listAttachments(sessionId) {
      if (sessionId === 'moe-agent-persisted-123') {
        return [{ id: 'a1', displayName: 'agent.md', textExtractable: true }];
      }
      if (sessionId === 'moe-shared') {
        return [{ id: 's1', displayName: 'shared.md', textExtractable: true }];
      }
      return [];
    },
    async readAttachmentText({ sessionId, attachmentId }) {
      calls.push(`${sessionId}:${attachmentId}`);
      if (sessionId === 'moe-agent-persisted-123' && attachmentId === 'a1') {
        return { text: 'agent-only guidance text' };
      }
      if (sessionId === 'moe-shared' && attachmentId === 's1') {
        return { text: 'shared corpus text' };
      }
      return { text: '' };
    }
  };

  const out = await coordinator.__test.collectRlmAttachmentEvidenceFromStore({
    id: 'agent-abc',
    rlmAttachmentSessionId: 'moe-agent-persisted-123'
  }, store);

  assert.match(out, /\[moe-agent-persisted-123\]\s+agent\.md/i);
  assert.match(out, /agent-only guidance text/i);
  assert.match(out, /\[moe-shared\]\s+shared\.md/i);
  assert.match(out, /shared corpus text/i);
  assert.equal(calls.length, 2);
}

async function run() {
  await testAttachmentSessionResolutionUsesExplicitId();
  await testAttachmentSessionResolutionFallsBackToDerivedId();
  await testCollectAttachmentEvidenceReadsAgentAndSharedBuckets();
  process.stdout.write('moe-coordinator regression tests passed\n');
}

run().catch((err) => {
  process.stderr.write(`moe-coordinator regression tests failed: ${err.stack || err.message}\n`);
  process.exit(1);
});

