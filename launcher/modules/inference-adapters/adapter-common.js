/**
 * PSF Inference Adapters - Common interface and registry (stub)
 *
 * @module adapter-common
 * @version 1.1.2 - March 5, 2026
 */

const adapters = {
  'llama-cpp': () => require('./adapter-llamacpp'),
  'vllm': () => require('./adapter-vllm'),
  'exllama2': () => require('./adapter-exllama'),
  'ollama': () => require('./adapter-ollama')
};

function normalize(name) {
  const k = String(name || '').trim().toLowerCase();
  if (k === 'llamacpp') return 'llama-cpp';
  return Object.prototype.hasOwnProperty.call(adapters, k) ? k : 'ollama';
}

function getAdapter(name) {
  const key = normalize(name);
  return adapters[key]();
}

function listAdapters() {
  return Object.keys(adapters);
}

module.exports = {
  normalize,
  getAdapter,
  listAdapters
};
