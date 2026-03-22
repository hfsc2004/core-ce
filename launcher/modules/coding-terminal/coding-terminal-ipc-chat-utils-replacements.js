/**
 * Coding terminal chat replacement and diff validation helpers.
 */

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

function getAuthoritativeSourceFromContext(exactFileContext) {
  const files = Array.isArray(exactFileContext?.files) ? exactFileContext.files : [];
  if (files.length === 1 && String(files[0]?.content || '').trim()) {
    return String(files[0].content || '');
  }
  const contextBlock = String(exactFileContext?.contextBlock || '');
  if (!contextBlock) return '';
  const match = contextBlock.match(/~~~[a-zA-Z0-9_-]*\n([\s\S]*?)\n~~~/);
  if (match && match[1]) return String(match[1]);
  return '';
}

function extractPrimaryCodePayload(text) {
  const src = String(text || '');
  const fenced = src.match(/(```|~~~)[a-zA-Z0-9_-]*\n([\s\S]*?)\n\1/);
  if (fenced && fenced[2]) return String(fenced[2]);
  return src;
}

function normalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

function getAuthoritativeRelativePathFromContext(exactFileContext) {
  const files = Array.isArray(exactFileContext?.files) ? exactFileContext.files : [];
  if (files.length === 1) {
    return String(files[0]?.relativePath || files[0]?.path || '').trim();
  }
  const contextBlock = String(exactFileContext?.contextBlock || '');
  if (!contextBlock) return '';
  const head = contextBlock.match(/^#\s+([^\n]+)$/m);
  return head ? String(head[1] || '').trim() : '';
}

function toLinesWithTrailingEmpty(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (!normalized.endsWith('\n')) {
    return lines;
  }
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function buildUnifiedDiffPatchFromTexts({ relativePath, oldText, newText }) {
  const oldNorm = String(oldText || '').replace(/\r\n/g, '\n');
  const newNorm = String(newText || '').replace(/\r\n/g, '\n');
  if (oldNorm === newNorm) return '';
  const rel = String(relativePath || 'file.txt').trim() || 'file.txt';
  const oldLines = toLinesWithTrailingEmpty(oldNorm);
  const newLines = toLinesWithTrailingEmpty(newNorm);
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  const body = [
    `--- a/${rel}`,
    `+++ b/${rel}`,
    `@@ -1,${oldCount} +1,${newCount} @@`,
    ...oldLines.map((l) => `-${l}`),
    ...newLines.map((l) => `+${l}`)
  ].join('\n');
  return `~~~diff\n${body}\n~~~`;
}

function trySynthesizeUnifiedDiffFromModelOutput({ outputText, exactFileContext }) {
  const source = getAuthoritativeSourceFromContext(exactFileContext);
  if (!source) return '';
  const rel = getAuthoritativeRelativePathFromContext(exactFileContext);
  if (!rel) return '';
  const candidate = extractPrimaryCodePayload(outputText);
  if (!String(candidate || '').trim()) return '';
  return buildUnifiedDiffPatchFromTexts({
    relativePath: rel,
    oldText: source,
    newText: candidate
  });
}

function validateReplacementEditsInOutput({ userMessage, outputText, dispatch }) {
  const strictOutput = String(dispatch?.strictOutput || '').trim().toLowerCase();
  if (strictOutput !== 'full_file') return { ok: true };
  const replacements = extractExplicitReplacements(userMessage);
  if (!replacements.length) return { ok: true };
  const text = String(outputText || '');
  const failures = [];
  for (const pair of replacements) {
    const hasNew = text.includes(pair.newValue);
    const hasOld = text.includes(pair.oldValue);
    if (!hasNew || hasOld) {
      failures.push(`${pair.oldValue} -> ${pair.newValue}`);
    }
  }
  if (!failures.length) return { ok: true };
  return {
    ok: false,
    error: `deterministic replacement check failed: ${failures.join('; ')}`
  };
}

function validateNoExtraEditsForReplacements({ userMessage, outputText, dispatch, exactFileContext }) {
  const strictOutput = String(dispatch?.strictOutput || '').trim().toLowerCase();
  if (strictOutput !== 'full_file') return { ok: true };
  const replacements = extractExplicitReplacements(userMessage);
  if (!replacements.length) return { ok: true };
  const source = getAuthoritativeSourceFromContext(exactFileContext);
  if (!source) return { ok: true };
  let expected = source;
  for (const pair of replacements) {
    expected = expected.split(pair.oldValue).join(pair.newValue);
  }

  const candidate = extractPrimaryCodePayload(outputText);
  if (!candidate.trim()) return { ok: true };
  if (normalizeText(candidate) === normalizeText(expected)) return { ok: true };
  return {
    ok: false,
    error: 'deterministic replacement check failed: output changed content beyond requested replacement pairs.'
  };
}

module.exports = {
  validateReplacementEditsInOutput,
  validateNoExtraEditsForReplacements,
  trySynthesizeUnifiedDiffFromModelOutput
};
