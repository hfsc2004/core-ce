'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const knowledge = require('./moe-ngi-knowledge');
const { createSourceRetriever } = require('../rag-engine/rag-source-retrieval');
const { createController } = require('./moe-ngi-experiment');

test('managed catalogue is versioned, readable, and returned as a detached copy', () => {
  const a = knowledge.inspect();
  assert.equal(a.version, '1.0.4'); assert.equal(a.managed, true); assert.equal(a.readOnly, true);
  assert.equal(a.documents.length, 6);
  assert(a.documents.every(d => d.references.length && d.text.length));
  a.documents[0].text = 'user uploaded replacement';
  assert(!knowledge.inspect().documents[0].text.includes('user uploaded replacement'));
});
test('numeric mapping retrieval grounds the precise distinction and bounds helper context', async () => {
  const result = await knowledge.retrieve('Why does the experiment need a numeric mapping?');
  assert.equal(result.metadata.sources[0].file, 'signal-boundaries.md');
  assert.match(result.context, /A mapping is not an instruction or a noise parameter/);
  assert.match(result.context, /transforms an observation/);
  assert(result.context.length <= knowledge.MAX_CONTEXT);
  assert(result.metadata.sources.length <= 3);
  assert(result.metadata.sources.every(s => s.references.length));
  const other = await knowledge.retrieve('Explain reservoir computing and echo-state networks');
  assert(other.metadata.sources.some(s => s.file === 'reservoir-computing.md'));
});
test('private source retrieval ignores query paths, injected seeds, and shared indexes', async () => {
  const reads = [];
  const retriever = createSourceRetriever({ fs: { existsSync: () => true,
    readFileSync: p => { reads.push(p); return 'numeric mapping managed facts'; } },
    ragCommon: { listItems: () => { throw new Error('Shared vectors must not be accessed'); } },
    readSourceIndex: () => { throw new Error('User sources must not be accessed'); },
    normalizeBucketId: value => value, isVectorReady: () => true });
  const options = { bucketId: 'core-ngi-managed', allowedFilePaths: ['/managed.md'],
    seedResults: [{ metadata: { filePath: '/user.md' } }] };
  const result = await retriever.lookupSourceOfRecord('numeric mapping /user.md', options);
  assert.deepEqual(reads, ['/managed.md']); assert.equal(result[0].metadata.filePath, '/managed.md');
  reads.length = 0;
  assert.deepEqual(await retriever.lookupSourceOfRecord('numeric mapping /user.md', { ...options, allowedFilePaths: [] }), []);
  assert.equal(reads.length, 0);
});
test('existing unrestricted source retrieval remains available for ordinary RAG', async () => {
  const retriever = createSourceRetriever({ fs: { existsSync: () => true,
    readFileSync: () => 'numeric mapping ordinary user source' }, ragCommon: {},
    readSourceIndex: () => [{ metadata: { filePath: '/user.md', bucketId: 'default' } }],
    normalizeBucketId: value => value, isVectorReady: () => false });
  const result = await retriever.lookupSourceOfRecord('numeric mapping');
  assert.equal(result[0].metadata.filePath, '/user.md');
});
function fixture(knowledgeOverride) {
  const calls = [];
  const status = { id: 'deployment', gateways: { g: { adapter: 'kt-emulator-http', enabled: true,
    assignedAgentIds: ['subject'], ktEmulator: { baseUrl: 'http://127.0.0.1:8000' } } }, agents: {
    helper: { ngiManagement: true, sessionId: 'helper-session' },
    subject: { ngiManagement: false, sessionId: 'subject-session', provider: 'llama.cpp', persistentSequence: true }
  } };
  const controller = createController({ getStatus: () => status, knowledge: knowledgeOverride,
    callHelper: async (id, messages) => { calls.push({ id, messages }); return { success: true, content: 'A mapping transforms state observations into a signal.' }; } });
  return { controller, calls };
}
test('helper receives automatic grounding and citations without executing draft tools', async () => {
  const f = fixture(knowledge);
  const result = await f.controller.chat('helper', 'Why is a numeric mapping needed?');
  assert.equal(result.success, true);
  assert.match(f.calls[0].messages[0].content, /NGI source: signal-boundaries.md/);
  assert.match(f.calls[0].messages[0].content, /authoritative/);
  assert.equal(f.calls[0].id, 'helper');
  assert.equal(result.experiment.revision, 0);
  assert(result.knowledge.sources.length);
  assert(!result.content.includes('NGI draft tool result'));
  assert.equal(await f.controller.chat('subject', 'Explain mapping'), null);
  assert.equal(f.calls.length, 1);
});
test('retrieval failure is reported separately and does not fabricate evidence or fail the model turn', async () => {
  const f = fixture({ retrieve: async () => { throw new Error('unavailable'); } });
  const result = await f.controller.chat('helper', 'Explain mapping');
  assert.equal(result.success, true); assert.equal(result.knowledge.available, false);
  assert.match(f.calls[0].messages[0].content, /No relevant managed knowledge excerpt/);
  assert.equal(result.experiment.revision, 0);
});
test('knowledge UI is locked and inspects a read-only IPC catalogue', async () => {
  const context = { window: { electronAPI: { getMoENgiKnowledge: async () => knowledge.inspect() } },
    escapeBinding: value => String(value).replaceAll('<', '&lt;'), renderModelOrdering: () => {}, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../../src/renderer/renderer-developer/moe-kt-gateway.js'), 'utf8'), context);
  assert.match(context.window.renderNgiKnowledge('helper'), /🔒 NGI Knowledge — managed by Core/);
  await context.window.inspectNgiKnowledge('helper');
  const html = context.window.renderNgiKnowledge('helper');
  assert.match(html, /version 1.0.4/); assert.match(html, /read only/);
  assert.match(html, /signal-boundaries.md/); assert(!html.includes('<input')); assert(!html.includes('<textarea'));
  const handlers = require('../ipc-handlers/moe').createMoEHandlers();
  assert.equal(handlers['moe-ngi-knowledge']({ sessionManager: { getMoENgiKnowledge: () => knowledge.inspect() } }).readOnly, true);
  assert(!Object.keys(handlers).some(key => /ngi-knowledge.*(upload|edit|delete)/.test(key)));
});
test('backend trace contains the exact supplied excerpts and distinguishes conversation from tools', async () => {
  const f = fixture(knowledge);
  const result = await f.controller.chat('helper', 'Why can FF change conductance?');
  assert.equal(result.backendTrace.scope, 'NGI helper');
  assert.equal(result.backendTrace.toolRequested, false);
  assert.equal(result.backendTrace.contract, null);
  assert(result.backendTrace.knowledge.sources.length);
  for (const source of result.backendTrace.knowledge.sources) {
    assert(source.excerpt);
    assert(f.calls[0].messages[0].content.includes(source.excerpt));
  }
  assert(!Object.hasOwn(result.backendTrace, 'messages'));
  assert(!Object.hasOwn(result.backendTrace, 'reasoning'));
});
test('backend trace toggle hides/shows retained rows and renders excerpts as text', () => {
  const rows = [];
  const document = { querySelectorAll: () => rows, createElement: tag => ({ tag, style: {}, children: [],
    appendChild(child) { this.children.push(child); } }) };
  const context = { window: {}, document };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../../src/moe-chat-backend-trace.js'), 'utf8'), context);
  const parent = { appendChild: node => rows.push(node) };
  const result = { backendTrace: { knowledge: { excerpt: '<script>bad()</script>' }, toolRequested: false } };
  context.window.MoeBackendTrace.append(parent, result);
  assert.equal(rows[0].hidden, true);
  assert.match(rows[0].children[2].textContent, /<script>/);
  assert.equal(rows[0].children[2].innerHTML, undefined);
  context.window.MoeBackendTrace.toggle(true); assert.equal(rows[0].hidden, false);
  context.window.MoeBackendTrace.append(parent, result); assert.equal(rows[1].hidden, false);
  context.window.MoeBackendTrace.toggle(false); assert(rows.every(row => row.hidden));
  context.window.MoeBackendTrace.append(parent, {}); assert.equal(rows.length, 2);
});
test('FF grounding distinguishes read-induced adaptation from a dedicated write', async () => {
  const result = await knowledge.retrieve('Why can FF change conductance even though it is called a read instruction?');
  const source = result.metadata.sources.find(s => s.file === 'kt-instructions.md');
  assert(source);
  assert.match(source.excerpt, /not a dedicated write or feedback instruction/);
  assert.match(source.excerpt, /does not reclassify FF as a write instruction/);
  assert.match(source.excerpt, /sub-threshold read can leave conductances unchanged/);
  for (const hit of result.metadata.sources) assert.match(hit.excerpt, /[.!?]$/);
  assert.equal(result.metadata.version, '1.0.4');
  assert(result.context.length <= knowledge.MAX_CONTEXT);
});
test('excerpt bounds preserve complete sentences without cutting words or decimal dots', () => {
  assert.equal(knowledge.completeSentences('First sentence. An unfinished second sentence continues.', 30), 'First sentence.');
  assert.equal(knowledge.completeSentences('Version 1.2 is supported. Another sentence.', 10), '');
  assert.equal(knowledge.completeSentences('A sentence too long to fit.', 5), '');
});
test('managed ranking retrieves short instruction identifiers and the previously missed question', async () => {
  for (const query of ['Does the available documentation establish how often FF changes conductance?',
    'Explain FF', 'What does RF do?']) {
    const result = await knowledge.retrieve(query);
    assert.equal(result.metadata.ranking, 'bm25');
    assert(result.metadata.sources.some(source => source.file === 'kt-instructions.md'), query);
    assert(result.context.length <= knowledge.MAX_CONTEXT);
  }
});
test('short identifiers match whole tokens instead of unrelated substrings', async () => {
  const content = { '/instruction.md': '# Instructions\nFF is a floating read.',
    '/unrelated.md': '# Buffers\nBuffer offsets differ.' };
  const retriever = createSourceRetriever({ fs: { readFileSync: p => content[p] }, ragCommon: {},
    readSourceIndex: () => [], normalizeBucketId: value => value, isVectorReady: () => false });
  const result = await retriever.lookupSourceOfRecord('FF', { ranking: 'bm25', allowedFilePaths: Object.keys(content) });
  assert.deepEqual(result.map(r => r.metadata.filePath), ['/instruction.md']);
});
