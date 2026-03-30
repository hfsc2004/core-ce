/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

let cachedPdfParse = undefined;

function getOptionalPdfParse() {
  if (cachedPdfParse !== undefined) return cachedPdfParse;
  try {
    // eslint-disable-next-line global-require
    cachedPdfParse = require('pdf-parse');
  } catch (_) {
    cachedPdfParse = null;
  }
  return cachedPdfParse;
}

async function extractPdfTextWithPdfParse(filePath, fsp) {
  const pdfParse = getOptionalPdfParse();
  if (!pdfParse) return null;
  const data = await fsp.readFile(filePath);
  const parsed = await pdfParse(data);
  const text = String(parsed?.text || '').replace(/\f/g, '\n\n');
  return text;
}

async function extractPdfTextWithPdftotext(filePath) {
  const args = ['-enc', 'UTF-8', '-layout', filePath, '-'];
  const { stdout } = await execFileAsync('pdftotext', args, {
    maxBuffer: 24 * 1024 * 1024
  });
  return String(stdout || '').replace(/\f/g, '\n\n');
}

async function extractPdfText(filePath, fsp) {
  try {
    const byLib = await extractPdfTextWithPdfParse(filePath, fsp);
    if (byLib && byLib.trim()) return byLib;
  } catch (_) {}

  try {
    const byTool = await extractPdfTextWithPdftotext(filePath);
    if (byTool && byTool.trim()) return byTool;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error('PDF extraction requires either npm package "pdf-parse" or system tool "pdftotext".');
    }
    throw new Error(`PDF extraction failed: ${err.message || err}`);
  }

  return '';
}

function decodeBasicHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripMarkupToText(markup) {
  return decodeBasicHtmlEntities(
    String(markup || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

async function listZipEntries(filePath) {
  const { stdout } = await execFileAsync('unzip', ['-Z1', filePath], {
    maxBuffer: 8 * 1024 * 1024
  });
  return String(stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function scoreEpubEntryName(name) {
  const lower = String(name || '').toLowerCase();
  let score = 0;
  if (lower.includes('toc') || lower.includes('nav')) score -= 5;
  if (lower.includes('title') || lower.includes('cover')) score -= 3;
  if (lower.includes('chapter') || lower.includes('ch')) score += 3;
  if (/\d+/.test(lower)) score += 1;
  return score;
}

async function extractEpubText(filePath) {
  let entries;
  try {
    entries = await listZipEntries(filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error('EPUB extraction requires system tool "unzip".');
    }
    throw new Error(`EPUB listing failed: ${err.message || err}`);
  }

  const textEntries = entries
    .filter((name) => /\.(xhtml|html|htm|xml)$/i.test(name))
    .sort((a, b) => {
      const sa = scoreEpubEntryName(a);
      const sb = scoreEpubEntryName(b);
      if (sa !== sb) return sb - sa;
      return a.localeCompare(b);
    })
    .slice(0, 200);

  if (textEntries.length === 0) return '';

  const chunks = [];
  let totalChars = 0;
  const maxChars = 2_000_000;
  for (const entry of textEntries) {
    try {
      const { stdout } = await execFileAsync('unzip', ['-p', filePath, entry], {
        maxBuffer: 24 * 1024 * 1024
      });
      const plain = stripMarkupToText(stdout);
      if (!plain) continue;
      const labeled = `${entry}\n${plain}`;
      chunks.push(labeled);
      totalChars += labeled.length;
      if (totalChars >= maxChars) break;
    } catch (_) {}
  }

  return chunks.join('\n\n');
}

function isOfficeXmlLikeEntry(name) {
  const lower = String(name || '').toLowerCase();
  if (!/\.xml$/i.test(lower)) return false;
  if (lower.includes('rels') || lower.includes('_rels')) return false;
  if (lower.includes('styles') || lower.includes('theme')) return false;
  if (lower.includes('font') || lower.includes('settings')) return false;
  return (
    lower.includes('word/document') ||
    lower.includes('word/footnotes') ||
    lower.includes('word/endnotes') ||
    lower.includes('xl/sharedstrings') ||
    lower.includes('xl/worksheets') ||
    lower.includes('ppt/slides/slide') ||
    lower.includes('content.xml')
  );
}

async function extractOfficeXmlText(filePath) {
  let entries;
  try {
    entries = await listZipEntries(filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error('Office/OpenDocument extraction requires system tool "unzip".');
    }
    throw new Error('Office/OpenDocument listing failed: ' + (err.message || err));
  }

  const xmlEntries = entries
    .filter((name) => isOfficeXmlLikeEntry(name))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 500);

  if (xmlEntries.length === 0) return '';

  const chunks = [];
  let totalChars = 0;
  const maxChars = 2_000_000;
  for (const entry of xmlEntries) {
    try {
      const out = await execFileAsync('unzip', ['-p', filePath, entry], {
        maxBuffer: 24 * 1024 * 1024
      });
      const plain = stripMarkupToText(out.stdout);
      if (!plain) continue;
      const labeled = entry + '\n' + plain;
      chunks.push(labeled);
      totalChars += labeled.length;
      if (totalChars >= maxChars) break;
    } catch (_) {}
  }

  return chunks.join('\n\n');
}

async function extractLegacyOfficeText(filePath) {
  const probes = [
    { cmd: 'catdoc', args: [filePath] },
    { cmd: 'antiword', args: [filePath] },
    { cmd: 'catppt', args: [filePath] },
    { cmd: 'xls2csv', args: [filePath] },
    { cmd: 'strings', args: ['-n', '4', filePath] }
  ];

  let sawEnoent = false;
  for (const probe of probes) {
    try {
      const out = await execFileAsync(probe.cmd, probe.args, { maxBuffer: 24 * 1024 * 1024 });
      const text = String(out.stdout || '').replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) return text;
    } catch (err) {
      if (err && err.code === 'ENOENT') sawEnoent = true;
    }
  }

  if (sawEnoent) {
    throw new Error('Legacy Office extraction requires one of: catdoc, antiword, catppt, xls2csv, or strings.');
  }
  return '';
}

async function extractOfficeText(filePath, ext) {
  if (ext === '.doc' || ext === '.xls' || ext === '.ppt') {
    return extractLegacyOfficeText(filePath);
  }
  return extractOfficeXmlText(filePath);
}

module.exports = {
  extractPdfText,
  extractEpubText,
  extractOfficeText
};
