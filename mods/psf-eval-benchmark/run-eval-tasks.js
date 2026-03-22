'use strict';

function defaultTasks() {
  return {
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
          prompt: 'Output only JSON with one key "capital" for France.',
          checker: { type: 'json_only_key_equals', key: 'capital', expected: 'Paris', onlyKey: true }
        },
        {
          id: 'lite-extract-city-001',
          type: 'extraction',
          description: 'Single-field extraction.',
          prompt: 'Extract city only from: "The capital of France is Paris."',
          checker: { type: 'one_token_equals', expected: 'Paris' }
        }
      ],
      'core-pro': [
        {
          id: 'pro-json-constraint-001',
          type: 'format-hard',
          description: 'Schema-constrained JSON with strict type.',
          prompt: 'Return only JSON: {"sum": 12}. No other keys. No prose.',
          checker: { type: 'json_only_key_equals', key: 'sum', expected: '12', onlyKey: true }
        },
        {
          id: 'pro-multi-constraint-001',
          type: 'instruction-hard',
          description: 'Multi-constraint obedience.',
          prompt: 'Output exactly 3 bullet lines, each 8-12 words, include "factory", exclude "robot".',
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
          prompt: 'Return only JSON with keys city and country from: "Paris, France".',
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
  };
}

function isValidTask(task = {}) {
  const prompt = String(task.prompt || '').trim();
  const checker = task.checker && typeof task.checker === 'object' ? task.checker : null;
  const checkerType = String(checker?.type || '').trim();
  return !!prompt && !!checker && !!checkerType;
}

function shouldMigrateTasks(tasksDoc = {}, tasks = []) {
  const version = Number(tasksDoc?.suite_version || 1);
  if (!Number.isFinite(version) || version < 2.1) return true;
  const suites = tasksDoc?.suites;
  if (!suites || typeof suites !== 'object') return true;
  if (!Array.isArray(suites['core-lite-utility']) || !Array.isArray(suites['core-lite-discipline']) || !Array.isArray(suites['core-pro'])) return true;
  if (!Array.isArray(tasks) || tasks.length === 0) return true;
  return false;
}

function runChecker(checker = {}, output = '') {
  const t = String(checker.type || '').toLowerCase();
  const expected = String(checker.expected || '');
  const out = String(output || '').trim();
  if (t === 'exact') return out === expected;
  if (t === 'one_token_equals') {
    const normalized = out.replace(/[`"'.,;:!?()[\]{}<>]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return normalized.length === 1 && normalized[0].toLowerCase() === expected.toLowerCase();
  }
  if (t === 'first_token_equals') {
    const normalized = out.replace(/[`"'.,;:!?()[\]{}<>]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return normalized.length > 0 && normalized[0].toLowerCase() === expected.toLowerCase();
  }
  if (t === 'contains') return out.toLowerCase().includes(expected.toLowerCase());
  if (t === 'contains_all') {
    const expectedList = Array.isArray(checker.expected) ? checker.expected : [];
    const forbiddenList = Array.isArray(checker.forbidden) ? checker.forbidden : [];
    const lower = out.toLowerCase();
    const hasAll = expectedList.every((item) => lower.includes(String(item || '').toLowerCase()));
    const hasForbidden = forbiddenList.some((item) => lower.includes(String(item || '').toLowerCase()));
    return hasAll && !hasForbidden;
  }
  if (t === 'regex') {
    const pattern = String(checker.pattern || '').trim();
    if (!pattern) return false;
    try {
      const flags = String(checker.flags || '');
      const re = new RegExp(pattern, flags);
      return re.test(out);
    } catch (_err) {
      return false;
    }
  }
  if (t === 'numeric_equals' || t === 'first_number_equals') {
    const match = out.match(/-?\d+(\.\d+)?/);
    if (!match) return false;
    const got = Number(match[0]);
    const want = Number(checker.expected);
    return Number.isFinite(got) && Number.isFinite(want) && got === want;
  }
  if (t === 'json_key_equals') {
    try {
      const parsed = JSON.parse(out);
      const key = String(checker.key || '');
      const value = parsed && typeof parsed === 'object' ? parsed[key] : undefined;
      return String(value || '').trim().toLowerCase() === expected.toLowerCase();
    } catch (_err) {
      return false;
    }
  }
  if (t === 'json_only_key_equals') {
    if (!out || out.startsWith('```') || !out.startsWith('{') || !out.endsWith('}')) return false;
    try {
      const parsed = JSON.parse(out);
      const key = String(checker.key || '');
      if (!Object.prototype.hasOwnProperty.call(parsed, key)) return false;
      const got = String(parsed[key]).trim().toLowerCase();
      const want = String(checker.expected || '').trim().toLowerCase();
      if (got !== want) return false;
      if (checker.onlyKey === true) {
        const keys = Object.keys(parsed);
        return keys.length === 1 && keys[0] === key;
      }
      return true;
    } catch (_err) {
      return false;
    }
  }
  if (t === 'json_keys_equal') {
    try {
      if (!out || out.startsWith('```')) return false;
      const parsed = JSON.parse(out);
      const pairs = checker.pairs && typeof checker.pairs === 'object' ? checker.pairs : {};
      return Object.entries(pairs).every(([k, v]) => String(parsed?.[k] ?? '').trim().toLowerCase() === String(v).trim().toLowerCase());
    } catch (_err) {
      return false;
    }
  }
  if (t === 'bullet_constraints') {
    const lines = out.split('\n').map((line) => line.trim()).filter(Boolean);
    const bullets = lines.filter((line) => /^[-*]\s+/.test(line));
    const count = Number(checker.count || 0);
    if (!count || bullets.length !== count) return false;
    const minWords = Number(checker.minWords || 0);
    const maxWords = Number(checker.maxWords || 999);
    const mustContain = (Array.isArray(checker.mustContain) ? checker.mustContain : []).map((v) => String(v).toLowerCase());
    const mustNotContain = (Array.isArray(checker.mustNotContain) ? checker.mustNotContain : []).map((v) => String(v).toLowerCase());
    for (const line of bullets) {
      const text = line.replace(/^[-*]\s+/, '').trim();
      const words = text.split(/\s+/).filter(Boolean).length;
      if (words < minWords || words > maxWords) return false;
      const lower = text.toLowerCase();
      if (!mustContain.every((token) => lower.includes(token))) return false;
      if (mustNotContain.some((token) => lower.includes(token))) return false;
    }
    return true;
  }
  return false;
}

module.exports = {
  defaultTasks,
  isValidTask,
  shouldMigrateTasks,
  runChecker
};
