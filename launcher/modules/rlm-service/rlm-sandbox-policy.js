/**
 * RLM sandbox policy gate.
 *
 * This is a pre-execution boundary for model-authored REPL code. It is not a
 * security sandbox by itself; execution remains disabled until a real isolated
 * runner is added behind this validator.
 */

const DEFAULT_ALLOWED_HELPERS = [
  'len_prompt',
  'slice_prompt',
  'search_prompt',
  'chunk_prompt',
  'set_value',
  'get_value',
  'list_values',
  'set_final',
  'print',
  'range',
  'len',
  'str',
  'int',
  'float',
  'bool',
  'list',
  'dict',
  'set',
  'tuple',
  'enumerate',
  'min',
  'max',
  'sum',
  'sorted'
];

const BANNED_PATTERNS = [
  { id: 'import', pattern: /^\s*(import|from)\s+/m, message: 'Imports are disabled in RLM REPL code.' },
  { id: 'dunder', pattern: /__[\w]+__/m, message: 'Dunder access is disabled in RLM REPL code.' },
  { id: 'filesystem-open', pattern: /\bopen\s*\(/m, message: 'Filesystem access is disabled in RLM REPL code.' },
  { id: 'eval-exec', pattern: /\b(eval|exec|compile)\s*\(/m, message: 'Dynamic code execution is disabled in RLM REPL code.' },
  { id: 'introspection', pattern: /\b(globals|locals|vars|dir|getattr|setattr|delattr)\s*\(/m, message: 'Runtime introspection is disabled in RLM REPL code.' },
  { id: 'process', pattern: /\b(subprocess|system|popen|spawn|fork)\b/m, message: 'Process execution is disabled in RLM REPL code.' },
  { id: 'network', pattern: /\b(socket|requests|urllib|http\.client|ftplib|smtplib)\b/m, message: 'Network access is disabled in RLM REPL code.' },
  { id: 'environment', pattern: /\b(environ|os\.|sys\.|pathlib|shutil|tempfile)\b/m, message: 'Host environment access is disabled in RLM REPL code.' },
  { id: 'input', pattern: /\b(input|breakpoint)\s*\(/m, message: 'Interactive input is disabled in RLM REPL code.' }
];

function clampInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function normalizeSandboxPolicy(raw = {}, budget = {}) {
  const maxSourceChars = clampInt(raw.maxSourceChars, Math.min(20000, Number(budget.maxPromptSliceChars) || 12000), 256, 200000);
  const maxExecMs = clampInt(raw.maxExecMs, Number(budget.maxReplExecMs) || 5000, 250, 120000);
  const maxStdoutChars = clampInt(raw.maxStdoutChars, Number(budget.maxStdoutCharsPerIteration) || 4000, 256, 100000);
  const maxStderrChars = clampInt(raw.maxStderrChars, Number(budget.maxStderrCharsPerIteration) || 2000, 256, 50000);
  const maxMemoryBytes = clampInt(raw.maxMemoryBytes, 128 * 1024 * 1024, 16 * 1024 * 1024, 2 * 1024 * 1024 * 1024);
  const allowExecution = raw.allowExecution === true;
  const allowedHelpers = Array.isArray(raw.allowedHelpers)
    ? raw.allowedHelpers.map((item) => String(item || '').trim()).filter(Boolean)
    : DEFAULT_ALLOWED_HELPERS;

  return {
    language: 'python',
    allowExecution,
    maxSourceChars,
    maxExecMs,
    maxStdoutChars,
    maxStderrChars,
    maxMemoryBytes,
    allowedHelpers,
    blockedCapabilities: [
      'imports',
      'filesystem',
      'network',
      'subprocess',
      'host_environment',
      'dynamic_code_execution',
      'runtime_introspection',
      'interactive_input'
    ]
  };
}

function validatePythonSource(source = '', policy = {}) {
  const code = String(source || '');
  const normalized = normalizeSandboxPolicy(policy);
  const errors = [];

  if (!code.trim()) {
    errors.push({ id: 'empty', message: 'RLM REPL code is empty.' });
  }
  if (code.length > normalized.maxSourceChars) {
    errors.push({
      id: 'source-too-large',
      message: `RLM REPL code exceeds ${normalized.maxSourceChars} characters.`
    });
  }

  for (const rule of BANNED_PATTERNS) {
    if (rule.pattern.test(code)) {
      errors.push({ id: rule.id, message: rule.message });
    }
  }

  return {
    success: errors.length === 0,
    language: normalized.language,
    executable: normalized.allowExecution && errors.length === 0,
    executionDisabled: normalized.allowExecution !== true,
    errors,
    policy: normalized
  };
}

module.exports = {
  DEFAULT_ALLOWED_HELPERS,
  normalizeSandboxPolicy,
  validatePythonSource
};
