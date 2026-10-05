'use strict';

// Read-only application collection. No shared index, uploads, embedding service,
// model calls, or runtime lifecycle capabilities are used by this retriever.
const fs = require('node:fs');
const path = require('node:path');
const { createSourceRetriever } = require('../rag-engine/rag-source-retrieval');
const ROOT = path.resolve(__dirname, '../../assets/ngi-knowledge');
const MAX_CONTEXT = 3600;
const clone = value => JSON.parse(JSON.stringify(value));
function completeSentences(text, maxChars) {
  // Check boundaries against the original text, so cutting at a dot within a
  // filename or decimal cannot make it look like the end of a sentence.
  let end = 0;
  for (const match of text.matchAll(/[.!?](?=\s|$)/g)) {
    if (match.index + 1 > maxChars) break;
    end = match.index + 1;
  }
  return text.slice(0, end).trim();
}
let collection;
function load() {
  if (collection) return collection;
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const documents = manifest.documents.map(doc => {
    if (!/^[a-z0-9-]+\.md$/.test(doc.file)) throw new Error('Invalid managed knowledge source');
    const filePath = path.join(ROOT, doc.file);
    return { ...doc, filePath, text: fs.readFileSync(filePath, 'utf8') };
  });
  collection = { ...manifest, documents };
  return collection;
}
function inspect() {
  const data = load();
  return clone({ id: data.id, version: data.version, reviewedAt: data.reviewedAt,
    managed: true, readOnly: true, retrieval: 'source-of-record',
    documents: data.documents.map(({ filePath, ...doc }) => doc) });
}
async function retrieve(query) {
  const data = load();
  const retriever = createSourceRetriever({ fs, ragCommon: {},
    readSourceIndex: () => [], normalizeBucketId: value => value,
    isVectorReady: () => false });
  const hits = await retriever.lookupSourceOfRecord(String(query || '').slice(0, 8000), {
    bucketId: data.id, topK: 3, ranking: 'bm25',
    allowedFilePaths: data.documents.map(doc => doc.filePath)
  });
  const sources = []; const parts = [];
  let remaining = MAX_CONTEXT;
  for (const hit of hits) {
    const doc = data.documents.find(doc => doc.filePath === hit.metadata.filePath);
    if (!doc || remaining <= 0) continue;
    const header = `[NGI source: ${doc.file}; collection ${data.version}] ${doc.title}\n`;
    const excerpt = completeSentences(hit.metadata.text, Math.min(1000, remaining - header.length));
    if (!excerpt) continue;
    const block = header + excerpt;
    parts.push(block); remaining -= block.length + 2;
    sources.push({ file: doc.file, title: doc.title, references: doc.references,
      startLine: hit.metadata.startLine + 1,
      endLine: hit.metadata.startLine + excerpt.split('\n').length,
      excerpt: block });
  }
  return { context: parts.join('\n\n'), metadata: {
    id: data.id, version: data.version, managed: true, readOnly: true,
    retrieval: 'source-of-record', ranking: 'bm25', sources, contextChars: parts.join('\n\n').length
  } };
}
module.exports = { inspect, retrieve, MAX_CONTEXT, completeSentences };
