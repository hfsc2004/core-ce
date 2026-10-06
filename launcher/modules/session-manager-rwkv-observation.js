'use strict';
// Private BMOC reader. No tensor writes, state restore, or model transport here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const OBSERVATION = Object.freeze({ id: 'rwkv7-native-sequence', version: '1' });
const PROJECTION = Object.freeze({ id: 'seeded-rademacher', version: '1' });
const DELTA = Object.freeze({ id: 'successive-q', version: '1' });
const SOURCE_HASHES = {
  'src/llama-memory-recurrent.cpp': '2ace296bdab2a150ec6a4f3742cd889a70d0703b31ce0c051bb1bbd81a9291ac',
  'src/llama-context.cpp': '2e5b30b57fe166e8c21397b4ab3fb7050bfd90c3f2f562d111021130d8b6c4de'
};
function cursor(file) {
  const fd = fs.openSync(file, 'r'); const size = fs.fstatSync(fd).size; let offset = 0;
  function skip(n) { if (!Number.isSafeInteger(n) || n < 0 || offset + n > size) throw new Error('Truncated/oversized native state or GGUF'); offset += n; }
  function bytes(n) { const start = offset; skip(n); const b = Buffer.allocUnsafe(n); if (fs.readSync(fd,b,0,n,start) !== n) throw new Error('Incomplete state read'); return b; }
  return { bytes, skip, u32: () => bytes(4).readUInt32LE(), u64: () => {
    const n = Number(bytes(8).readBigUInt64LE()); if (!Number.isSafeInteger(n)) throw new Error('Oversized native field'); return n;
  }, get offset() { return offset; }, size, close: () => fs.closeSync(fd) };
}
function modelLayout(file) {
  const r = cursor(file); const fields = Object.create(null);
  const wanted = new Set(['general.architecture','rwkv7.block_count','rwkv7.embedding_length','rwkv7.wkv.head_size','rwkv7.token_shift_count']);
  function str(read) { const n = r.u64(); if (n > 64 * 1024 * 1024) throw new Error('Oversized GGUF string'); return read ? r.bytes(n).toString('utf8') : r.skip(n); }
  const widths = { 0:1,1:1,2:2,3:2,4:4,5:4,6:4,7:1,10:8,11:8,12:8 };
  function value(type, read = false, depth = 0) {
    if (depth > 1) throw new Error('Unsupported nested GGUF array');
    if (type === 8) return str(read);
    if (type === 9) {
      const item = r.u32(); const count = r.u64();
      if (widths[item]) return r.skip(widths[item] * count);
      if (item !== 8 || count > 2000000) throw new Error('Unsupported GGUF array');
      for (let i=0;i<count;i++) value(item,false,depth+1); return;
    }
    if (!widths[type]) throw new Error('Unknown GGUF metadata type');
    if (!read) return r.skip(widths[type]);
    if (type === 4) return r.u32();
    if (type === 10) return r.u64();
    throw new Error('Unexpected RWKV GGUF metadata datatype');
  }
  try {
    if (r.u32() !== 0x46554747 || r.u32() !== 3) throw new Error('Observation requires GGUF v3');
    r.u64(); const count = r.u64(); if (count > 100000) throw new Error('Oversized GGUF metadata');
    for (let i=0;i<count;i++) { const key = str(true); const decoded=value(r.u32(),wanted.has(key)); if (wanted.has(key)) fields[key]=decoded; }
    if (fields['general.architecture'] !== 'rwkv7') throw new Error('Native observation requires RWKV7 architecture');
    const layers = fields['rwkv7.block_count'], embd = fields['rwkv7.embedding_length'], head = fields['rwkv7.wkv.head_size'];
    const shifts = fields['rwkv7.token_shift_count'] ?? 2;
    if (![layers,embd,head].every(n => Number.isInteger(n) && n > 0) || layers > 512 || shifts !== 2 || embd % head !== 0) throw new Error('Unsupported RWKV7 dimensions');
    const layout = { layers, rElements: shifts * embd, sElements: head * embd };
    if (layers * (layout.rElements + layout.sElements) > 100000000) throw new Error('Native observation exceeds element limit');
    return layout;
  } finally { r.close(); }
}
function verifySource(root) {
  for (const [file, expected] of Object.entries(SOURCE_HASHES)) {
    if (crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex') !== expected) throw new Error('Installed llama.cpp state layout is not supported by this observation reader');
  }
}
function same(value, expected) { return value?.id === expected.id && value?.version === expected.version; }
function validateSelection(selection) {
  if (!same(selection.observation,OBSERVATION) || !same(selection.projection,PROJECTION) || !same(selection.delta,DELTA)) throw new Error('Unsupported native observation/projection/delta capability');
  if (!Number.isSafeInteger(selection.projection.seed) || selection.projection.seed < 0) throw new Error('Invalid projection seed');
  if (Object.keys(selection.delta.parameters || {}).length) throw new Error('successive-q accepts no parameters');
}
function half(bits) {
  const sign = bits & 0x8000 ? -1 : 1; const exp = (bits >> 10) & 31; const mant = bits & 1023;
  return sign * (exp === 0 ? mant * 2**-24 : exp === 31 ? (mant ? NaN : Infinity) : (1 + mant/1024)*2**(exp-15));
}
function projectFile(file, layout, seed, allowEmpty = false) {
  const start = performance.now(); const r = cursor(file); let sum=0, compensation=0, index=0, signs;
  const bf16Scratch=Buffer.allocUnsafe(4);
  const fingerprint = [];
  try {
    if (r.u32() !== 0x67677371 || r.u32() !== 3) throw new Error('Unsupported llama.cpp sequence serialization version');
    const tokens = r.u32(); r.skip(tokens*4); // Packed prompt is never part of the signal.
    const cells=r.u32();
    if (cells !== 1 && !(allowEmpty && cells === 0)) throw new Error('Observation requires exactly one logical recurrent sequence cell');
    if (cells) { r.skip(4); if (r.u32() !== 0) throw new Error('Unexpected native sequence metadata'); }
    if (r.u32() !== 0 || r.u32() !== layout.layers) throw new Error('Unsupported recurrent tensor ordering/layout');
    // Canonical order v1: R layers ascending, then S layers ascending; each
    // logical row in its serialized ggml element order. Never physical offsets.
    for (const [family,n] of [['R',layout.rElements],['S',layout.sElements]]) {
      for (let layer=0;layer<layout.layers;layer++) {
        const type = r.u32(); const width = type === 0 ? 4 : [1,30].includes(type) ? 2 : 0;
        const rowBytes = r.u64();
        if (!width || rowBytes !== n*width) throw new Error('Unsupported recurrent tensor datatype/shape');
        fingerprint.push(`${family}:${layer}:${type}:${n}`);
        // Bound scratch space to one chunk rather than retaining the state.
        for (let position=0;position<(cells ? n : 0);) {
          const count = Math.min(16384,n-position); const b = r.bytes(count*width);
          for (let j=0;j<count;j++,index++) {
            if (index % 256 === 0) signs = crypto.createHash('sha256').update(`Core-CE/rademacher/v1\n${seed}\n${Math.floor(index/256)}\n`).digest();
            const w = signs[(index % 256) >> 3] & (1 << (index % 8)) ? 1 : -1;
            let x;
            if (type === 0) x = b.readFloatLE(j*4);
            else if (type === 1) x = half(b.readUInt16LE(j*2));
            else { bf16Scratch.writeUInt32LE(b.readUInt16LE(j*2)*65536); x=bf16Scratch.readFloatLE(); }
            if (!Number.isFinite(x)) throw new Error('Non-finite recurrent state element');
            const y = w*x-compensation; const t = sum+y; compensation = (t-sum)-y; sum=t;
          }
          position += count;
        }
      }
    }
    if (r.offset !== r.size) throw new Error('Unexpected trailing recurrent state data');
    const q = index ? sum/Math.sqrt(index) : null; if (q !== null && !Number.isFinite(q)) throw new Error('Non-finite projected state');
    return { q, elementCount:index, layoutKey:fingerprint.join('|'), costs: { bytes:r.size, durationMs:performance.now()-start } };
  } finally { r.close(); }
}
function createReader() {
  const cache = new Map();
  function inspect(session) {
    const m = session?.metadata;
    if (m?.persistentSequence !== true || !m.sequenceControlPath || !m.llamaSourceRoot || !m.modelPath) throw new Error('BMOC session lacks native observation resources');
    const key = JSON.stringify([m.modelPath,fs.statSync(m.modelPath).mtimeMs,m.llamaSourceRoot]);
    // Source is checked at validation/arm, even when the model layout is cached.
    verifySource(m.llamaSourceRoot);
    if (!cache.has(key)) { cache.clear(); cache.set(key,modelLayout(m.modelPath)); }
    return cache.get(key);
  }
  function projectInWorker(file,layout,seed,allowEmpty,signal) {
    return new Promise((resolve,reject) => {
      const { Worker }=require('node:worker_threads');
      const worker=new Worker(path.join(__dirname,'session-manager-rwkv-projection-worker.js'),{ workerData:{ file,layout,seed,allowEmpty } });
      let settled=false; let timer;
      const finish=async(error,result) => {
        if (settled) return; settled=true; clearTimeout(timer); signal?.removeEventListener('abort',abort);
        try { await worker.terminate(); } catch (terminationError) { error ||= terminationError; }
        if (error) reject(error); else resolve(result);
      };
      const abort=()=>finish(new Error('BMOC projection invalidated'));
      worker.once('message',message=>finish(message.error ? new Error(message.error) : null,message.result));
      worker.once('error',finish);
      worker.once('exit',()=>{ if (!settled) finish(new Error('BMOC projection worker exited without a result')); });
      timer=setTimeout(()=>finish(new Error('BMOC projection timed out')),30000);
      signal?.addEventListener('abort',abort,{ once:true }); if (signal?.aborted) abort();
    });
  }
  return { inspect, projectFile:projectInWorker, validateSelection };
}
module.exports = { OBSERVATION, PROJECTION, DELTA, createReader, projectFile, modelLayout, verifySource, validateSelection };
