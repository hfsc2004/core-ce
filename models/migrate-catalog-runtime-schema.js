/**
 * ============================================================================
 * Catalog Runtime Schema Migration
 * ============================================================================
 *
 * Adds backward-compatible runtime metadata to model entries:
 * - artifacts[]
 * - runtimes[]
 * - accelerators[]
 * - profiles{}
 *
 * Existing fields are preserved to avoid breaking current UI/flows.
 *
 * Usage:
 *   node models/migrate-catalog-runtime-schema.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MASTER_PATH = path.join(ROOT, 'catalog-master.json');

function toLower(value) {
  return String(value || '').trim().toLowerCase();
}

function nonEmpty(value) {
  const text = String(value || '').trim();
  return text.length > 0 ? text : '';
}

function extractFilenameFromUrl(rawUrl = '') {
  const text = nonEmpty(rawUrl);
  if (!text) return '';
  try {
    const parsed = new URL(text);
    const last = decodeURIComponent(String(parsed.pathname || '').split('/').pop() || '');
    return last || '';
  } catch (_err) {
    return '';
  }
}

function detectFormat(filename = '', downloadUrl = '') {
  const base = toLower(filename || extractFilenameFromUrl(downloadUrl));
  if (!base) return 'unknown';
  if (base.endsWith('.gguf') || base.includes('.gguf.')) return 'gguf';
  if (base.endsWith('.safetensors')) return 'safetensors';
  if (base.endsWith('.onnx')) return 'onnx';
  if (base.endsWith('.bin')) return 'pytorch-bin';
  if (base.endsWith('.tflite')) return 'tflite';
  if (base.endsWith('.rknn')) return 'rknn';
  if (base.endsWith('.xml') || base.endsWith('.ir')) return 'openvino-ir';
  return 'unknown';
}

function deriveRuntimes(model, format, collectionKey) {
  const collection = toLower(collectionKey);
  const out = new Set(Array.isArray(model.runtimes) ? model.runtimes.map((v) => String(v)) : []);
  const isSpeech = collection.includes('speech') || collection.includes('text-to-speech');
  if (format === 'gguf') {
    out.add('ollama');
    out.add('llama.cpp');
  }
  if (format === 'safetensors' || isSpeech || model.supports_stt === true || model.supports_tts === true) {
    out.add('transformers');
  }
  if (format === 'onnx') out.add('onnxruntime');
  if (format === 'tflite') out.add('tflite');
  if (format === 'rknn') out.add('rkllm');
  if (format === 'openvino-ir') out.add('openvino');
  return Array.from(out);
}

function deriveAccelerators(runtimes = []) {
  const acc = new Set();
  for (const runtime of runtimes) {
    const r = toLower(runtime);
    if (r === 'ollama' || r === 'llama.cpp') {
      acc.add('cpu');
      acc.add('cuda');
      acc.add('rocm');
    } else if (r === 'transformers') {
      acc.add('cpu');
      acc.add('cuda');
      acc.add('rocm');
      acc.add('npu:intel');
    } else if (r === 'onnxruntime') {
      acc.add('cpu');
      acc.add('cuda');
      acc.add('npu:intel');
      acc.add('npu:qualcomm');
    } else if (r === 'openvino') {
      acc.add('cpu');
      acc.add('npu:intel');
    } else if (r === 'rkllm') {
      acc.add('cpu');
      acc.add('npu:rockchip');
    } else if (r === 'tflite') {
      acc.add('cpu');
      acc.add('tpu:edge');
    }
  }
  if (acc.size === 0) acc.add('cpu');
  return Array.from(acc);
}

function decideAvailability(sizeMb, tier) {
  const s = Number(sizeMb) || 0;
  if (s <= 0) return 'supported';
  if (tier === 'edge') {
    if (s <= 2048) return 'recommended';
    if (s <= 8192) return 'supported';
    return 'unsupported';
  }
  if (tier === 'pro') {
    if (s <= 8192) return 'recommended';
    if (s <= 32768) return 'supported';
    return 'unsupported';
  }
  if (tier === 'enterprise') {
    if (s <= 32768) return 'recommended';
    if (s <= 131072) return 'supported';
    return 'supported';
  }
  // datacenter
  if (s <= 32768) return 'supported';
  return 'recommended';
}

function buildProfiles(model) {
  const sizeMb = Number(model.size_mb || 0);
  const existing = (model.profiles && typeof model.profiles === 'object') ? model.profiles : {};
  const profile = {
    edge: {
      availability: decideAvailability(sizeMb, 'edge'),
      min_ram_gb: Number(model.min_ram_gb || 0) || null
    },
    pro: {
      availability: decideAvailability(sizeMb, 'pro'),
      min_ram_gb: Number(model.min_ram_gb || 0) || null
    },
    enterprise: {
      availability: decideAvailability(sizeMb, 'enterprise'),
      min_ram_gb: Number(model.min_ram_gb || 0) || null
    },
    datacenter: {
      availability: decideAvailability(sizeMb, 'datacenter'),
      min_ram_gb: Number(model.min_ram_gb || 0) || null
    }
  };
  return { ...profile, ...existing };
}

function buildPrimaryArtifact(model) {
  const downloadUrl = nonEmpty(model.download_url);
  const fallbackFilename = nonEmpty(model.filename) || extractFilenameFromUrl(downloadUrl);
  const format = detectFormat(fallbackFilename, downloadUrl);
  const checksums = (model.checksums && typeof model.checksums === 'object') ? model.checksums : null;
  const sha256 = nonEmpty(model.sha256) || nonEmpty(checksums?.main);
  return {
    id: 'primary',
    format,
    filename: fallbackFilename || null,
    download_url: downloadUrl || null,
    huggingface_repo: nonEmpty(model.huggingface_repo) || null,
    sha256: sha256 || null,
    checksums: checksums || null
  };
}

function migrateModel(model, collectionKey) {
  const next = { ...model };

  if (!Array.isArray(next.artifacts) || next.artifacts.length === 0) {
    next.artifacts = [buildPrimaryArtifact(next)];
  } else {
    next.artifacts = next.artifacts.map((artifact, idx) => ({
      id: nonEmpty(artifact.id) || `artifact-${idx + 1}`,
      format: nonEmpty(artifact.format) || detectFormat(artifact.filename, artifact.download_url),
      filename: nonEmpty(artifact.filename) || null,
      download_url: nonEmpty(artifact.download_url) || null,
      huggingface_repo: nonEmpty(artifact.huggingface_repo) || nonEmpty(next.huggingface_repo) || null,
      sha256: nonEmpty(artifact.sha256) || null,
      checksums: (artifact.checksums && typeof artifact.checksums === 'object') ? artifact.checksums : null
    }));
  }

  const primary = next.artifacts[0] || {};
  const format = nonEmpty(primary.format) || 'unknown';
  if (!Array.isArray(next.runtimes) || next.runtimes.length === 0) {
    next.runtimes = deriveRuntimes(next, format, collectionKey);
  } else {
    next.runtimes = Array.from(new Set(next.runtimes.map((v) => String(v).trim()).filter(Boolean)));
  }

  if (!Array.isArray(next.accelerators) || next.accelerators.length === 0) {
    next.accelerators = deriveAccelerators(next.runtimes);
  } else {
    next.accelerators = Array.from(new Set(next.accelerators.map((v) => String(v).trim()).filter(Boolean)));
  }

  next.profiles = buildProfiles(next);
  next.lifecycle = nonEmpty(next.lifecycle) || 'active';
  next.catalog_score = Number.isFinite(Number(next.catalog_score)) ? Number(next.catalog_score) : null;

  return next;
}

function migrateCatalog(catalog) {
  const next = JSON.parse(JSON.stringify(catalog));
  next.catalog_schema_version = '2.0.0-runtime-matrix';
  for (const [collectionKey, collection] of Object.entries(next.collections || {})) {
    if (!Array.isArray(collection.models)) continue;
    collection.models = collection.models.map((model) => migrateModel(model, collectionKey));
  }
  return next;
}

function main() {
  if (!fs.existsSync(MASTER_PATH)) {
    console.error('catalog-master.json not found.');
    process.exit(1);
  }
  const source = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
  const migrated = migrateCatalog(source);
  fs.writeFileSync(MASTER_PATH, JSON.stringify(migrated, null, 2) + '\n');
  console.log('Migrated catalog schema in models/catalog-master.json');
}

main();

