/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
function canonicalizeModelName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const AUDIO_MODEL_KEYWORDS = [
  'whisper',
  'stt',
  'asr',
  'tts',
  'speech',
  'audio',
  'diar',
  'transcrib',
  'pyannote',
  'bark',
  'xtts',
  'f5-tts',
  'dia-1.6b',
  'dia16b'
];

function isSpeechOrAudioModelName(value) {
  const n = String(value || '').toLowerCase();
  if (!n) return false;
  return AUDIO_MODEL_KEYWORDS.some((token) => n.includes(token));
}

function isCodingCatalogModel(model = {}) {
  const supportsCode = model?.supports_code === true || model?.supportsCode === true;
  if (supportsCode) return true;
  const identity = [
    model?.id,
    model?.name,
    model?.filename,
    model?.model_family,
    model?.organization
  ].map((v) => String(v || '')).join(' ').toLowerCase();
  if (isSpeechOrAudioModelName(identity)) return false;
  return true;
}

function normalizeModelAlias(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/:latest$/i, '')
    .replace(/-latest$/i, '');
}

function isModelNameEquivalent(a, b) {
  const an = normalizeModelAlias(a);
  const bn = normalizeModelAlias(b);
  if (!an || !bn) return false;
  if (an === bn) return true;
  const ac = canonicalizeModelName(an);
  const bc = canonicalizeModelName(bn);
  return !!ac && !!bc && ac === bc;
}

function isModelNameMatch(a, b) {
  const an = String(a || '').toLowerCase().trim();
  const bn = String(b || '').toLowerCase().trim();
  if (!an || !bn) return false;
  if (an === bn || an.includes(bn) || bn.includes(an)) return true;
  const ac = canonicalizeModelName(an);
  const bc = canonicalizeModelName(bn);
  return !!ac && !!bc && (ac === bc || ac.includes(bc) || bc.includes(ac));
}

function normalizePathForCompare(p) {
  return String(p || '')
    .trim()
    .replace(/\\/g, '/')
    .toLowerCase();
}

function listLocalGgufModels({ appDir, fs, path, localCollectionKey, selectedAbsPath = '' }) {
  const root = path.join(appDir, '..', 'models');
  const selectedNorm = normalizePathForCompare(selectedAbsPath);
  const out = [];
  const skipTop = new Set(['blobs', 'manifests']);

  function walk(dir, depth = 0) {
    if (depth > 6) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth === 0 && skipTop.has(e.name.toLowerCase())) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      if (!/\.gguf$/i.test(e.name)) continue;
      if (isSpeechOrAudioModelName(e.name)) continue;
      const relFromProject = path.relative(path.join(appDir, '..'), full).replace(/\\/g, '/');
      const modelName = e.name.replace(/\.gguf$/i, '');
      const normAbs = normalizePathForCompare(full);
      out.push({
        collectionKey: localCollectionKey,
        collectionName: 'Local GGUF',
        modelId: encodeURIComponent(relFromProject),
        displayName: `${modelName} (${relFromProject})`,
        filename: e.name,
        modelPathRel: relFromProject,
        actualModelPathRel: relFromProject,
        projectorFilename: '',
        projectorPathRel: null,
        supportsVision: false,
        forceCpu: false,
        downloaded: true,
        wrapped: false,
        ollamaName: '',
        selected: !!selectedNorm && normAbs === selectedNorm
      });
    }
  }

  if (fs.existsSync(root)) {
    walk(root, 0);
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}

function resolveConfiguredModel(configuredModel, modelNames) {
  if (!configuredModel || !Array.isArray(modelNames) || modelNames.length === 0) {
    return null;
  }

  const norm = (s) => String(s).toLowerCase().trim();
  const configured = norm(configuredModel);
  const aliases = new Set([
    configured,
    configured.replace(/-([0-9]+b)$/i, ':$1'),
    configured.replace(/:([0-9]+b)$/i, '-$1'),
    configured.replace(/:latest$/i, ''),
    configured.replace(/-latest$/i, ''),
    configured.replace(/:/g, '-')
  ]);

  const scored = [];
  for (const model of modelNames) {
    const m = norm(model);
    let score = 0;
    if (aliases.has(m)) score += 1000;

    for (const alias of aliases) {
      if (!alias) continue;
      if (m.startsWith(alias)) score += 200;
      if (m.includes(alias)) score += 100;
      const canonicalAlias = canonicalizeModelName(alias);
      const canonicalModel = canonicalizeModelName(m);
      if (canonicalAlias && canonicalModel) {
        if (canonicalModel === canonicalAlias) score += 220;
        if (canonicalModel.startsWith(canonicalAlias)) score += 180;
        if (canonicalModel.includes(canonicalAlias)) score += 140;
      }
    }

    if (m.includes('instruct')) score += 300;
    if (configured.includes('7b') && m.includes('7b')) score += 120;
    if (configured.includes('14b') && m.includes('14b')) score += 120;
    if (configured.includes('32b') && m.includes('32b')) score += 120;
    score -= Math.min(m.length, 80) * 0.01;
    if (score > 0) scored.push({ model, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].model;
}

function normalizeRouterMode(cfg = {}) {
  const mode = String(cfg?.routerMode || '').trim().toLowerCase();
  if (mode === 'on' || mode === 'off') return mode;
  return cfg?.routerEnabled ? 'on' : 'off';
}

function extractExplicitReplacements(text) {
  const input = String(text || '');
  if (!input) return [];
  const out = [];
  const reQuoted = /replace\s+("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)\s+with\s+("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/gi;
  const reBare = /replace\s+([^\s,;]+)\s+with\s+([^\s,;]+)/gi;
  let match;
  while ((match = reQuoted.exec(input)) !== null) {
    const oldValue = cleanReplacementToken(match[1]);
    const newValue = cleanReplacementToken(match[5]);
    if (!oldValue || !newValue) continue;
    out.push({ oldValue, newValue });
    if (out.length >= 8) break;
  }
  while (out.length < 8 && (match = reBare.exec(input)) !== null) {
    const oldValue = cleanReplacementToken(match[1]);
    const newValue = cleanReplacementToken(match[2]);
    if (!oldValue || !newValue) continue;
    const exists = out.some((p) => p.oldValue === oldValue && p.newValue === newValue);
    if (exists) continue;
    out.push({ oldValue, newValue });
    if (out.length >= 8) break;
  }
  return out;
}

function cleanReplacementToken(value) {
  let v = String(value || '').trim();
  const q = v.charAt(0);
  if ((q === '"' || q === "'" || q === '`') && v.length >= 2 && v.endsWith(q)) {
    v = v.slice(1, -1).trim();
  }
  v = v.replace(/[.;:,]+$/g, '').trim();
  if (!v) return '';
  if (v.length > 180) return '';
  return v;
}

function isOverGenericRewrite(rewrite) {
  const text = String(rewrite || '').toLowerCase();
  if (!text) return true;
  const genericPhrases = [
    'to satisfy the request',
    'implement the requested changes',
    'do not change anything else',
    'keep existing behavior unchanged',
    'preserve existing behavior'
  ];
  const genericHits = genericPhrases.reduce((acc, phrase) => acc + (text.includes(phrase) ? 1 : 0), 0);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return genericHits >= 2 && wordCount < 28;
}

function parseDispatcherDecision(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch {}
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return {
      targetModel: '',
      reason: 'translator-raw-text',
      rewrittenMessage: raw,
      taskMode: '',
      strictOutput: '',
      intentClass: '',
      executionStrategy: '',
      parseMode: 'raw-text'
    };
  }
  const targetModel = String(parsed.targetModel || parsed.model || '').trim();
  const reason = String(parsed.reason || parsed.rationale || '').trim();
  const rewrittenMessage = String(
    parsed.rewrittenMessage ||
    parsed.rewrite ||
    parsed.rewritten ||
    parsed.rewritten_message ||
    parsed.message ||
    parsed.contract ||
    ''
  ).trim();
  const taskMode = String(parsed.taskMode || parsed.mode || parsed.task || '').trim().toLowerCase();
  const strictOutput = String(parsed.strictOutput || parsed.outputFormat || parsed.output || parsed.format || '').trim().toLowerCase();
  const intentClass = String(
    parsed.intentClass ||
    parsed.intent ||
    parsed.queryType ||
    parsed.requestType ||
    ''
  ).trim().toLowerCase();
  const executionStrategy = String(
    parsed.executionStrategy ||
    parsed.strategy ||
    parsed.responseStrategy ||
    ''
  ).trim().toLowerCase();
  if (!targetModel && !rewrittenMessage && !reason) {
    return {
      targetModel: '',
      reason: 'translator-empty-json',
      rewrittenMessage: raw,
      taskMode: '',
      strictOutput: '',
      intentClass: '',
      executionStrategy: '',
      parseMode: 'json-empty'
    };
  }
  return {
    targetModel,
    reason,
    rewrittenMessage,
    taskMode,
    strictOutput,
    intentClass,
    executionStrategy,
    parseMode: 'json'
  };
}

function validateRouterContract({ parsed, originalMessage, hasExactFileContext, groundedAnalysisMode, enforceSchema = false }) {
  const rewrite = String(parsed?.rewrittenMessage || '').trim();
  if (!rewrite) return { ok: false, reason: 'empty-rewrite' };
  const userText = String(originalMessage || '').trim();
  const userLc = userText.toLowerCase();
  const rewriteLc = rewrite.toLowerCase();

  const mentionedFiles = Array.from(
    new Set(
      (userText.match(/\b[\w./-]+\.[a-z0-9]+\b/gi) || [])
        .map((s) => String(s).trim().toLowerCase())
    )
  );
  const wantsFullFile = /(full corrected|full file|complete corrected|return full|reprint.*file|corrected .* only)/i.test(userText);
  const wantsUnifiedDiff = /(unified diff|diff patch|return .*diff|output .*diff|patch only|return only .*patch)/i.test(userText);
  const rewriteDemandsDiff = /unified diff|diff patch|return only a.*diff|provided target file/.test(rewriteLc);
  const explicitReplacements = extractExplicitReplacements(userText);
  if (enforceSchema) {
    const taskMode = String(parsed?.taskMode || '').trim().toLowerCase();
    const strictOutput = String(parsed?.strictOutput || '').trim().toLowerCase();
    const intentClass = String(parsed?.intentClass || '').trim().toLowerCase();
    const executionStrategy = String(parsed?.executionStrategy || '').trim().toLowerCase();
    const validTaskMode = new Set(['inspect', 'edit', 'generate']);
    const validOutput = new Set(['none', 'exact_token_path', 'unified_diff', 'full_file']);
    const validIntentClass = new Set([
      'question',
      'debug',
      'edit_existing',
      'build_small_program',
      'build_large_program',
      'explain',
      'chat'
    ]);
    const validExecutionStrategy = new Set([
      'direct_answer',
      'inspect_then_fix',
      'single_pass_code',
      'phased_plan_then_code',
      'chat_reply'
    ]);
    if (!taskMode || !validTaskMode.has(taskMode)) {
      return { ok: false, reason: 'missing-or-invalid-taskMode' };
    }
    if (!strictOutput || !validOutput.has(strictOutput)) {
      return { ok: false, reason: 'missing-or-invalid-strictOutput' };
    }
    if (!intentClass || !validIntentClass.has(intentClass)) {
      return { ok: false, reason: 'missing-or-invalid-intentClass' };
    }
    if (!executionStrategy || !validExecutionStrategy.has(executionStrategy)) {
      return { ok: false, reason: 'missing-or-invalid-executionStrategy' };
    }
    if (wantsFullFile && strictOutput !== 'full_file') {
      return { ok: false, reason: 'full-file-request-misclassified' };
    }
    if (wantsUnifiedDiff && strictOutput !== 'unified_diff') {
      return { ok: false, reason: 'unified-diff-request-misclassified' };
    }
    if (intentClass === 'question' && taskMode !== 'inspect') {
      return { ok: false, reason: 'question-must-be-inspect' };
    }
    if (intentClass === 'build_large_program') {
      if (taskMode !== 'generate') return { ok: false, reason: 'large-program-must-generate' };
      if (strictOutput !== 'full_file') return { ok: false, reason: 'large-program-must-full-file' };
      if (executionStrategy !== 'phased_plan_then_code') return { ok: false, reason: 'large-program-must-phase' };
      if (!/\b(phase|step|milestone|component)\b/i.test(rewrite)) {
        return { ok: false, reason: 'large-program-missing-phased-contract' };
      }
    }
    if (intentClass === 'debug' && executionStrategy === 'single_pass_code') {
      return { ok: false, reason: 'debug-should-not-single-pass-code' };
    }
  }
  if (mentionedFiles.length > 0) {
    const rewriteHasMention = mentionedFiles.some((f) => rewriteLc.includes(f));
    const targetFileReference = /provided target file|target file|attached file|exact file context/.test(rewriteLc);
    const acceptableImplicitReference = !!hasExactFileContext && targetFileReference;
    if (!rewriteHasMention && !acceptableImplicitReference) {
      return { ok: false, reason: 'missing-mentioned-file-in-rewrite' };
    }
  }
  if (explicitReplacements.length > 0) {
    for (const pair of explicitReplacements) {
      if (!pair.oldValue || !pair.newValue) continue;
      const hasOld = rewriteLc.includes(pair.oldValue.toLowerCase());
      const hasNew = rewriteLc.includes(pair.newValue.toLowerCase());
      if (!hasOld || !hasNew) {
        return { ok: false, reason: 'missing-replacement-pair-in-rewrite' };
      }
    }
  }
  if (!userText) return { ok: true, reason: '' };

  const explicitEditRequest = /(fix|modify|correct|rewrite|update|patch|refactor|edit)\b/.test(userLc);
  const createRequest = /(write|create|build|generate|make)\b/.test(userLc);
  const wantsHtmlCssJs = /\bhtml\b/.test(userLc) && /\bcss\b/.test(userLc) && /\bjs\b|\bjavascript\b/.test(userLc);

  if (!hasExactFileContext && !groundedAnalysisMode && createRequest && wantsHtmlCssJs && !explicitEditRequest && rewriteDemandsDiff) {
    return { ok: false, reason: 'generate-request-misclassified-as-diff' };
  }
  if (/cache refresh race condition/i.test(rewrite) && !/cache|race condition/i.test(userText)) {
    return { ok: false, reason: 'semantic-drift-example-bleed' };
  }
  if (isOverGenericRewrite(rewrite) && explicitReplacements.length === 0 && mentionedFiles.length === 0) {
    return { ok: false, reason: 'over-generic-rewrite' };
  }

  const tokenize = (t) => String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9_.\-/\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const stop = new Set(['the', 'and', 'for', 'with', 'only', 'this', 'that', 'into', 'from', 'your', 'return', 'file', 'files', 'check', 'against', 'project', 'provided', 'target']);
  const uTokens = tokenize(userText).filter((x) => x.length >= 4 && !stop.has(x));
  const rSet = new Set(tokenize(rewrite));
  const overlap = uTokens.filter((x) => rSet.has(x)).length;
  const overlapRatio = uTokens.length > 0 ? overlap / uTokens.length : 1;
  if (uTokens.length >= 4 && overlapRatio < 0.15) {
    return { ok: false, reason: 'semantic-drift-low-overlap' };
  }
  return { ok: true, reason: '' };
}

function coerceRouterDecisionForUserIntent(parsed, originalMessage) {
  const out = parsed && typeof parsed === 'object' ? { ...parsed } : {};
  const userText = String(originalMessage || '').trim();
  if (!userText) return out;
  const userLc = userText.toLowerCase();

  const hasLargeProgramIntent = /(write|create|build|implement|develop).*(game|platform|application|app|system|engine|service|site)/i.test(userText)
    || /from scratch|entire program|full program|complete app|complete program/i.test(userText);
  const hasQuestionIntent = /\?$/.test(userText) || /^(what|why|how|when|where|which|can you explain|explain)\b/i.test(userText);
  const hasDebugIntent = /(debug|fix|failing|failure|error|bug|stack trace|test fails?|why .* failed)/i.test(userText);
  const hasEditIntent = /(modify|update|edit|patch|refactor|rewrite|change)\b/i.test(userLc);

  if (!String(out.intentClass || '').trim()) {
    if (hasLargeProgramIntent) out.intentClass = 'build_large_program';
    else if (hasDebugIntent) out.intentClass = 'debug';
    else if (hasEditIntent) out.intentClass = 'edit_existing';
    else if (hasQuestionIntent) out.intentClass = 'question';
    else out.intentClass = 'chat';
  }

  if (!String(out.executionStrategy || '').trim()) {
    if (out.intentClass === 'build_large_program') out.executionStrategy = 'phased_plan_then_code';
    else if (out.intentClass === 'debug') out.executionStrategy = 'inspect_then_fix';
    else if (out.intentClass === 'question' || out.intentClass === 'explain') out.executionStrategy = 'direct_answer';
    else if (out.intentClass === 'chat') out.executionStrategy = 'chat_reply';
    else out.executionStrategy = 'single_pass_code';
  }

  if (!String(out.taskMode || '').trim()) {
    if (out.intentClass === 'question' || out.intentClass === 'explain') out.taskMode = 'inspect';
    else if (out.intentClass === 'debug' || out.intentClass === 'edit_existing') out.taskMode = 'edit';
    else out.taskMode = 'generate';
  }

  if (!String(out.strictOutput || '').trim()) {
    if (out.intentClass === 'question' || out.intentClass === 'explain' || out.intentClass === 'chat') out.strictOutput = 'none';
    else out.strictOutput = 'full_file';
  }

  if (out.intentClass === 'build_large_program' && !String(out.rewrittenMessage || '').trim()) {
    out.rewrittenMessage =
      'Convert this request into a phased delivery contract. ' +
      'Phase 1: architecture + file map. ' +
      'Phase 2: core engine/components. ' +
      'Phase 3: integration and tests. ' +
      'Phase 4: polish and verification. ' +
      'Then implement phase-by-phase with runnable full files.';
  } else if (out.intentClass === 'build_large_program' && !/\b(phase|step|milestone|component)\b/i.test(String(out.rewrittenMessage || ''))) {
    out.rewrittenMessage = `${String(out.rewrittenMessage || '').trim()}\n\nOutput as phased components with explicit steps and deliverables.`;
  }

  const wantsFullFile = /(full corrected|full file|complete corrected|return full|reprint.*file|corrected .* only)/i.test(userText);
  const wantsUnifiedDiff = /(unified diff|diff patch|return .*diff|output .*diff|patch only|return only .*patch)/i.test(userText);
  if (!wantsFullFile && !wantsUnifiedDiff) return out;

  const replacements = extractExplicitReplacements(userText);
  const mentionedFiles = Array.from(
    new Set((userText.match(/\b[\w./-]+\.[a-z0-9]+\b/gi) || []).map((s) => String(s).trim()))
  );
  const primaryFile = mentionedFiles[0] || 'the target file';
  const isEditIntent = /(fix|modify|correct|rewrite|update|patch|refactor|edit)\b/.test(userLc);

  out.taskMode = isEditIntent ? 'edit' : 'edit';
  const replacementClause = replacements.length > 0
    ? (`Apply these exact replacements: ` +
      replacements.map((p) => `"${p.oldValue}" -> "${p.newValue}"`).join('; ') +
      '. ')
    : '';
  if (wantsUnifiedDiff) {
    out.strictOutput = 'unified_diff';
    out.rewrittenMessage =
      `Modify only ${primaryFile} to satisfy the request. ` +
      replacementClause +
      'Do not change anything else. ' +
      `Return only a unified diff patch against ${primaryFile}. Do not include prose.`;
  } else {
    out.strictOutput = 'full_file';
    out.rewrittenMessage =
      `Modify only ${primaryFile} to satisfy the request. ` +
      replacementClause +
      'Do not change anything else. ' +
      `Return only the complete corrected ${primaryFile} in a single fenced code block; no explanations.`;
  }
  out.reason = String(out.reason || '').trim() || 'full-file-contract-coerced';
  return out;
}

module.exports = {
  canonicalizeModelName,
  isModelNameEquivalent,
  isModelNameMatch,
  isSpeechOrAudioModelName,
  isCodingCatalogModel,
  listLocalGgufModels,
  resolveConfiguredModel,
  normalizeRouterMode,
  parseDispatcherDecision,
  validateRouterContract,
  coerceRouterDecisionForUserIntent
};
