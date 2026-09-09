/**
 * MIT-style RLM prompt environment skeleton.
 *
 * This module stores the full prompt outside the model context and exposes
 * bounded metadata/read helpers. It does not execute model-authored code.
 */

function clampInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function previewText(value, maxChars = 240) {
  const text = String(value || '');
  const limit = clampInt(maxChars, 240, 0, 4000);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => ({
    role: String(message?.role || 'user'),
    contentLength: String(message?.content || '').length
  }));
}

function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((item) => ({
    id: String(item?.id || ''),
    displayName: String(item?.displayName || item?.originalName || ''),
    sizeBytes: Math.max(0, Number(item?.sizeBytes) || 0),
    textExtractable: item?.textExtractable === true,
    mimeType: String(item?.mimeType || '')
  })).filter((item) => item.id || item.displayName);
}

function estimateBytes(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function createRlmEnvironment(options = {}) {
  const prompt = String(options.prompt || '');
  const messages = normalizeMessages(options.messages || []);
  const attachments = normalizeAttachments(options.attachments || []);
  const scratch = new Map();
  let finalValue = '';
  let finalSet = false;

  function getMetadata() {
    const scratchValues = Array.from(scratch.entries()).map(([name, value]) => ({
      name,
      chars: String(value || '').length,
      bytes: estimateBytes(value),
      preview: previewText(value, 160)
    }));
    return {
      schemaVersion: 'rlm-environment/v0-dry-run',
      prompt: {
        chars: prompt.length,
        bytes: estimateBytes(prompt),
        preview: previewText(prompt, 240)
      },
      messages: {
        count: messages.length,
        items: messages
      },
      attachments: {
        count: attachments.length,
        textExtractableCount: attachments.filter((item) => item.textExtractable).length,
        items: attachments
      },
      scratch: {
        count: scratchValues.length,
        values: scratchValues
      },
      final: {
        set: finalSet,
        chars: finalSet ? finalValue.length : 0,
        bytes: finalSet ? estimateBytes(finalValue) : 0,
        preview: finalSet ? previewText(finalValue, 240) : ''
      },
      helpers: [
        'len_prompt()',
        'slice_prompt(start, end)',
        'search_prompt(pattern, max_hits)',
        'chunk_prompt(chunk_size, overlap)',
        'set_value(name, value)',
        'get_value(name, offset, length)',
        'list_values()',
        'set_final(value)'
      ]
    };
  }

  function lenPrompt() {
    return prompt.length;
  }

  function slicePrompt(start = 0, end = 0) {
    const s = clampInt(start, 0, 0, prompt.length);
    const e = end == null || Number(end) <= 0 ? prompt.length : clampInt(end, prompt.length, s, prompt.length);
    return prompt.slice(s, e);
  }

  function searchPrompt(pattern, maxHits = 20) {
    const query = String(pattern || '');
    if (!query) return [];
    const limit = clampInt(maxHits, 20, 1, 200);
    const hits = [];
    const lowerPrompt = prompt.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let index = 0;
    while (hits.length < limit) {
      const found = lowerPrompt.indexOf(lowerQuery, index);
      if (found < 0) break;
      hits.push({
        index: found,
        preview: previewText(prompt.slice(Math.max(0, found - 80), Math.min(prompt.length, found + query.length + 80)), 220)
      });
      index = found + Math.max(1, query.length);
    }
    return hits;
  }

  function chunkPrompt(chunkSize = 4000, overlap = 200) {
    const size = clampInt(chunkSize, 4000, 128, 100000);
    const ov = clampInt(overlap, 200, 0, Math.max(0, size - 1));
    const chunks = [];
    let start = 0;
    while (start < prompt.length) {
      const end = Math.min(prompt.length, start + size);
      chunks.push({ index: chunks.length, start, end, text: prompt.slice(start, end) });
      if (end >= prompt.length) break;
      start = Math.max(start + 1, end - ov);
    }
    return chunks;
  }

  function setValue(name, value) {
    const key = String(name || '').trim();
    if (!key) throw new Error('Environment value name is required.');
    scratch.set(key, String(value || ''));
    return { name: key, chars: String(value || '').length };
  }

  function getValue(name, offset = 0, length = 0) {
    const key = String(name || '').trim();
    const value = scratch.has(key) ? String(scratch.get(key) || '') : '';
    const start = clampInt(offset, 0, 0, value.length);
    const len = clampInt(length, 0, 0, value.length);
    const end = len > 0 ? Math.min(value.length, start + len) : value.length;
    return value.slice(start, end);
  }

  function listValues() {
    return Array.from(scratch.keys());
  }

  function setFinal(value) {
    finalValue = String(value || '');
    finalSet = true;
    return { chars: finalValue.length };
  }

  function getFinal() {
    return finalSet ? finalValue : '';
  }

  function getSandboxState() {
    return {
      prompt,
      scratch: Object.fromEntries(Array.from(scratch.entries()))
    };
  }

  function applySandboxResult(result = {}) {
    const nextScratch = result && typeof result.scratch === 'object' && result.scratch !== null
      ? result.scratch
      : null;
    if (nextScratch) {
      scratch.clear();
      for (const [name, value] of Object.entries(nextScratch)) {
        const key = String(name || '').trim();
        if (key) scratch.set(key, String(value || ''));
      }
    }
    if (result?.final?.set === true) {
      setFinal(result.final.value || '');
    }
    return getMetadata();
  }

  return {
    getMetadata,
    lenPrompt,
    slicePrompt,
    searchPrompt,
    chunkPrompt,
    setValue,
    getValue,
    listValues,
    setFinal,
    getFinal,
    getSandboxState,
    applySandboxResult,
    isFinalSet: () => finalSet
  };
}

module.exports = {
  createRlmEnvironment
};
