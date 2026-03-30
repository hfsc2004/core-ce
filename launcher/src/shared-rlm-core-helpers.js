/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  const ACRONYM_STOPWORDS = new Set([
    'THE', 'AND', 'FOR', 'WITH', 'THIS', 'THAT', 'FROM', 'WHAT', 'HERE', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'
  ]);

  function uniqueStrings(values = []) {
    const seen = new Set();
    const out = [];
    values.forEach((v) => {
      const s = String(v || '').trim();
      if (!s) return;
      const key = s.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(s);
    });
    return out;
  }

  function extractRequestedPreserveTerms(message) {
    const text = String(message || '');
    if (!text) return [];
    const out = [];
    const paren = text.match(/preserve[^()]*\(([^)]+)\)/i);
    if (paren && paren[1]) {
      paren[1].split(',').forEach((p) => out.push(p.trim()));
    }
    const inline = text.match(/preserve\s+(?:named\s+entities|acronyms|terms?)\s*:\s*([^\n.!?]+)/i);
    if (inline && inline[1]) {
      inline[1].split(',').forEach((p) => out.push(p.trim()));
    }
    return uniqueStrings(out).slice(0, 16);
  }

  function extractHighSignalTerms(text) {
    const source = String(text || '');
    if (!source) return [];
    const acronymsRaw = source.match(/\b[A-Z][A-Z0-9&./-]{1,}\b/g) || [];
    const acronyms = acronymsRaw.filter((token) => {
      const t = String(token || '').trim().toUpperCase();
      if (!t || ACRONYM_STOPWORDS.has(t)) return false;
      if (/^[A-Z]+$/.test(t) && t.length <= 3) return false;
      return true;
    });
    const namedGroups = source.match(/\b(?:Freemasonry|Mithraism|Mithraic|Antients|Premier Grand Lodge|Operative Masonry|Speculative Masonry|F&AM)\b/gi) || [];
    return uniqueStrings([...(namedGroups || []), ...acronyms]).slice(0, 16);
  }

  function summarizeChunkText(chunkText, maxLen = 260) {
    let normalized = String(chunkText || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (/^[a-z]/.test(normalized)) {
      const boundary = normalized.search(/[.!?]\s+[A-Z]/);
      if (boundary > 18 && boundary < 280) {
        normalized = normalized.slice(boundary + 2).trim();
      }
    }
    const parts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
    const selected = parts.slice(0, 2).join(' ');
    const concise = (selected || normalized).slice(0, maxLen).trim();
    const words = concise.split(/\s+/).filter(Boolean);
    if (words.length < 6) return '';
    return concise;
  }

  function containsAllTerms(text, terms = []) {
    const body = String(text || '').toLowerCase();
    return terms.every((t) => body.includes(String(t || '').toLowerCase()));
  }

  function appendMissingTerms(summary, terms = []) {
    const clean = String(summary || '').trim();
    if (!clean || !terms.length) return clean;
    const missing = terms.filter((t) => !clean.toLowerCase().includes(String(t).toLowerCase()));
    if (!missing.length) return clean;
    return `${clean}\n\nKey Terms Preserved: ${missing.join(', ')}`;
  }

  function isHeadingLike(line) {
    const text = String(line || '').trim();
    if (!text) return false;
    if (text.endsWith(':')) return true;
    if (/^\d+\./.test(text)) return true;
    if (text.length > 90) return false;
    const letters = text.replace(/[^A-Za-z]/g, '');
    if (letters.length < 4) return false;
    const uppercase = letters.replace(/[^A-Z]/g, '').length;
    return uppercase / letters.length >= 0.75;
  }

  function cleanSnippet(text, maxLen = 220) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.slice(0, maxLen);
  }

  function buildSectionAwareItems(text) {
    const raw = String(text || '');
    if (!raw) return [];
    const lines = raw.split('\n');
    const items = [];

    let currentHeading = '';
    let currentBody = [];
    function flushSection() {
      if (!currentHeading && currentBody.length === 0) return;
      const body = currentBody
        .map((l) => cleanSnippet(l, 180))
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
      const row = currentHeading ? `${cleanSnippet(currentHeading, 120)} ${body}`.trim() : body;
      if (row) items.push(row);
      currentHeading = '';
      currentBody = [];
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = String(lines[i] || '').trim();
      if (!line) {
        flushSection();
        continue;
      }
      if (isHeadingLike(line)) {
        flushSection();
        currentHeading = line;
        continue;
      }
      currentBody.push(line);
    }
    flushSection();

    const timelineLines = lines
      .map((l) => String(l || '').trim())
      .filter((l) => /\b(?:1[0-9]{3}|20[0-9]{2})\b/.test(l))
      .slice(0, 8)
      .map((l) => `Timeline: ${cleanSnippet(l, 200)}`);

    return uniqueStrings([...items, ...timelineLines]).slice(0, 36);
  }

  function isEpubLikeText(text) {
    const source = String(text || '');
    if (!source) return false;
    return /(?:^|\n)\s*(?:OPS\/|OEBPS\/).+\.(?:xhtml|html|htm|xml)\b/im.test(source);
  }

  function filterNoisyEpubRows(items) {
    const rows = Array.isArray(items) ? items : [];
    return rows.filter((row) => {
      const text = String(row || '').trim();
      if (!text) return false;
      if (/^(?:OPS\/|OEBPS\/).+\.(?:xhtml|html|htm|xml)\b/i.test(text)) return false;
      if (/^Timeline:\s*(?:OPS\/|OEBPS\/).+\.(?:xhtml|html|htm|xml)\b/i.test(text)) return false;
      return true;
    });
  }

  function extractEpubChapterItems(text) {
    const source = String(text || '');
    if (!source) return [];
    const lines = source.split('\n').map((l) => String(l || '').trim());
    const chapters = [];
    let currentName = '';
    let currentBody = [];

    function flush() {
      if (!currentName || currentBody.length === 0) {
        currentName = '';
        currentBody = [];
        return;
      }
      const bodyText = currentBody.join(' ').replace(/\s+/g, ' ').trim();
      const snippet = summarizeChunkText(bodyText, 320);
      if (snippet) {
        const base = currentName.split('/').pop() || currentName;
        chapters.push(`Chapter ${base}: ${snippet}`);
      }
      currentName = '';
      currentBody = [];
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      const entryMatch = line.match(/\b([A-Za-z0-9._/-]+\.(?:xhtml|html|htm|xml))\b/i);
      const isChapterEntry = !!entryMatch && /(?:chapter|chap|ops\/|text\/|section)/i.test(entryMatch[1]);
      if (isChapterEntry) {
        flush();
        currentName = entryMatch[1];
        const rest = line.replace(entryMatch[1], '').trim();
        if (rest) currentBody.push(rest);
        continue;
      }
      if (currentName) currentBody.push(line);
    }
    flush();

    return uniqueStrings(chapters).slice(0, 20);
  }

  function isListLine(line) {
    const text = String(line || '').trim();
    if (!text) return false;
    if (/^(?:[-*•]\s+)/.test(text)) return true;
    if (/^\d+[.)]\s+/.test(text)) return true;
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+\([^)]+\)$/.test(text)) return true;
    return false;
  }

  function extractPreservedLists(text) {
    const lines = String(text || '').split('\n').map((l) => String(l || '').trim());
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        i += 1;
        continue;
      }
      const looksLikeHeading = isHeadingLike(line) || line.endsWith(':');
      if (!looksLikeHeading) {
        i += 1;
        continue;
      }

      const listItems = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (!next) {
          if (listItems.length > 0) break;
          j += 1;
          continue;
        }
        if (isListLine(next)) {
          listItems.push(next.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '').trim());
          j += 1;
          continue;
        }
        if (!isHeadingLike(next) && /^[A-Z][A-Za-z' -]{2,40}(?:\s+\([^)]+\))?$/.test(next)) {
          listItems.push(next);
          j += 1;
          continue;
        }
        if (listItems.length > 0) break;
        if (isHeadingLike(next)) break;
        j += 1;
      }

      if (listItems.length >= 4) {
        const heading = cleanSnippet(line, 120);
        const cleanedItems = uniqueStrings(listItems).slice(0, 24);
        if (cleanedItems.length >= 4) {
          blocks.push({ heading, items: cleanedItems });
        }
      }

      i = Math.max(i + 1, j);
    }
    return blocks.slice(0, 4);
  }

  function filterSectionItemsAgainstPreservedLists(sectionItems, preservedListBlocks) {
    const items = Array.isArray(sectionItems) ? sectionItems : [];
    const blocks = Array.isArray(preservedListBlocks) ? preservedListBlocks : [];
    if (blocks.length === 0) return items;
    const headings = blocks
      .map((b) => String(b?.heading || '').toLowerCase().replace(/:$/, '').trim())
      .filter(Boolean);
    if (headings.length === 0) return items;
    return items.filter((row) => {
      const text = String(row || '').toLowerCase();
      return !headings.some((h) => text.includes(h));
    });
  }

  function formatPreservedLists(blocks) {
    const listBlocks = Array.isArray(blocks) ? blocks : [];
    if (listBlocks.length === 0) return '';
    return listBlocks.map((b) => {
      const lines = [String(b.heading || 'List').replace(/:?\s*$/, ':')];
      (Array.isArray(b.items) ? b.items : []).forEach((item) => {
        lines.push(`- ${cleanSnippet(item, 90)}`);
      });
      return lines.join('\n');
    }).join('\n\n');
  }

  function stripPartialListEchoLines(summary, preservedListBlocks) {
    const text = String(summary || '');
    const blocks = Array.isArray(preservedListBlocks) ? preservedListBlocks : [];
    if (!text || blocks.length === 0) return text;

    const allItems = uniqueStrings(
      blocks.flatMap((b) => (Array.isArray(b?.items) ? b.items : []))
    ).map((v) => String(v || '').toLowerCase());
    if (allItems.length === 0) return text;

    const kept = text.split('\n').filter((line) => {
      const row = String(line || '').trim();
      if (!row) return true;
      const low = row.toLowerCase();
      let hits = 0;
      for (let i = 0; i < allItems.length; i += 1) {
        if (allItems[i] && low.includes(allItems[i])) hits += 1;
        if (hits >= 2) return false;
      }
      return true;
    });
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function ensureThemeCoverage(summary, sourceText, preserveTerms = [], preservedListBlocks = []) {
    const text = stripPartialListEchoLines(String(summary || '').trim(), preservedListBlocks);
    if (!text) return text;
    const mustKeep = uniqueStrings([...(preserveTerms || [])]).slice(0, 8);
    let out = appendMissingTerms(text, mustKeep);
    const listText = formatPreservedLists(preservedListBlocks);
    if (listText) out = `${out}\n\nPreserved Lists:\n${listText}`;
    return out;
  }

  function userRequestedSummary(message) {
    const text = String(message || '').toLowerCase();
    if (!text) return false;
    return /\b(summarize|summary|summarise|tl;dr|tldr)\b/.test(text);
  }

  function looksLikeFileRequest(text) {
    const t = String(text || '').toLowerCase();
    if (!t) return false;
    return (
      t.includes('provide me with the file') ||
      t.includes('please provide the file') ||
      t.includes('upload the file') ||
      t.includes('paste the text') ||
      t.includes('share the url') ||
      t.includes('i need the file')
    );
  }

  function extractEvidenceQueries(message, preserveTerms = []) {
    const text = String(message || '');
    const terms = [];
    const quoted = text.match(/["']([^"']{2,60})["']/g) || [];
    quoted.forEach((q) => terms.push(String(q || '').replace(/^["']|["']$/g, '').trim()));

    const words = text
      .split(/[^A-Za-z0-9_.-]+/)
      .map((w) => String(w || '').trim())
      .filter(Boolean)
      .filter((w) => w.length >= 4)
      .filter((w) => !/^\d+$/.test(w));

    const keepWords = words.filter((w) => !/^(what|which|when|where|how|from|with|that|this|into|over|under|about|could|would|should|please|using|deployable|runtime|only)$/i.test(w));
    const mixed = uniqueStrings([...(preserveTerms || []), ...terms, ...keepWords]);
    return mixed.slice(0, 12);
  }

  function formatChunkCitationBlock(chunkCitations = [], maxRows = 6) {
    const rows = (Array.isArray(chunkCitations) ? chunkCitations : [])
      .slice(0, maxRows)
      .map((c) => {
        const ref = String(c?.id || 'chunk');
        const start = Number(c?.start || 0);
        const end = Number(c?.end || 0);
        const snippet = cleanSnippet(c?.snippet || '', 120);
        return '`' + ref + ' (' + start + '-' + end + ')`' + ': ' + snippet;
      })
      .filter(Boolean);
    if (!rows.length) return '';
    return ['Sources:', ...rows].join('\n');
  }

  function formatEvidenceLineBlock(evidence = [], maxRows = 8) {
    const rows = (Array.isArray(evidence) ? evidence : [])
      .slice(0, maxRows)
      .map((e) => {
        const lineNumber = Number(e?.lineNumber || 0);
        const query = String(e?.query || '').trim();
        const line = cleanSnippet(e?.line || '', 160);
        return '`[line:' + lineNumber + ']`' + ' (' + query + ') ' + line;
      })
      .filter(Boolean);
    if (!rows.length) return '';
    return ['Evidence:', ...rows].join('\n');
  }

  function buildCitationMarkerLine(chunkCitations = [], evidence = []) {
    const chunkRefs = (Array.isArray(chunkCitations) ? chunkCitations : [])
      .slice(0, 4)
      .map((c) => '[chunk_' + (Number(c?.index || 0)) + ']')
      .filter(Boolean);
    const lineRefs = (Array.isArray(evidence) ? evidence : [])
      .slice(0, 4)
      .map((e) => '[line:' + Number(e?.lineNumber || 0) + ']')
      .filter((s) => !/\[line:0\]/.test(s));
    const refs = uniqueStrings([...chunkRefs, ...lineRefs]);
    if (!refs.length) return '';
    return 'Citation refs: ' + refs.join(' ');
  }

  function appendSourceBlocks(answer, chunkCitations, evidence) {
    const body = String(answer || '').trim();
    const markerLine = buildCitationMarkerLine(chunkCitations, evidence);
    const chunkBlock = formatChunkCitationBlock(chunkCitations, 6);
    const lineBlock = formatEvidenceLineBlock(evidence, 6);
    const blocks = [markerLine, chunkBlock, lineBlock].filter(Boolean).join('\n\n');
    if (!blocks) return body;
    if (!body) return blocks;
    return body + '\n\n' + blocks;
  }

  function formatAttachmentSelectionHelp(items) {
    const rows = (Array.isArray(items) ? items : []).slice(0, 12)
      .map((a) => `- ${a.scopedId || a.id} (${a.displayName || 'unnamed'})`);
    if (!rows.length) return 'Multiple attachments are available; run /attachments and include an attachment id in your request.';
    return [
      'Multiple attachments found. Include one of these IDs in your prompt:',
      ...rows,
      'Example: summarize attachmentId=<id>'
    ].join('\n');
  }

  function buildToolDigest(results) {
    return results.map((r, idx) => ({
      step: idx + 1,
      tool: r?.tool,
      success: !!r?.success,
      output: r?.output || {}
    }));
  }

  window.PsfRlmCoreHelpers = {
    uniqueStrings,
    extractRequestedPreserveTerms,
    extractHighSignalTerms,
    summarizeChunkText,
    containsAllTerms,
    appendMissingTerms,
    isHeadingLike,
    cleanSnippet,
    buildSectionAwareItems,
    isEpubLikeText,
    filterNoisyEpubRows,
    extractEpubChapterItems,
    isListLine,
    extractPreservedLists,
    filterSectionItemsAgainstPreservedLists,
    formatPreservedLists,
    stripPartialListEchoLines,
    ensureThemeCoverage,
    userRequestedSummary,
    looksLikeFileRequest,
    extractEvidenceQueries,
    formatChunkCitationBlock,
    formatEvidenceLineBlock,
    buildCitationMarkerLine,
    appendSourceBlocks,
    formatAttachmentSelectionHelp,
    buildToolDigest
  };
})();
