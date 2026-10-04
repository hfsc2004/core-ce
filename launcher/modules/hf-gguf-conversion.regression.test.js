'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createConversionService, parseSource, safePath, quantizations, selectSourceFiles, UNSUPPORTED, run } = require('./hf-gguf-conversion');

const repo = 'shoumenchougou/RWKV7-G1k-2.9B-20260930-FLA';
const commit = 'a'.repeat(40);
const quantHelp = 'usage: quantize model-f32.gguf [model-quant.gguf] type [nthreads]\n  7 or Q8_0 : eight\n  18 or Q6_K : six\n  17 or Q5_K_M : five\n  15 or Q4_K_M : four\n  23 or IQ4_XS : extra\n';
function fixture(t, flags = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psf-conversion-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'launcher'), tools = path.join(root, 'tools');
  fs.mkdirSync(app); fs.mkdirSync(path.join(tools, 'bin'), { recursive: true });
  const exe = n => path.join(tools, 'bin', n + (process.platform === 'win32' ? '.exe' : ''));
  for (const n of ['llama-quantize', 'llama-cli']) fs.writeFileSync(exe(n), 'fixture');
  fs.writeFileSync(path.join(tools, 'convert_hf_to_gguf.py'), 'fixture');
  const config = { architectures: ['Rwkv7ForCausalLM'], model_type: 'rwkv7', torch_dtype: 'bfloat16' };
  const content = { 'config.json': JSON.stringify(config), 'tokenizer.json': '{}', 'model.safetensors': 'source tensor fixture' };
  if (flags.sharded) content['model.safetensors.index.json'] = '{"weight_map":{"weight":"model.safetensors"}}';
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  const siblings = Object.entries(content).map(([rfilename, data]) => ({ rfilename, size: Buffer.byteLength(data), lfs: { sha256: digest(data) } }));
  if (flags.gguf) siblings.push({ rfilename: 'existing-Q8_0.gguf' });
  if (flags.badHash) siblings[2].lfs.sha256 = '0'.repeat(64);
  const calls = [], requests = [], registered = [];
  let quantFail = flags.quantFail;
  const deps = {
    toolsRoot: tools,
    jsonRequest: async url => {
      requests.push(url);
      if (url.includes('/api/models/BlinkDL/')) return { sha: 'b'.repeat(40), siblings: flags.baseAsset ? [{ rfilename: 'rwkv_vocab_v20230424.txt' }] : [] };
      return url.includes('/api/models/') ? { sha: commit, siblings } : config;
    },
    sha256: async file => file.endsWith('.companion.partial')
      ? (flags.badCompanionHash ? '0'.repeat(64) : require('./conversion-companion-assets').companion('rwkv_vocab_v20230424.txt').sha256)
      : digest(fs.readFileSync(file)),
    download: async (url, destination) => {
      requests.push(url);
      fs.writeFileSync(destination, url.endsWith('rwkv_vocab_v20230424.txt') ? 'verified vocabulary fixture' : content[decodeURIComponent(url.split('/').pop())]);
    },
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      if (args.includes('probe')) return { output: JSON.stringify({ supported: !flags.unsupported, architecture: 'Rwkv7ForCausalLM', gguf_architecture: 'rwkv7' }) };
      if (args.includes('source-types')) return { output: '{"datatypes":["BF16"]}' };
      if (args.includes('verify-rwkv-vocabulary')) {
        if (flags.incompatibleCompanion) throw new Error('Supplemental vocabulary differs from source token ID 45');
        return { output: '{"compatible":true,"matched_tokens":65529,"method":"exact-token-id-and-byte-comparison"}' };
      }
      if (args.includes('validate')) return { output: JSON.stringify({ architecture: flags.wrongArch ? 'llama' : 'rwkv7', unquantized: !flags.quantizedInput && /model-F16/.test(args.at(-1)), file_type: 1, quantization: /model-F16/.test(args.at(-1)) ? 'F16' : 'Q5_K_M' }) };
      if (args.includes('--vocab-only')) {
        if (flags.badTokenizer) throw new Error('assert (self.dir_model / "required_vocab.txt").is_file()\nAssertionError');
        if (flags.missingWorld && (!fs.existsSync(path.join(args[1], 'rwkv_vocab_v20230424.txt')) || flags.retryFail)) throw new Error('assert (self.dir_model / "rwkv_vocab_v20230424.txt").is_file()\nAssertionError');
        fs.writeFileSync(args[args.indexOf('--outfile') + 1], 'tokenizer only');
        return { output: '', code: 0 };
      }
      if (args.includes('--outfile')) {
        fs.writeFileSync(args[args.indexOf('--outfile') + 1], 'base precision');
        if (flags.convertFail) throw new Error('Converter failed after partial output');
        return { output: '', code: 0 };
      }
      if (command === exe('llama-quantize')) {
        if (args[0] === '--help') return { code: 1, output: quantHelp };
        fs.writeFileSync(args[1], 'quantized fixture');
        if (quantFail) { quantFail = false; throw new Error('Quantizer failed'); }
        return { output: '', code: 0 };
      }
      if (command === exe('llama-cli')) {
        if (args[0] === '--help') return { output: '--model --predict --prompt --gpu-layers --ctx-size --no-conversation --no-warmup', code: 0 };
        if (args[0] === '--version') return { output: 'llama.cpp b9999 fixture', code: 0 };
        if (flags.loadFail) throw new Error('Unsupported architecture in runtime');
        return { output: 'model loaded', code: 0 };
      }
      return { output: `usage: converter model --outfile OUT --outtype {f32,f16,bf16,q8_0}${flags.legacyVocab ? '' : ' --vocab-only'}`, code: 0 };
    }
  };
  const service = createConversionService(app, deps);
  const catalog = {
    getMasterCatalog: async () => ({ collections: { core: { models: [] } } }),
    addModel: async (_app, collection, model) => {
      assert.equal(collection, 'core');
      if (flags.registerFail) return { success: false, message: 'Catalog save failed' };
      registered.push(model); return { success: true };
    }
  };
  return { root, tools, service, catalog, calls, requests, registered,
    scan: (input = {}) => service.scan(1, { url: `https://huggingface.co/${repo}`, revision: 'release', ...input }, 'token', () => {}),
    finish: id => service.finish(1, { sessionId: id, quantization: 'Q5_K_M', collectionId: 'core', modelData: { name: 'untrusted name', architecture: 'llama', license: 'apache-2.0' } }, catalog) };
}

test('source URLs, traversal and symlinks are constrained', t => {
  assert.deepEqual(parseSource('https://huggingface.co/org/model/tree/release'), { repo: 'org/model', revision: 'release' });
  for (const value of ['https://evil.test/org/model', '../model', 'https://huggingface.co@evil.test/org/model']) assert.throws(() => parseSource(value));
  for (const value of ['../out', '/abs', 'dir/../../out', 'dir\\out', 'x:stream']) assert.throws(() => safePath('/tmp/cache', value));
  const f = fixture(t);
  fs.symlinkSync(os.tmpdir(), path.join(f.root, 'linked'), 'dir');
  assert.throws(() => safePath(f.root, 'linked/out'), /Symlink/);
});
test('quantization choices come from installed binary help, including nonpreferred types', () => {
  assert.deepEqual(quantizations(quantHelp), ['Q8_0', 'Q6_K', 'Q5_K_M', 'Q4_K_M', 'IQ4_XS']);
});
test('source download includes tokenizer and shard index while preferring safetensors', () => {
  const names = ['config.json', 'tokenizer.model', 'model.safetensors.index.json', 'model-00001-of-00002.safetensors', 'model-00002-of-00002.safetensors', 'pytorch_model.bin', 'modeling_remote.py', 'LICENSE'];
  assert.deepEqual(selectSourceFiles(names.map(rfilename => ({ rfilename }))).map(f => f.rfilename), names.filter(n => !['pytorch_model.bin', 'modeling_remote.py'].includes(n)));
  assert.throws(() => selectSourceFiles([{ rfilename: 'config.json' }]));
});
test('upstream tokenizer incompatibility fails before tensor downloads with missing-file detail', async t => {
  const f = fixture(t, { badTokenizer: true });
  const scan = await f.scan();
  await assert.rejects(f.service.prepare(1, { sessionId: scan.sessionId }, 'token'), /Required source file is missing: required_vocab.txt/);
  assert.equal(f.requests.some(url => url.includes('/resolve/') && url.endsWith('model.safetensors')), false);
  assert.equal(f.calls.some(call => call.args.includes('source-types')), false);
  assert.equal(f.calls.some(call => call.args.includes('--outfile') && !call.args.includes('--vocab-only')), false);
  assert.equal(fs.readdirSync(path.join(f.root, '.psf/hf-conversion/work')).length, 0);
  assert.equal(fs.readdirSync(path.join(f.root, '.psf/hf-conversion/sources')).length, 0);
});
test('tokenizer preflight delegates to installed converter before tensor conversion', async t => {
  const f = fixture(t), scan = await f.scan();
  await f.service.prepare(1, { sessionId: scan.sessionId }, 'token');
  const vocab = f.calls.findIndex(call => call.args.includes('--vocab-only'));
  const tensors = f.calls.findIndex(call => call.args.includes('source-types'));
  assert.ok(vocab >= 0 && vocab < tensors);
  const output = f.calls[vocab].args;
  assert.equal(fs.existsSync(output[output.indexOf('--outfile') + 1]), false);
});
test('older converter without vocab-only retains supported conversion interface', async t => {
  const f = fixture(t, { legacyVocab: true }), scan = await f.scan();
  await f.service.prepare(1, { sessionId: scan.sessionId }, 'token');
  assert.equal(f.calls.some(call => call.args.includes('--vocab-only')), false);
});
test('shard indexes are withheld until tokenizer-only checking finishes', async t => {
  const f = fixture(t, { sharded: true, badTokenizer: true }), scan = await f.scan();
  await assert.rejects(f.service.prepare(1, { sessionId: scan.sessionId }, 'token'), /tokenizer/);
  assert.equal(f.requests.some(url => url.includes('/resolve/') && url.endsWith('model.safetensors.index.json')), false);
});
test('missing vocabulary is verified from pinned upstream and retained in provenance', async t => {
  const f = fixture(t, { missingWorld: true }), scan = await f.scan({ baseModelUrl: 'https://huggingface.co/BlinkDL/rwkv7-g1' });
  await f.service.prepare(1, { sessionId: scan.sessionId }, 'token');
  const result = await f.finish(scan.sessionId);
  const asset = result.model.provenance.supplemental_assets[0];
  assert.equal(asset.repository, 'BlinkDL/ChatRWKV');
  assert.equal(asset.revision, '02058ba0624a77c20f0913f83550835eb03a8db4');
  assert.equal(asset.verification.matched_tokens, 65529);
  assert.equal(asset.sha256, require('./conversion-companion-assets').companion(asset.path).sha256);
  assert.equal(result.model.provenance.base_model_repository, 'BlinkDL/rwkv7-g1');
  assert.equal(result.model.provenance.base_model_revision, 'b'.repeat(40));
  assert.equal(f.calls.filter(call => call.args.includes('--vocab-only')).length, 2);
  assert.equal(f.requests.some(url => url.includes('raw.githubusercontent.com') && url.includes(asset.revision)), true);
});
test('Base Model URL supplies a compatible companion before the upstream fallback', async t => {
  const f = fixture(t, { missingWorld: true, baseAsset: true }), scan = await f.scan({ baseModelUrl: 'https://huggingface.co/BlinkDL/rwkv7-g1' });
  await f.service.prepare(1, { sessionId: scan.sessionId }, 'token');
  const result = await f.finish(scan.sessionId);
  assert.equal(result.model.provenance.supplemental_assets[0].source, 'base-model-repository');
  assert.equal(f.requests.some(url => url.includes('raw.githubusercontent.com')), false);
});
for (const [flag, message] of [['badCompanionHash', /SHA-256 mismatch/], ['incompatibleCompanion', /differs from source token/], ['retryFail', /AssertionError/]]) {
  test(`${flag} rejects supplemental output before downloading model tensors`, async t => {
    const f = fixture(t, { missingWorld: true, [flag]: true }), scan = await f.scan();
    await assert.rejects(f.service.prepare(1, { sessionId: scan.sessionId }, 'token'), message);
    assert.equal(f.requests.some(url => url.includes('/resolve/') && url.endsWith('model.safetensors')), false);
    assert.equal(f.registered.length, 0);
    assert.equal(fs.readdirSync(path.join(f.root, '.psf/hf-conversion/work')).length, 0);
  });
}
test('retained supplemental vocabulary is verified again and recorded on reuse', async t => {
  const f = fixture(t, { missingWorld: true }), first = await f.scan();
  await f.service.prepare(1, { sessionId: first.sessionId, keepSource: true }, 'token');
  await f.finish(first.sessionId);
  const second = await f.scan();
  await f.service.prepare(1, { sessionId: second.sessionId }, 'token');
  assert.equal(f.calls.filter(call => call.args.includes('verify-rwkv-vocabulary')).length, 2);
});
test('existing GGUF bypasses converter/tool discovery and pins normal download URL', async t => {
  const f = fixture(t, { gguf: true });
  fs.rmSync(f.tools, { recursive: true });
  const scan = await f.scan();
  assert.equal(scan.mode, 'download'); assert.equal(f.calls.length, 0);
  assert.match(scan.files[0].download_url, new RegExp(commit));
});
test('unsupported architecture is rejected before tensors download, with exact wording', async t => {
  const f = fixture(t, { unsupported: true });
  const result = await f.scan();
  assert.equal(result.error, UNSUPPORTED); assert.equal(result.unsupported, true);
  assert.equal(f.requests.length, 2); assert.equal(f.registered.length, 0);
  assert.equal(fs.readdirSync(path.join(f.root, '.psf/hf-conversion/work')).length, 0);
});
test('conversion registers RWKV7 only after validation and cleans source cache by default', async t => {
  const f = fixture(t);
  const scan = await f.scan();
  const prepare = await f.service.prepare(1, { sessionId: scan.sessionId }, 'token');
  assert.equal(prepare.recommended, 'Q5_K_M');
  const result = await f.finish(scan.sessionId);
  assert.equal(result.success, true); assert.equal(f.registered.length, 1);
  const model = result.model;
  assert.equal(model.name, 'RWKV7-G1k-2.9B-20260930');
  assert.equal(model.model_family, 'RWKV-7 Goose'); assert.equal(model.architecture, 'rwkv7');
  assert.equal(model.architecture_description, 'RWKV7 recurrent'); assert.deepEqual(model.runtimes, ['llama.cpp']);
  assert.equal(model.provenance.source_revision, commit);
  assert.deepEqual(model.provenance.original_tensor_datatype, ['BF16']);
  assert.equal(model.provenance.source_files.length, 3);
  assert.match(model.sha256, /^[a-f0-9]{64}$/);
  assert.ok(fs.existsSync(path.join(f.root, 'models/core', model.filename + '.provenance.json')));
  assert.equal(fs.readdirSync(path.join(f.root, '.psf/hf-conversion/sources')).length, 0);
  const quant = f.calls.find(c => c.command.endsWith('llama-quantize') && c.args[0] !== '--help');
  assert.match(quant.args[0], /model-F16.gguf$/); assert.equal(quant.args[2], 'Q5_K_M');
  assert.ok(!quant.args.includes('--allow-requantize'));
  assert.ok(f.calls.find(c => c.args.includes('--model') && c.args.includes('--predict')));
  assert.ok(f.requests.every(url => url.includes('/api/') || url.includes(commit)));
});
test('retained source tensors are reused for another quantization without weight redownload', async t => {
  const f = fixture(t);
  const scan = await f.scan();
  await f.service.prepare(1, { sessionId: scan.sessionId, keepSource: true }, 'token');
  await f.finish(scan.sessionId);
  assert.equal(fs.readdirSync(path.join(f.root, '.psf/hf-conversion/sources')).length, 1);
  const before = f.requests.filter(url => url.endsWith('model.safetensors')).length;
  const next = await f.scan(); await f.service.prepare(1, { sessionId: next.sessionId }, 'token');
  assert.equal(f.requests.filter(url => url.endsWith('model.safetensors')).length, before);
  await f.service.cancel(1, next.sessionId);
});
for (const [label, flag, expected] of [['download hash', 'badHash', /SHA-256 mismatch/], ['converter', 'convertFail', /Converter failed/], ['quantized base', 'quantizedInput', /already quantized/], ['architecture drift', 'wrongArch', /unexpected architecture/]]) {
  test(`${label} failure removes incomplete files and prevents registration`, async t => {
    const f = fixture(t, { [flag]: true }); const scan = await f.scan();
    await assert.rejects(f.service.prepare(1, { sessionId: scan.sessionId }, 'token'), expected);
    assert.equal(f.registered.length, 0);
    assert.equal(fs.readdirSync(path.join(f.root, '.psf/hf-conversion/work')).length, 0);
    assert.equal(fs.readdirSync(path.join(f.root, '.psf/hf-conversion/sources')).length, 0);
  });
}
for (const flag of ['loadFail', 'registerFail']) {
  test(`${flag} removes final output and never registers invalid model`, async t => {
    const f = fixture(t, { [flag]: true }); const scan = await f.scan();
    await f.service.prepare(1, { sessionId: scan.sessionId }, 'token');
    await assert.rejects(f.finish(scan.sessionId)); assert.equal(f.registered.length, 0);
    const work = path.join(f.root, '.psf/hf-conversion/work', scan.sessionId);
    assert.deepEqual(fs.readdirSync(work).filter(n => n.endsWith('.gguf')), ['model-F16.gguf']);
    if (fs.existsSync(path.join(f.root, 'models/core'))) assert.deepEqual(fs.readdirSync(path.join(f.root, 'models/core')), []);
    await f.service.cancel(1, scan.sessionId);
  });
}
test('failed quantization can retry from the original precision, and sessions enforce ownership', async t => {
  const f = fixture(t, { quantFail: true }); const scan = await f.scan();
  await assert.rejects(f.service.prepare(2, { sessionId: scan.sessionId }, ''), /not found/);
  await f.service.prepare(1, { sessionId: scan.sessionId }, 'token');
  await assert.rejects(f.service.finish(1, { sessionId: scan.sessionId, quantization: 'Q99_X' }, f.catalog), /not supported/);
  await assert.rejects(f.finish(scan.sessionId), /Quantizer failed/);
  assert.equal((await f.finish(scan.sessionId)).success, true);
});
test('Python inspection uses converter registry and detects unknown architectures without a fixed list', async t => {
  const f = fixture(t);
  const gguf = 'MODEL_ARCH_NAMES = {7: "rwkv7"}\n';
  fs.writeFileSync(path.join(f.tools, 'gguf.py'), gguf);
  fs.writeFileSync(path.join(f.tools, 'convert_hf_to_gguf.py'), `
class ModelType:
    TEXT = 1
def get_model_architecture(config, model_type):
    return config['architectures'][0]
def get_model_class(name):
    if name != 'BrandNewUpstreamArchitecture':
        raise NotImplementedError(name)
    class Upstream:
        model_arch = 7
    return Upstream
`);
  const config = path.join(f.root, 'config.json');
  const invoke = async architecture => {
    fs.writeFileSync(config, JSON.stringify({ architectures: [architecture] }));
    const result = await run('python3', [path.join(__dirname, 'hf-conversion-tools.py'), f.tools, 'probe', config]);
    return JSON.parse(result.output);
  };
  assert.equal((await invoke('BrandNewUpstreamArchitecture')).supported, true);
  assert.equal((await invoke('Unknown')).supported, false);
});
test('subprocess cancellation terminates running tools', async () => {
  const controller = new AbortController();
  const promise = run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(promise, /cancelled/);
});
test('installed GGUF reader validates real metadata and rejects truncated tensor output', async t => {
  const { getCurrentPlatformKey } = require('./binary-manager/binary-manager-platform');
  const upstream = path.resolve(__dirname, '../../binaries/llama.cpp', getCurrentPlatformKey());
  if (!fs.existsSync(path.join(upstream, 'gguf-py/gguf'))) return t.skip('Installed gguf-py source is unavailable');
  const f = fixture(t), output = path.join(f.root, 'tiny.gguf');
  const script = `
import sys
sys.path.insert(0, sys.argv[1])
import numpy as np
import gguf
w = gguf.GGUFWriter(sys.argv[2], 'rwkv7')
w.add_file_type(gguf.LlamaFileType.MOSTLY_F16)
w.add_tensor('fixture.weight', np.ones((4, 4), dtype=np.float16))
w.write_header_to_file()
w.write_kv_data_to_file()
w.write_tensors_to_file()
w.close()
`;
  await run('python3', ['-c', script, path.join(upstream, 'gguf-py'), output]);
  const args = [path.join(__dirname, 'hf-conversion-tools.py'), upstream, 'validate', output];
  const result = JSON.parse((await run('python3', args)).output);
  assert.equal(result.architecture, 'rwkv7'); assert.equal(result.quantization, 'F16'); assert.equal(result.unquantized, true);
  assert.equal(result.tensor_count, 1);
  fs.truncateSync(output, fs.statSync(output).size - 8);
  await assert.rejects(run('python3', args), /Tool exited/);
});
test('Python adapter supports the older monolithic installed converter registry', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.tools, 'gguf.py'), 'MODEL_ARCH_NAMES = {8: "upstream_new_arch"}\n');
  fs.writeFileSync(path.join(f.tools, 'convert_hf_to_gguf.py'), `
class Model:
    @classmethod
    def from_model_architecture(cls, architecture):
        if architecture != 'NewModel':
            raise NotImplementedError(architecture)
        class Upstream:
            model_arch = 8
        return Upstream
`);
  const config = path.join(f.root, 'config.json');
  fs.writeFileSync(config, '{"architectures":["NewModel"]}');
  const result = JSON.parse((await run('python3', [path.join(__dirname, 'hf-conversion-tools.py'), f.tools, 'probe', config])).output);
  assert.equal(result.supported, true); assert.equal(result.gguf_architecture, 'upstream_new_arch');
});
