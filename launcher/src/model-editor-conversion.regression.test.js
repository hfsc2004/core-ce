'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function editor(scanResult) {
  const elements = new Map(), calls = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', hidden: id !== 'hf-conversion-panel', checked: false, required: id === 'model-download-url', children: [], events: {},
      addEventListener(name, handler) { this.events[name] = handler; },
      replaceChildren() { this.children = []; },
      appendChild(option) { this.children.push(option); if (option.selected || !this.value) this.value = option.value; },
      dispatchEvent() {}, reportValidity() { return true; },
      click() { return this.events.click?.(); }
    });
    return elements.get(id);
  }
  const api = {
    scanHfConversion: async input => { calls.push(['scan', input]); return scanResult; },
    prepareHfConversion: async input => { calls.push(['prepare', input]); return { success: true, preferred: ['Q8_0', 'Q5_K_M'], choices: ['Q8_0', 'Q5_K_M', 'IQ4_XS'], recommended: 'Q5_K_M' }; },
    finishHfConversion: async input => { calls.push(['finish', input]); return { success: true, message: 'Registered' }; },
    cancelHfConversion: async input => { calls.push(['cancel', input]); return { success: true }; },
    updateHfConversionTools: async () => { calls.push(['update']); return { success: true, message: 'Updated' }; },
    refreshPackageManager: () => calls.push(['refresh']), closeModelEditor: () => calls.push(['close']), onHfConversionProgress() {}
  };
  const window = { electronAPI: api, confirm: () => true,
    ModelEditorRendererHelpers: { buildModelData: () => ({ ok: true, modelData: { license: 'apache-2.0' } }) },
    ModelEditorUtils: { inferParametersLabel: () => '2.9B' } };
  const context = { window, document: { getElementById: element, createElement: () => ({}) }, Event: class {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'model-editor-conversion.js'), 'utf8'), context);
  element('model-url').value = 'https://huggingface.co/org/source';
  element('hf-conversion-revision').value = 'main';
  element('model-collection').value = 'core';
  return { window, api, element, calls };
}

test('supported scan offers conversion without starting downloads or tool updates', async () => {
  const e = editor({ success: true, mode: 'convert', sessionId: 'session', repo: 'org/source', revision: 'commit', architecture: 'UpstreamArch', sizeBytes: 1024 });
  await e.window.ModelEditorConversion.scan();
  assert.equal(e.element('hf-conversion-offer').hidden, false);
  assert.equal(e.window.ModelEditorConversion.active(), true);
  assert.equal(e.element('btn-submit').disabled, true);
  assert.equal(e.element('hf-conversion-keep').checked, false);
  assert.deepEqual(e.calls.map(c => c[0]), ['scan']);
});
test('conversion scan passes the existing Base Model URL without a separate field', async () => {
  const e = editor({ success: true, mode: 'convert', sessionId: 'session' });
  e.element('model-base-url').value = 'https://huggingface.co/BlinkDL/rwkv7-g1';
  await e.window.ModelEditorConversion.scan();
  assert.equal(e.calls[0][1].baseModelUrl, 'https://huggingface.co/BlinkDL/rwkv7-g1');
});
test('architecture fetch falls back to Model Page URL when base config is missing', async () => {
  const e = editor({}); const requests = [], status = [];
  e.element('model-base-url').value = 'https://huggingface.co/BlinkDL/rwkv7-g1';
  e.window.ModelEditorUtils = { showStatus: (...args) => status.push(args) };
  e.api.fetchHuggingFaceConfig = async url => {
    requests.push(url);
    return requests.length === 1 ? { success: false, notFound: true } : { success: true, config: { model_type: 'rwkv7', hidden_size: 2560, num_hidden_layers: 32 } };
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'model-editor-renderer.js'), 'utf8'), { window: e.window,
    document: { getElementById: e.element }, console: { log() {}, error() {} } });
  await e.element('btn-fetch-arch').click();
  assert.deepEqual(requests, ['https://huggingface.co/BlinkDL/rwkv7-g1', 'https://huggingface.co/org/source']);
  assert.equal(e.element('model-architecture').value, 'rwkv7');
  assert.equal(e.element('model-hidden-size').value, 2560);
  assert.match(status.at(-1)[2], /from Model Page URL/);
});
test('editor offers installed quantization choices only after full-precision conversion, then registers', async () => {
  const e = editor({ success: true, mode: 'convert', sessionId: 'session', repo: 'org/source', revision: 'commit', architecture: 'UpstreamArch', sizeBytes: 1024 });
  await e.window.ModelEditorConversion.scan();
  await e.element('hf-conversion-prepare').click();
  assert.equal(e.element('hf-conversion-quantization').hidden, false);
  assert.equal(e.element('hf-conversion-offer').hidden, true);
  assert.deepEqual(e.element('hf-conversion-choice').children.map(o => o.value), ['Q8_0', 'Q5_K_M', 'IQ4_XS']);
  assert.equal(e.element('hf-conversion-choice').value, 'Q5_K_M');
  assert.equal(e.calls.find(c => c[0] === 'prepare')[1].keepSource, false);
  await e.element('hf-conversion-finish').click();
  assert.equal(e.calls.find(c => c[0] === 'finish')[1].quantization, 'Q5_K_M');
  assert.equal(e.calls.find(c => c[0] === 'finish')[1].collectionId, 'core');
  assert.equal(e.element('model-download-url').required, true);
  assert.deepEqual(e.calls.map(c => c[0]), ['scan', 'prepare', 'finish', 'refresh', 'close']);
});
test('GGUF scan fills the normal download fields and never starts local conversion', async () => {
  const e = editor({ success: true, mode: 'download', files: [{ filename: 'nested/model-Q8_0.gguf', download_url: 'https://huggingface.co/org/model/resolve/commit/nested/model-Q8_0.gguf', sha256: 'hash' }] });
  await e.window.ModelEditorConversion.scan();
  await e.element('hf-existing-gguf-use').click();
  assert.equal(e.element('model-filename').value, 'model-Q8_0.gguf');
  assert.match(e.element('model-download-url').value, /resolve\/commit/);
  assert.equal(e.window.ModelEditorConversion.active(), false);
  assert.deepEqual(e.calls.map(c => c[0]), ['scan']);
});
test('unsupported converter message is shown and normal save remains available', async () => {
  const message = 'This model cannot currently be converted by the installed llama.cpp version.';
  const e = editor({ success: false, unsupported: true, error: message });
  await e.window.ModelEditorConversion.scan();
  assert.equal(e.element('hf-conversion-status').textContent, message);
  assert.equal(e.element('btn-submit').disabled, false);
  assert.deepEqual(e.calls.map(c => c[0]), ['scan']);
});
