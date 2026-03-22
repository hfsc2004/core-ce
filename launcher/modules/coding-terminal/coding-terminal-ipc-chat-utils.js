/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Chat IPC helper utilities
 */
const replacementUtils = require('./coding-terminal-ipc-chat-utils-replacements');

function sanitizeAssistantText(text) {
  let out = String(text || '');
  if (!out) return '';
  out = out
    .replace(/<\|im_start\|>/gi, '')
    .replace(/<\|im_end\|>/gi, '')
    .replace(/<\|endoftext\|>/gi, '')
    .replace(/<\|assistant\|>/gi, '')
    .replace(/<\|user\|>/gi, '')
    .replace(/<\|system\|>/gi, '')
    .replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function extractAssistantResponseText(reply) {
  return sanitizeAssistantText(
    reply?.response?.message?.content ||
    reply?.response?.message?.reasoning ||
    reply?.response?.message?.reasoning_content ||
    reply?.response?.message?.thinking ||
    reply?.response?.content ||
    ''
  );
}

function isQwenInstructModel(modelName) {
  const n = String(modelName || '').toLowerCase();
  return n.includes('qwen') && n.includes('instruct');
}

function buildEmptyReplyDiagnostic(reply, modelName, port, backend = 'ollama') {
  const doneReason = String(reply?.response?.done_reason || '').trim() || 'n/a';
  const evalCount = Number(reply?.response?.eval_count);
  const promptEvalCount = Number(reply?.response?.prompt_eval_count);
  const totalDuration = Number(reply?.response?.total_duration);
  const metrics = [
    `done_reason=${doneReason}`,
    `eval_count=${Number.isFinite(evalCount) ? evalCount : 'n/a'}`,
    `prompt_eval_count=${Number.isFinite(promptEvalCount) ? promptEvalCount : 'n/a'}`,
    `total_duration_ns=${Number.isFinite(totalDuration) ? totalDuration : 'n/a'}`
  ].join(', ');

  const qwenHint = isQwenInstructModel(modelName)
    ? '\nHint: This Qwen model may have a missing/invalid chat template. Re-wrap this model in regular PSF Terminal (not Coding Terminal), then retry.'
    : '';
  let rawPreview = '';
  try {
    const rawPayload = reply?.response?.raw ?? reply?.response ?? reply;
    if (rawPayload !== undefined && rawPayload !== null) {
      const serialized = (typeof rawPayload === 'string')
        ? rawPayload
        : JSON.stringify(rawPayload);
      const clipped = String(serialized || '').trim();
      if (clipped) {
        const max = 2200;
        const short = clipped.length > max ? `${clipped.slice(0, max)}\n...[truncated]` : clipped;
        rawPreview = `\nRaw response preview:\n${short}`;
      }
    }
  } catch {}

  return `No assistant content returned from ${backend} (${modelName} @ ${port}). ${metrics}.${qwenHint}${rawPreview}`;
}

function restoreOriginalUserMessage(messages, originalUserMessage) {
  const restored = Array.isArray(messages) ? messages.map((m) => ({ ...m })) : [];
  const original = String(originalUserMessage || '').trim();
  if (!original || restored.length === 0) return restored;
  for (let i = restored.length - 1; i >= 0; i--) {
    if (restored[i]?.role === 'user') {
      restored[i].content = original;
      break;
    }
  }
  return restored;
}

function enforceStrictOutputContract(text, dispatch = null) {
  const strictOutput = String(dispatch?.strictOutput || '').trim().toLowerCase();
  if (strictOutput !== 'full_file' && strictOutput !== 'unified_diff') {
    return { ok: true, text: String(text || '') };
  }
  const raw = String(text || '');
  if (!raw.trim()) {
    return {
      ok: false,
      text: raw,
      error: `strictOutput=${strictOutput} violation: response was empty.`
    };
  }

  if (strictOutput === 'unified_diff') {
    const trimmed = raw.trim();
    const fenceMatch = trimmed.match(/(?:```|~~~)\s*diff[^\n]*\n[\s\S]*?\n(?:```|~~~)/i);
    if (fenceMatch) {
      const normalized = String(fenceMatch[0] || '').trim();
      if (!normalized) {
        return {
          ok: false,
          text: raw,
          error: 'strictOutput=unified_diff violation: fenced diff block was empty.'
        };
      }
      if (normalized !== trimmed) {
        return {
          ok: true,
          text: normalized,
          warning: 'strictOutput=unified_diff: kept unified diff block and dropped non-diff prose.'
        };
      }
      return { ok: true, text: normalized };
    }

    const looksLikePlainDiff =
      /(^|\n)---\s+a\/.+/m.test(trimmed) &&
      /(^|\n)\+\+\+\s+b\/.+/m.test(trimmed) &&
      /(^|\n)@@\s*-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s*@@/m.test(trimmed);
    if (looksLikePlainDiff) {
      return { ok: true, text: trimmed };
    }
    return {
      ok: false,
      text: raw,
      error: 'strictOutput=unified_diff violation: expected unified diff patch output.'
    };
  }

  const normalizedFull = normalizeFullFileBlocks(raw, dispatch);
  if (!normalizedFull.sawFence) {
    return {
      ok: false,
      text: raw,
      error: 'strictOutput=full_file violation: expected fenced file blocks, but none were detected.'
    };
  }
  const normalized = normalizedFull.text;
  if (!normalized) {
    return {
      ok: false,
      text: raw,
      error: 'strictOutput=full_file violation: no usable file blocks after validation.'
    };
  }
  if (normalizedFull.changed || normalized !== raw.trim()) {
    return {
      ok: true,
      text: normalized,
      warning: 'strictOutput=full_file: normalized file blocks and applied filename headers.'
    };
  }
  return { ok: true, text: normalized };
}

function normalizeFullFileBlocks(raw, dispatch = null) {
  const src = String(raw || '');
  const re = /(```|~~~)([^\n]*)\n([\s\S]*?)\n\1/g;
  const blocks = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const fence = String(m[1] || '```');
    const meta = String(m[2] || '').trim();
    const body = String(m[3] || '');
    const start = Number(m.index) || 0;
    const end = Number(re.lastIndex) || 0;
    const before = src.slice(0, start);
    const headerMatch = before.match(/###FILE:\s*([^\n]+)\s*$/i);
    const explicit = headerMatch ? sanitizeFilename(headerMatch[1]) : '';
    blocks.push({ fence, meta, body, explicit });
  }
  if (!blocks.length) return { sawFence: false, text: '', changed: false };

  const expectedFiles = extractExpectedFilesFromDispatch(dispatch);
  const generated = generateDefaultNamesForBlocks(blocks, expectedFiles);
  const entries = [];
  const seenContent = new Set();
  const byName = new Map();
  let changed = false;
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    const lang = String(b.meta || '').split(/\s+/)[0].trim().toLowerCase();
    const header = b.explicit || generated[i] || `file-${String(i + 1).padStart(3, '0')}.${extForLang(lang)}`;
    if (!b.explicit) changed = true;
    const bodyKey = normalizeText(b.body);
    if (bodyKey && seenContent.has(bodyKey)) {
      changed = true;
      continue;
    }
    if (bodyKey) seenContent.add(bodyKey);
    const existingIndex = byName.get(header);
    if (Number.isInteger(existingIndex)) {
      const prev = entries[existingIndex];
      const prevLen = normalizeText(prev?.body || '').length;
      const nextLen = bodyKey.length;
      if (nextLen > prevLen) {
        entries[existingIndex] = { header, fence: b.fence, meta: b.meta, body: b.body };
      }
      changed = true;
      continue;
    }
    byName.set(header, entries.length);
    entries.push({ header, fence: b.fence, meta: b.meta, body: b.body });
  }
  const schemaApplied = applyExpectedFileSchema(entries, expectedFiles);
  if (schemaApplied.changed) changed = true;
  const finalEntries = schemaApplied.entries;

  const out = [];
  for (let i = 0; i < finalEntries.length; i += 1) {
    const e = finalEntries[i];
    out.push(`###FILE:${e.header}`);
    out.push(`${e.fence}${e.meta ? ` ${e.meta}` : ''}`.trimEnd());
    out.push(e.body);
    out.push(e.fence);
    if (i < finalEntries.length - 1) out.push('');
  }
  return {
    sawFence: true,
    text: out.join('\n').trim(),
    changed
  };
}

function generateDefaultNamesForBlocks(blocks = [], expectedFiles = []) {
  const expected = Array.isArray(expectedFiles)
    ? expectedFiles.map((n) => sanitizeFilename(n)).filter(Boolean)
    : [];
  if (expected.length > 0) {
    const used = new Set();
    const names = Array(blocks.length).fill('');
    for (let i = 0; i < blocks.length; i += 1) {
      const b = blocks[i];
      if (b?.explicit) continue;
      const lang = String(b?.meta || '').split(/\s+/)[0].trim().toLowerCase();
      const ext = extForLang(lang);
      const hit = expected.find((f) => !used.has(f) && String(f).toLowerCase().endsWith(`.${ext}`));
      if (hit) {
        names[i] = hit;
        used.add(hit);
      }
    }
    for (let i = 0; i < blocks.length; i += 1) {
      if (names[i]) continue;
      const next = expected.find((f) => !used.has(f));
      if (!next) break;
      names[i] = next;
      used.add(next);
    }
    if (names.some(Boolean)) return names;
  }

  const langs = blocks.map((b) => String(b.meta || '').split(/\s+/)[0].trim().toLowerCase());
  const lower = langs.map((x) => String(x || '').toLowerCase());
  if (blocks.length >= 3 && lower.includes('html') && lower.includes('css') && (lower.includes('javascript') || lower.includes('js'))) {
    const names = Array(blocks.length).fill('');
    let htmlUsed = false;
    let cssUsed = false;
    let jsUsed = false;
    for (let i = 0; i < blocks.length; i += 1) {
      const lang = lower[i];
      if (!htmlUsed && lang === 'html') {
        names[i] = 'index.html';
        htmlUsed = true;
      } else if (!cssUsed && lang === 'css') {
        names[i] = 'styles.css';
        cssUsed = true;
      } else if (!jsUsed && (lang === 'javascript' || lang === 'js')) {
        names[i] = 'script.js';
        jsUsed = true;
      }
    }
    return names;
  }
  return blocks.map((b, i) => {
    const lang = String(b.meta || '').split(/\s+/)[0].trim().toLowerCase();
    return `file-${String(i + 1).padStart(3, '0')}.${extForLang(lang)}`;
  });
}

function applyExpectedFileSchema(entries = [], expectedFiles = []) {
  const expected = Array.isArray(expectedFiles)
    ? expectedFiles.map((n) => sanitizeFilename(n)).filter(Boolean)
    : [];
  if (!expected.length) {
    return {
      changed: false,
      entries: Array.isArray(entries) ? entries.slice() : []
    };
  }
  const pool = Array.isArray(entries) ? entries.slice() : [];
  const lowerExpected = expected.map((n) => n.toLowerCase());
  const usedPool = new Set();
  const out = [];
  let changed = false;

  for (let i = 0; i < expected.length; i += 1) {
    const want = expected[i];
    const wantLc = lowerExpected[i];
    const idx = pool.findIndex((entry, pidx) => (
      !usedPool.has(pidx) &&
      String(entry?.header || '').toLowerCase() === wantLc
    ));
    if (idx >= 0) {
      usedPool.add(idx);
      out.push(pool[idx]);
      continue;
    }

    const wantExt = String(want).includes('.') ? String(want).split('.').pop().toLowerCase() : '';
    let fallbackIdx = -1;
    if (wantExt) {
      fallbackIdx = pool.findIndex((entry, pidx) => {
        if (usedPool.has(pidx)) return false;
        const header = String(entry?.header || '');
        const ext = header.includes('.') ? header.split('.').pop().toLowerCase() : '';
        return ext === wantExt;
      });
    }
    if (fallbackIdx < 0) {
      fallbackIdx = pool.findIndex((_, pidx) => !usedPool.has(pidx));
    }
    if (fallbackIdx >= 0) {
      usedPool.add(fallbackIdx);
      const picked = pool[fallbackIdx];
      if (String(picked?.header || '') !== want) changed = true;
      out.push({
        ...picked,
        header: want
      });
    }
  }

  if (out.length !== pool.length) changed = true;
  return { changed, entries: out };
}

function extractExpectedFilesFromDispatch(dispatch = null) {
  const text = String(dispatch?.rewrittenMessage || '');
  if (!text) return [];
  const out = [];
  const re = /###FILE:\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = sanitizeFilename(m[1] || '');
    if (!name) continue;
    if (!out.some((x) => String(x).toLowerCase() === name.toLowerCase())) {
      out.push(name);
    }
    if (out.length >= 12) break;
  }
  return out;
}

function extForLang(lang) {
  const l = String(lang || '').toLowerCase();
  if (l === 'javascript' || l === 'js') return 'js';
  if (l === 'typescript' || l === 'ts') return 'ts';
  if (l === 'python' || l === 'py') return 'py';
  if (l === 'html') return 'html';
  if (l === 'css') return 'css';
  if (l === 'json') return 'json';
  if (l === 'markdown' || l === 'md') return 'md';
  if (l === 'bash' || l === 'sh' || l === 'shell') return 'sh';
  if (l === 'yaml' || l === 'yml') return 'yml';
  if (l === 'xml') return 'xml';
  if (l === 'sql') return 'sql';
  if (l === 'c') return 'c';
  if (l === 'cpp' || l === 'c++') return 'cpp';
  if (l === 'csharp' || l === 'cs') return 'cs';
  if (l === 'go') return 'go';
  if (l === 'rust' || l === 'rs') return 'rs';
  if (l === 'java') return 'java';
  if (l === 'php') return 'php';
  if (l === 'ruby' || l === 'rb') return 'rb';
  return 'txt';
}

function sanitizeFilename(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const one = raw.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
  if (!one) return '';
  return one.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

module.exports = {
  sanitizeAssistantText,
  extractAssistantResponseText,
  buildEmptyReplyDiagnostic,
  restoreOriginalUserMessage,
  enforceStrictOutputContract,
  validateReplacementEditsInOutput: replacementUtils.validateReplacementEditsInOutput,
  validateNoExtraEditsForReplacements: replacementUtils.validateNoExtraEditsForReplacements,
  trySynthesizeUnifiedDiffFromModelOutput: replacementUtils.trySynthesizeUnifiedDiffFromModelOutput
};
