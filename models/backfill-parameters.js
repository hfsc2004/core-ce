/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = __dirname;
const masterPath = path.join(root, 'catalog-master.json');

const CURATED_PARAMETERS = {
  'whisper-tiny': '39M',
  'whisper-base': '74M',
  'whisper-small': '244M',
  'whisper-medium': '769M',
  'whisper-large-v3': '1.55B',
  'piper-tts': 'N/A',
  'bge-large': '335M',
  'e5-large-v2': '335M',
  'multilingual-e5-large': '560M',
  'moondream-2': '1.6B',
  'bark-small': 'N/A',
  'musicgen-small': 'N/A',
  'seamless-m4t-v2-large': '2.3B',
  'biogpt-large': '1.5B',
  'gpt2-Q4_K_M-GGUF': '124M',
  'microsoft-phi-4-mini-instruct-gguf': '3.8B',
  'kimi-k2-base-i1-gguf': '1T (MoE)'
};

function inferParametersLabel(model = {}) {
  const id = String(model.id || '').trim();
  if (id && CURATED_PARAMETERS[id]) {
    return CURATED_PARAMETERS[id];
  }

  const existing = String(model.parameters || '').trim();
  if (existing) return existing;

  const count = Number(model.parameter_count);
  if (Number.isFinite(count) && count > 0) {
    if (count >= 1e9) return (count % 1e9 === 0 ? String(count / 1e9) : (count / 1e9).toFixed(1)) + 'B';
    if (count >= 1e6) return Math.round(count / 1e6) + 'M';
  }

  const candidates = [model.name, model.id, model.filename, model.model_family, model.description];
  for (const c of candidates) {
    const text = String(c || '');
    if (!text) continue;
    const mb = text.match(/(\d+(?:\.\d+)?)\s*[bB](?:\b|[-_])/);
    if (mb) return mb[1] + 'B';
    const mm = text.match(/(\d+(?:\.\d+)?)\s*[mM](?:\b|[-_])/);
    if (mm) return mm[1] + 'M';
  }

  return '';
}

function main() {
  if (!fs.existsSync(masterPath)) {
    console.error('catalog-master.json not found:', masterPath);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
  let total = 0;
  let updated = 0;
  let populated = 0;

  for (const collection of Object.values(catalog.collections || {})) {
    for (const model of (collection.models || [])) {
      total += 1;
      const inferred = inferParametersLabel(model);
      if (inferred && String(model.parameters || '').trim() !== inferred) {
        model.parameters = inferred;
        updated += 1;
      }
      if (String(model.parameters || '').trim()) populated += 1;
    }
  }

  fs.writeFileSync(masterPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  console.log(`Backfill complete: ${updated} updated / ${total} models`);
  console.log(`Coverage: ${populated}/${total} models have parameters`);
}

main();
