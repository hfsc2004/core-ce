/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');

function deriveModelNameFromFilename(filename) {
  return String(filename || '')
    .replace(/\.gguf$/i, '')
    .trim()
    .toLowerCase();
}

function canonicalizeModelKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/:latest$/i, '');
}

function isQwenChatModel(modelName) {
  const n = String(modelName || '').toLowerCase();
  if (!n.includes('qwen')) return false;
  if (/embed|embedding|rerank|colbert|bge-m3|e5-|nomic-embed|text-embedding|asr|audio/.test(n)) {
    return false;
  }
  return true;
}

function buildQwenChatModelfile(mainDigest, forceCpu = false) {
  const lines = [
    `FROM @${mainDigest}`,
    'SYSTEM """You are a helpful assistant. Answer only the user\'s latest message. Do not invent follow-up user questions. Do not continue as a multi-turn transcript."""',
    'TEMPLATE """{{- if .System }}<|im_start|>system',
    '{{ .System }}<|im_end|>',
    '{{ end }}{{- range .Messages }}<|im_start|>{{ .Role }}',
    '{{ .Content }}<|im_end|>',
    '{{ end }}<|im_start|>assistant',
    '"""',
    'PARAMETER stop "<|im_start|>"',
    'PARAMETER stop "<|im_end|>"',
    'PARAMETER stop "<|endoftext|>"',
    'PARAMETER stop "\\nUSER"',
    'PARAMETER stop "\\nASSISTANT"',
    'PARAMETER stop "USER:"',
    'PARAMETER stop "ASSISTANT:"'
  ];
  if (forceCpu) lines.push('PARAMETER num_gpu 0');
  return lines.join('\n');
}

function hasQwenChatTemplate(showPayload) {
  const template = String(showPayload?.template || '').trim();
  const modelfile = String(showPayload?.modelfile || '').trim();
  if (!template && !modelfile) return false;
  return (
    /<\|im_start\|>/.test(template) ||
    /\{\{\s*\.Messages\s*\}\}/.test(template) ||
    /\{\{\s*\.System\s*\}\}/.test(template) ||
    /TEMPLATE[\s\S]*<\|im_start\|>/i.test(modelfile)
  );
}

function getLocalManifestPath(appPath, modelName, tag = 'latest') {
  const root = path.join(appPath, '..', 'models', 'manifests', 'registry.ollama.ai', 'library');
  const name = String(modelName || '').trim().toLowerCase();
  if (!name) return null;
  return path.join(root, name, tag);
}

function readLocalManifest(appPath, modelName, tag = 'latest') {
  try {
    const manifestPath = getLocalManifestPath(appPath, modelName, tag);
    if (!manifestPath || !fs.existsSync(manifestPath)) return null;
    const raw = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasQwenTemplateInLocalManifest(appPath, modelName, tag = 'latest') {
  const manifest = readLocalManifest(appPath, modelName, tag);
  const layers = Array.isArray(manifest?.layers) ? manifest.layers : [];
  return layers.some((layer) => String(layer?.mediaType || '').toLowerCase() === 'application/vnd.ollama.image.template');
}

function shouldRepairQwenTemplate(showPayload, appPath, modelName) {
  if (hasQwenTemplateInLocalManifest(appPath, modelName)) return false;
  if (!showPayload) return false;
  return !hasQwenChatTemplate(showPayload);
}

function removeLocalManifestTag(appPath, modelName, tag = 'latest') {
  try {
    const root = path.join(appPath, '..', 'models', 'manifests', 'registry.ollama.ai', 'library');
    const name = String(modelName || '').trim().toLowerCase();
    if (!name) return false;
    const tagPath = path.join(root, name, tag);
    if (!fs.existsSync(tagPath)) return false;
    fs.unlinkSync(tagPath);
    const dirPath = path.dirname(tagPath);
    const remaining = fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : [];
    if (remaining.length === 0) fs.rmdirSync(dirPath);
    console.log(`[Ollama Common] 🧹 Removed stale manifest tag for repair: ${name}:${tag}`);
    return true;
  } catch (err) {
    console.warn('[Ollama Common] Manifest cleanup before repair failed:', err.message);
    return false;
  }
}

module.exports = {
  deriveModelNameFromFilename,
  canonicalizeModelKey,
  isQwenChatModel,
  buildQwenChatModelfile,
  hasQwenChatTemplate,
  shouldRepairQwenTemplate,
  removeLocalManifestTag
};
