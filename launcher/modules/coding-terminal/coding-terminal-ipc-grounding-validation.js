/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - Grounded response validation
 */

function createGroundingValidation(deps = {}) {
  const { analyzers } = deps;

  function isGroundedFileAnalysisRequest(message, exactFileContext) {
    if (!exactFileContext || !Array.isArray(exactFileContext.resolvedMentions) || exactFileContext.resolvedMentions.length === 0) {
      return false;
    }
    const text = String(message || '').toLowerCase();
    return /(examine|analy|analysis|review|inspect|debug|fix|explain|what.*(says|does|wrong|issue))/i.test(text);
  }

  function isGroundedFileRewriteRequest(message, exactFileContext) {
    if (!exactFileContext || !Array.isArray(exactFileContext.resolvedMentions) || exactFileContext.resolvedMentions.length === 0) {
      return false;
    }
    const text = String(message || '').toLowerCase();
    return /(modify|fix|correct|rewrite|update|refactor|patch|change|reprint|print.*(program|file|full|corrected)|show.*(corrected|fixed))/i.test(text);
  }

  function validateGroundedAnalysis(answerText, exactFileContext, options = {}) {
    const text = String(answerText || '');
    if (!text.trim()) return { ok: false, reason: 'empty', unknownSymbols: [] };
    if (/created question|created answer/i.test(text)) {
      return { ok: false, reason: 'template-artifact', unknownSymbols: [] };
    }

    const corpus = (exactFileContext.files || [])
      .map((f) => String(f.content || ''))
      .join('\n');
    if (!corpus) return { ok: true, reason: 'no-corpus', unknownSymbols: [] };

    if (options?.rewriteMode) {
      if (String(options?.rewriteFormat || '').toLowerCase() === 'full_file') {
        // In full-file rewrite mode, do not force unified-diff parsing.
        // Caller requested complete-file output, so accept and pass through.
        return { ok: true, reason: 'rewrite-full-file', unknownSymbols: [] };
      }
      const patchVerdict = tryApplyRewritePatch(text, exactFileContext);
      if (patchVerdict.ok) {
        return {
          ok: true,
          reason: 'rewrite-patch-applied',
          unknownSymbols: [],
          applied: patchVerdict.applied
        };
      }
      return {
        ok: false,
        reason: patchVerdict.reason || (patchVerdict.hasPatch ? 'rewrite-invalid-patch' : 'rewrite-missing-patch'),
        unknownSymbols: []
      };
    }

    const maybeFns = extractMentionedFunctionNames(text);
    const unknown = [];
    for (const fn of maybeFns) {
      const rx = new RegExp(`\\b${analyzers.escapeRegExp(fn)}\\b`);
      if (!rx.test(corpus)) unknown.push(fn);
    }
    if (unknown.length > 0) {
      return { ok: false, reason: 'unknown-symbols', unknownSymbols: unknown.slice(0, 12) };
    }
    return { ok: true, reason: 'ok', unknownSymbols: [] };
  }

  function buildGroundingFailureMessage(verdict, exactFileContext) {
    const files = (exactFileContext.files || []).map((f) => f.relativePath).join(', ') || 'referenced file';
    if (verdict.reason === 'unknown-symbols') {
      return [
        `Grounded analysis guard: I cannot verify parts of the prior analysis against ${files}.`,
        `Unverified symbols: ${verdict.unknownSymbols.join(', ')}`,
        'I only trust exact file content in this mode. Ask for line-by-line checks or quote exact lines to analyze.'
      ].join('\n');
    }
    if (verdict.reason === 'template-artifact') {
      return [
        `Grounded analysis guard: response contained template artifact text not tied to ${files}.`,
        'Please re-ask with a specific check, for example: "List real functions found in file and explain each."'
      ].join('\n');
    }
    if (verdict.reason === 'rewrite-missing-code') {
      return [
        `Grounded rewrite guard: response for ${files} did not contain a usable corrected full-file code block.`,
        'Please ask again and include: "print corrected full file only".'
      ].join('\n');
    }
    if (verdict.reason === 'rewrite-missing-patch') {
      return [
        `Grounded rewrite guard: response for ${files} did not include a unified diff patch.`,
        'Please ask again and include: "output ONLY a unified diff patch".'
      ].join('\n');
    }
    if (verdict.reason === 'rewrite-low-overlap') {
      return [
        `Grounded rewrite guard: response appears unrelated to ${files} (low source overlap).`,
        'I rejected it to prevent hallucinated rewrites. Ask again for a strict file-based correction.'
      ].join('\n');
    }
    if (verdict.reason === 'rewrite-invalid-patch') {
      return [
        `Grounded rewrite guard: response included a patch that could not be applied to ${files}.`,
        'I rejected it to prevent patch drift. Ask again for a minimal unified diff against exact lines.'
      ].join('\n');
    }
    if (verdict.reason === 'rewrite-noop-patch') {
      return [
        `Grounded rewrite guard: response included a no-op patch for ${files}.`,
        'I rejected it because no real code changes were produced. Ask again for concrete edits only.'
      ].join('\n');
    }
    if (verdict.reason === 'rewrite-missing-function-anchors') {
      const anchors = Array.isArray(verdict.anchors) ? verdict.anchors.slice(0, 6).join(', ') : '';
      return [
        `Grounded rewrite guard: response did not preserve identifiable functions from ${files}.`,
        anchors ? `Expected to retain function anchors such as: ${anchors}` : 'Expected to retain at least one original function anchor.',
        'I rejected it to prevent a fabricated replacement file.'
      ].join('\n');
    }
    return 'Grounded analysis guard: unable to verify response against exact file snapshot.';
  }

  function extractMentionedFunctionNames(text) {
    const set = new Set();
    const rx = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    const blacklist = new Set([
      'if', 'for', 'while', 'switch', 'return', 'function', 'catch', 'console',
      'document', 'window', 'settimeout', 'setinterval', 'parseint', 'parsefloat'
    ]);
    let m;
    while ((m = rx.exec(String(text || ''))) !== null) {
      const raw = String(m[1] || '');
      const name = raw.toLowerCase();
      if (!name || blacklist.has(name) || name.length < 3) continue;
      set.add(raw);
    }
    return [...set];
  }

  function extractPrimaryCodePayload(text) {
    const src = String(text || '');
    const blocks = [...src.matchAll(/~~~[a-zA-Z0-9_-]*\n([\s\S]*?)\n~~~/g)];
    if (blocks.length > 0) {
      blocks.sort((a, b) => (b[1]?.length || 0) - (a[1]?.length || 0));
      return String(blocks[0][1] || '');
    }
    return src;
  }

  function computeStrongLineOverlapRatio(sourceText, candidateText) {
    const normalize = (s) => String(s || '').trim();
    const sourceLines = String(sourceText || '')
      .split('\n')
      .map(normalize)
      .filter((line) => line.length >= 12 && /[A-Za-z]/.test(line));
    if (sourceLines.length === 0) return 1;
    const candidate = String(candidateText || '').toLowerCase();
    let matched = 0;
    for (const line of sourceLines) {
      if (candidate.includes(line.toLowerCase())) matched += 1;
    }
    return matched / sourceLines.length;
  }

  function validateRewriteFunctionAnchors(sourceText, candidateText) {
    const declared = analyzers.extractDeclaredFunctionsFromSource(sourceText);
    if (declared.length === 0) return { ok: true, expected: [] };
    const expected = declared.slice(0, 8);
    const target = String(candidateText || '');
    let present = 0;
    for (const name of expected) {
      const rx = new RegExp(`\\b${analyzers.escapeRegExp(name)}\\b`);
      if (rx.test(target)) present += 1;
    }
    const required = Math.min(2, expected.length);
    return { ok: present >= required, expected };
  }

  function tryApplyRewritePatch(answerText, exactFileContext) {
    const diffText = extractUnifiedDiffPayload(answerText);
    if (!diffText) {
      return { ok: false, hasPatch: false, reason: 'rewrite-missing-patch' };
    }
    const files = Array.isArray(exactFileContext?.files) ? exactFileContext.files : [];
    if (files.length !== 1) {
      return { ok: false, hasPatch: true, reason: 'rewrite-invalid-patch' };
    }
    const target = files[0];
    const applied = applyUnifiedDiffToText(String(target.content || ''), diffText);
    if (!applied.ok) {
      return { ok: false, hasPatch: true, reason: 'rewrite-invalid-patch' };
    }
    if (String(applied.content || '') === String(target.content || '')) {
      return { ok: false, hasPatch: true, reason: 'rewrite-noop-patch' };
    }
    return {
      ok: true,
      hasPatch: true,
      applied: {
        path: target.path,
        relativePath: target.relativePath || target.path || 'file',
        language: languageFromFilename(target.relativePath || target.path || ''),
        content: applied.content
      }
    };
  }

  function extractUnifiedDiffPayload(text) {
    const src = String(text || '');
    const block = src.match(/```diff\s*\n([\s\S]*?)\n```/i);
    if (block && block[1]) return String(block[1]).trim();
    const fallback = src.match(/(^|\n)(---\s+[^\n]+[\s\S]*?@@[\s\S]*)$/m);
    if (fallback && fallback[2]) return String(fallback[2]).trim();
    return '';
  }

  function applyUnifiedDiffToText(sourceText, diffText) {
    const srcLines = String(sourceText || '').split('\n');
    const diffLines = String(diffText || '').split('\n');
    const hunks = [];
    let i = 0;

    while (i < diffLines.length) {
      const line = diffLines[i];
      if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('diff --git ') || line.startsWith('index ')) {
        i += 1;
        continue;
      }
      const hm = line.match(/^@@\s+\-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (!hm) {
        i += 1;
        continue;
      }
      const oldStart = Number(hm[1]);
      const hunkLines = [];
      i += 1;
      while (i < diffLines.length && !diffLines[i].startsWith('@@ ')) {
        hunkLines.push(diffLines[i]);
        i += 1;
      }
      hunks.push({ oldStart, lines: hunkLines });
    }

    if (hunks.length === 0) return { ok: false };

    const out = [];
    let srcIndex = 0;
    for (const h of hunks) {
      const targetIndex = Math.max(0, h.oldStart - 1);
      if (targetIndex < srcIndex) return { ok: false };
      while (srcIndex < targetIndex && srcIndex < srcLines.length) {
        out.push(srcLines[srcIndex]);
        srcIndex += 1;
      }
      for (const dl of h.lines) {
        if (dl.startsWith('\\ No newline at end of file')) continue;
        const prefix = dl.charAt(0);
        const text = dl.slice(1);
        if (prefix === ' ') {
          if (srcLines[srcIndex] !== text) return { ok: false };
          out.push(srcLines[srcIndex]);
          srcIndex += 1;
        } else if (prefix === '-') {
          if (srcLines[srcIndex] !== text) return { ok: false };
          srcIndex += 1;
        } else if (prefix === '+') {
          out.push(text);
        } else {
          return { ok: false };
        }
      }
    }
    while (srcIndex < srcLines.length) {
      out.push(srcLines[srcIndex]);
      srcIndex += 1;
    }
    return { ok: true, content: out.join('\n') };
  }

  function languageFromFilename(filename) {
    const n = String(filename || '').toLowerCase();
    if (n.endsWith('.html') || n.endsWith('.htm')) return 'html';
    if (n.endsWith('.js')) return 'javascript';
    if (n.endsWith('.ts')) return 'typescript';
    if (n.endsWith('.css')) return 'css';
    if (n.endsWith('.json')) return 'json';
    if (n.endsWith('.py')) return 'python';
    if (n.endsWith('.md')) return 'markdown';
    return '';
  }

  return {
    isGroundedFileAnalysisRequest,
    isGroundedFileRewriteRequest,
    validateGroundedAnalysis,
    buildGroundingFailureMessage
  };
}

module.exports = createGroundingValidation;
