const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const attachments = require('./index');

async function testAttachTextAndChunk() {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'psf-attachments-test-'));
  const store = attachments.createAttachmentStore({ baseDir: tempRoot });
  const sessionId = 'session_a';

  const record = await store.attachText({
    sessionId,
    displayName: 'notes.md',
    text: 'gpio.red=2\ngpio.blue=3\nperiod_ms=400\ncycles=8\n'.repeat(40)
  });

  assert.ok(record.id);
  assert.strictEqual(record.textExtractable, true);

  const listed = await store.listAttachments(sessionId);
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0].id, record.id);

  const chunked = await store.chunkAttachmentText({
    sessionId,
    attachmentId: record.id,
    chunkChars: 300,
    overlapChars: 80
  });

  assert.ok(Array.isArray(chunked.chunks));
  assert.ok(chunked.chunks.length >= 2);
  assert.ok(chunked.chunks[0].text.includes('gpio.red'));

  await store.deleteSession(sessionId);
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
}

async function testAttachFileAndRemove() {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'psf-attachments-test-'));
  const store = attachments.createAttachmentStore({ baseDir: tempRoot });
  const sessionId = 'session_b';

  const sourceFile = path.join(tempRoot, 'source.txt');
  await fs.promises.writeFile(sourceFile, 'hello world', 'utf8');

  const record = await store.attachFile({
    sessionId,
    sourcePath: sourceFile
  });

  assert.ok(record.id);
  assert.ok(record.sizeBytes > 0);

  const removed = await store.removeAttachment({
    sessionId,
    attachmentId: record.id
  });
  assert.strictEqual(removed.removed, true);

  const listed = await store.listAttachments(sessionId);
  assert.strictEqual(listed.length, 0);

  await store.deleteSession(sessionId);
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
}

async function run() {
  await testAttachTextAndChunk();
  await testAttachFileAndRemove();
  console.log('attachments regression tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

