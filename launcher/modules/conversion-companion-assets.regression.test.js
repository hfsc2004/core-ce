'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { companion } = require('./conversion-companion-assets');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenizer-companion-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const values = [...Array.from({ length: 94 }, (_, i) => i + 33), ...Array.from({ length: 12 }, (_, i) => i + 161), ...Array.from({ length: 82 }, (_, i) => i + 174)];
  const chars = [...values]; let extra = 0;
  for (let byte = 0; byte < 256; byte++) if (!values.includes(byte)) { values.push(byte); chars.push(256 + extra++); }
  const encoder = new Map(values.map((byte, i) => [byte, String.fromCodePoint(chars[i])]));
  const vocab = { '<|endoftext|>': 0 };
  const lines = [];
  for (let byte = 0; byte < 256; byte++) { vocab[encoder.get(byte)] = byte + 1; lines.push(`${byte + 1} b'\\x${byte.toString(16).padStart(2, '0')}' 1`); }
  vocab['\ue000257\ue001'] = 257;
  const tokenizer = { model: { type: 'WordPiece', unk_token: '<|endoftext|>', continuing_subword_prefix: '', vocab }, normalizer: null,
    pre_tokenizer: { type: 'ByteLevel', add_prefix_space: false, use_regex: false }, decoder: { type: 'ByteLevel' },
    added_tokens: [{ id: 0, content: '<|endoftext|>', special: true }] };
  const config = { vocab_size: 258, eos_token_id: 0 };
  fs.writeFileSync(path.join(root, 'asset.txt'), lines.join('\n'));
  const run = () => {
    fs.writeFileSync(path.join(root, 'tokenizer.json'), JSON.stringify(tokenizer));
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(config));
    return spawnSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(__dirname, 'hf-conversion-tools.py'), root,
      'verify-rwkv-vocabulary', root, path.join(root, 'asset.txt')], { encoding: 'utf8' });
  };
  return { root, tokenizer, config, run };
}
test('companion records contain pinned revision/hash and no model-architecture registry', () => {
  const asset = companion('rwkv_vocab_v20230424.txt');
  assert.match(asset.revision, /^[a-f0-9]{40}$/); assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.ok(asset.url.includes(asset.revision)); assert.equal(companion('unknown.txt'), null);
});
test('real verifier accepts exact byte tokens, special ID zero, and unused placeholders', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const check = JSON.parse(result.stdout);
  assert.equal(check.matched_tokens, 256); assert.equal(check.unused_token_count, 1);
});
test('real verifier rejects changed token IDs', t => {
  const f = fixture(t), entries = Object.keys(f.tokenizer.model.vocab).filter(key => f.tokenizer.model.vocab[key] === 1 || f.tokenizer.model.vocab[key] === 2);
  [f.tokenizer.model.vocab[entries[0]], f.tokenizer.model.vocab[entries[1]]] = [2, 1];
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /differs from source token ID/);
});
test('real verifier rejects added special tokens and non-placeholder extra entries', t => {
  const f = fixture(t); f.tokenizer.added_tokens.push({ id: 257, content: '<special>', special: true });
  assert.notEqual(f.run().status, 0);
  f.tokenizer.added_tokens.pop(); delete f.tokenizer.model.vocab['\ue000257\ue001']; f.tokenizer.model.vocab['unexpected'] = 257;
  assert.match(f.run().stderr, /not an unused placeholder/);
});
test('real verifier rejects tokenizer semantics and special-ID changes', t => {
  const f = fixture(t); f.tokenizer.pre_tokenizer.use_regex = true;
  assert.match(f.run().stderr, /byte-token semantics/);
  f.tokenizer.pre_tokenizer.use_regex = false; f.config.eos_token_id = 1;
  assert.match(f.run().stderr, /special token IDs/);
});
