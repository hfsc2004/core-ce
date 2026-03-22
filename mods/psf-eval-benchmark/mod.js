'use strict';

const fs = require('fs');
const path = require('path');

function safeMkdir(dir) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, payload) {
  safeMkdir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function writeText(filePath, text) {
  safeMkdir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(text || ''), 'utf8');
}

function installPayload(ctx = {}) {
  const storagePath = String(ctx.storagePath || '').trim();
  if (!storagePath) return null;

  const base = path.join(storagePath, 'eval-kit');
  safeMkdir(base);

  writeJson(path.join(base, 'benchmarks', 'local-benchmarks.json'), {
    schema_version: '1.0.0',
    updated_at: new Date().toISOString().slice(0, 10),
    notes: 'Offline local benchmark overrides for PSF Eval Benchmark mod.',
    models: {}
  });

  writeJson(path.join(base, 'tasks', 'core-v1.json'), {
    schema_version: '1.0.0',
    suite_id: 'core-v1',
    suite_version: '2.1',
    suites: {
      'core-lite-utility': [
        {
          id: 'lite-util-yesno-001',
          type: 'utility',
          description: 'Basic binary fact answer.',
          prompt: 'Answer YES or NO: Is water wet?',
          checker: { type: 'first_token_equals', expected: 'YES' }
        },
        {
          id: 'lite-util-sentiment-001',
          type: 'utility',
          description: 'Simple sentiment classification.',
          prompt: 'Classify sentiment with one word only: "I love this product."',
          checker: { type: 'first_token_equals', expected: 'positive' }
        },
        {
          id: 'lite-util-weekdays-001',
          type: 'utility',
          description: 'Simple world fact recall.',
          prompt: 'How many days are in one week? Output a number.',
          checker: { type: 'first_number_equals', expected: 7 }
        },
        {
          id: 'lite-util-capital-001',
          type: 'utility',
          description: 'One-token extraction.',
          prompt: 'One word only: Capital of France?',
          checker: { type: 'first_token_equals', expected: 'Paris' }
        }
      ],
      'core-lite-discipline': [
        {
          id: 'lite-token-blue-001',
          type: 'instruction',
          description: 'Single-token instruction following.',
          prompt: 'Reply with exactly one word: BLUE',
          checker: { type: 'one_token_equals', expected: 'BLUE' }
        },
        {
          id: 'lite-math-2plus2-001',
          type: 'reasoning-lite',
          description: 'Basic arithmetic.',
          prompt: 'What is 2 + 2? Output only the number.',
          checker: { type: 'numeric_equals', expected: 4 }
        },
        {
          id: 'lite-json-capital-001',
          type: 'format',
          description: 'Strict JSON output.',
          prompt: 'Output only JSON with one key \"capital\" for France.',
          checker: { type: 'json_only_key_equals', key: 'capital', expected: 'Paris', onlyKey: true }
        },
        {
          id: 'lite-extract-city-001',
          type: 'extraction',
          description: 'Single-field extraction.',
          prompt: 'Extract city only from: \"The capital of France is Paris.\"',
          checker: { type: 'one_token_equals', expected: 'Paris' }
        }
      ],
      'core-pro': [
        {
          id: 'pro-json-constraint-001',
          type: 'format-hard',
          description: 'Schema-constrained JSON with strict type.',
          prompt: 'Return only JSON: {\"sum\": 12}. No other keys. No prose.',
          checker: { type: 'json_only_key_equals', key: 'sum', expected: '12', onlyKey: true }
        },
        {
          id: 'pro-multi-constraint-001',
          type: 'instruction-hard',
          description: 'Multi-constraint obedience.',
          prompt: 'Output exactly 3 bullet lines, each 8-12 words, include \"factory\", exclude \"robot\".',
          checker: {
            type: 'bullet_constraints',
            count: 3,
            minWords: 8,
            maxWords: 12,
            mustContain: ['factory'],
            mustNotContain: ['robot']
          }
        },
        {
          id: 'pro-math-trap-001',
          type: 'reasoning-hard',
          description: 'Numeric extraction with distractors.',
          prompt: 'Ignore this 999. Compute (17 * 3) - (8 + 4). Output only the final number.',
          checker: { type: 'numeric_equals', expected: 39 }
        },
        {
          id: 'pro-extract-json-001',
          type: 'extraction-hard',
          description: 'Structured extraction and normalization.',
          prompt: 'Return only JSON with keys city and country from: \"Paris, France\".',
          checker: { type: 'json_keys_equal', pairs: { city: 'Paris', country: 'France' } }
        }
      ],
      'code-pro': [
        {
          id: 'code-def-signature-001',
          type: 'code',
          description: 'Function signature and return behavior.',
          prompt: 'Return only Python code implementing def add(a, b): that returns a + b.',
          checker: {
            type: 'contains_all',
            expected: ['def add', 'return a + b'],
            forbidden: ['Explanation:', 'This function', '```']
          }
        },
        {
          id: 'code-fix-bug-001',
          type: 'code',
          description: 'Small bugfix output discipline.',
          prompt: 'Fix this Python function and output only code: def is_even(n): return n % 2 == 1',
          checker: {
            type: 'contains_all',
            expected: ['def is_even', 'n % 2 == 0'],
            forbidden: ['Explanation:', '```']
          }
        }
      ]
    }
  });

  writeText(path.join(base, 'README.md'), [
    '# PSF Eval Benchmark (Mod Payload)',
    '',
    'This mod installs an offline evaluation kit into scoped mod storage.',
    '',
    'Contents:',
    '- benchmarks/local-benchmarks.json',
    '- tasks/core-v1.json',
    '',
    'Notes:',
    '- This mod intentionally avoids direct core mutation.',
    '- Run `node mods/psf-eval-benchmark/run-eval.js` to generate local benchmark metrics.',
    '- Core scripts may import this payload in future iterations.'
  ].join('\n'));

  return base;
}

function writeMarker(ctx = {}, name, payload = {}) {
  const storagePath = String(ctx.storagePath || '').trim();
  if (!storagePath) return;
  writeJson(path.join(storagePath, `${name}.json`), {
    event: name,
    ts: new Date().toISOString(),
    modId: ctx.modId || '',
    version: ctx.version || '',
    ...payload
  });
}

async function onInstall(ctx = {}) {
  const payloadPath = installPayload(ctx);
  writeMarker(ctx, 'install', { payloadPath: payloadPath || '' });
}

async function onEnable(ctx = {}) {
  const payloadPath = installPayload(ctx);
  writeMarker(ctx, 'enable', { payloadPath: payloadPath || '' });
}

async function onDisable(ctx = {}) {
  writeMarker(ctx, 'disable', {});
}

async function onUninstall(ctx = {}) {
  writeMarker(ctx, 'uninstall', {});
}

async function onHealthCheck() {
  return { ok: true, mod: 'com.psf.eval-benchmark' };
}

module.exports = {
  onInstall,
  onEnable,
  onDisable,
  onUninstall,
  onHealthCheck
};
