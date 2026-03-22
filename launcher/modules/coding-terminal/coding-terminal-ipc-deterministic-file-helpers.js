/**
 * Coding Terminal deterministic file/fix helpers.
 */
'use strict';

function createDeterministicFileHelpers(deps = {}) {
  const fs = deps.fs;
  const path = deps.path;
  const isDeterministicIntegrationFixRequest = typeof deps.isDeterministicIntegrationFixRequest === 'function'
    ? deps.isDeterministicIntegrationFixRequest
    : () => false;

  function extractLinkedFilenamesFromContext(text) {
    const raw = String(text || '');
    if (!raw) return [];
    const out = [];
    const seen = new Set();
    const linkRe = /(href|src)\s*=\s*["']([^"']+)["']/gi;
    let match;
    while ((match = linkRe.exec(raw)) !== null) {
      const value = String(match[2] || '').trim();
      if (!value || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) continue;
      const file = value.split(/[?#]/)[0];
      const base = path.basename(file);
      if (!base || seen.has(base)) continue;
      seen.add(base);
      out.push(base);
    }
    return out;
  }

  function buildProjectRootFileEvidence({ projectPath, exactFileContext = null } = {}) {
    try {
      const root = String(projectPath || '').trim();
      if (!root || !fs.existsSync(root)) return '';
      const entries = fs.readdirSync(root, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 300);

      const linkedNames = extractLinkedFilenamesFromContext(exactFileContext?.contextBlock || '').slice(0, 50);
      const linkedEvidence = linkedNames.length > 0
        ? `Linked filenames extracted from target file: ${linkedNames.join(', ')}\n`
        : '';

      return (
        'Project-root filename verification evidence is provided below. ' +
        'For link/reference checks, compare linked filenames against this exact file list. ' +
        'Do NOT assume files exist unless listed.\n\n' +
        linkedEvidence +
        `Project root: ${root}\n` +
        `Top-level files (${files.length}): ${files.join(', ') || '(none)'}`
      );
    } catch {
      return '';
    }
  }

  function suggestClosestFilename(name, byLower) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const parsed = path.parse(raw);
    const base = parsed.name || raw;
    const ext = parsed.ext || '';

    const candidates = [
      `${base}s${ext}`,
      base.endsWith('s') ? `${base.slice(0, -1)}${ext}` : ''
    ].filter(Boolean);

    for (const c of candidates) {
      const hit = byLower.get(c.toLowerCase());
      if (hit) return hit;
    }
    return '';
  }

  function buildDeterministicProjectFilenameVerification({ projectPath, exactFileContext = null } = {}) {
    try {
      const root = String(projectPath || '').trim();
      if (!root || !fs.existsSync(root)) return null;
      const contextBlock = String(exactFileContext?.contextBlock || '');
      if (!contextBlock) return null;

      const linked = extractLinkedFilenamesFromContext(contextBlock);
      if (!linked.length) {
        return {
          content: 'PASS',
          sources: exactFileContext?.sources || []
        };
      }

      const entries = fs.readdirSync(root, { withFileTypes: true });
      const rootFiles = entries.filter((e) => e.isFile()).map((e) => e.name);
      const byLower = new Map(rootFiles.map((f) => [String(f).toLowerCase(), f]));
      const mismatches = [];

      for (const linkedName of linked) {
        const direct = byLower.get(linkedName.toLowerCase());
        if (direct) continue;
        const suggestion = suggestClosestFilename(linkedName, byLower);
        if (suggestion) {
          mismatches.push(`${linkedName} should be ${suggestion}`);
        } else {
          mismatches.push(`${linkedName} is missing in project root`);
        }
      }

      if (!mismatches.length) {
        return {
          content: 'PASS',
          sources: exactFileContext?.sources || []
        };
      }
      return {
        content: `Mismatches found:\n\n${mismatches.join('\n')}`,
        sources: exactFileContext?.sources || []
      };
    } catch {
      return null;
    }
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

  function extractExplicitReplacementsFromPrompt(text) {
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

  function getAuthoritativeSourceFromExactContext(exactFileContext) {
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

  function getAuthoritativeRelativePath(exactFileContext) {
    const files = Array.isArray(exactFileContext?.files) ? exactFileContext.files : [];
    if (files.length === 1) {
      return String(files[0]?.relativePath || files[0]?.path || '').trim();
    }
    const contextBlock = String(exactFileContext?.contextBlock || '');
    if (!contextBlock) return '';
    const head = contextBlock.match(/^#\s+([^\n]+)$/m);
    return head ? String(head[1] || '').trim() : '';
  }

  function languageFromFilename(filePath) {
    const ext = path.extname(String(filePath || '').toLowerCase());
    switch (ext) {
      case '.html': return 'html';
      case '.css': return 'css';
      case '.js': return 'javascript';
      case '.ts': return 'typescript';
      case '.json': return 'json';
      case '.md': return 'markdown';
      case '.py': return 'python';
      case '.sh': return 'bash';
      default: return 'text';
    }
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function replaceLinkedFilenameInAttrs(input, currentName, nextName) {
    const text = String(input || '');
    const current = String(currentName || '').trim();
    const next = String(nextName || '').trim();
    if (!text || !current || !next || current === next) return text;
    const re = new RegExp(`((?:href|src)\\s*=\\s*["'][^"']*)${escapeRegExp(current)}((?:[?#][^"']*)?["'])`, 'gi');
    return text.replace(re, `$1${next}$2`);
  }

  function inferExpectedElementIdFromProjectRoot(projectPath) {
    try {
      const root = String(projectPath || '').trim();
      if (!root || !fs.existsSync(root)) return '';
      const entries = fs.readdirSync(root, { withFileTypes: true });
      const jsFiles = entries
        .filter((e) => e.isFile() && String(e.name || '').toLowerCase().endsWith('.js'))
        .map((e) => path.join(root, e.name))
        .slice(0, 20);
      if (!jsFiles.length) return '';
      const ids = new Map();
      for (const filePath of jsFiles) {
        let content = '';
        try {
          content = fs.readFileSync(filePath, 'utf8');
        } catch {
          continue;
        }
        const re = /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
        let m;
        while ((m = re.exec(content)) !== null) {
          const id = String(m[1] || '').trim();
          if (!id) continue;
          ids.set(id, (ids.get(id) || 0) + 1);
          if (ids.size > 50) break;
        }
      }
      if (!ids.size) return '';
      const ranked = Array.from(ids.entries()).sort((a, b) => b[1] - a[1]);
      return String(ranked[0]?.[0] || '').trim();
    } catch {
      return '';
    }
  }

  function buildDeterministicReplacementApply({ message, exactFileContext = null } = {}) {
    try {
      const replacements = extractExplicitReplacementsFromPrompt(message);
      if (!replacements.length) return null;
      const source = getAuthoritativeSourceFromExactContext(exactFileContext);
      if (!source) return null;

      let appliedAny = false;
      let output = source;
      for (const pair of replacements) {
        if (!pair.oldValue || !pair.newValue) continue;
        if (output.includes(pair.oldValue)) appliedAny = true;
        output = output.split(pair.oldValue).join(pair.newValue);
      }
      if (!appliedAny) return null;

      const rel = getAuthoritativeRelativePath(exactFileContext);
      const lang = languageFromFilename(rel || '');
      return {
        content: `~~~${lang}\n${output}\n~~~`,
        sources: exactFileContext?.sources || []
      };
    } catch {
      return null;
    }
  }

  function buildDeterministicIntegrationFixApply({ message, projectPath, exactFileContext = null } = {}) {
    try {
      if (!isDeterministicIntegrationFixRequest(message)) return null;
      const rel = getAuthoritativeRelativePath(exactFileContext);
      const ext = path.extname(String(rel || '').toLowerCase());
      if (ext !== '.html' && ext !== '.htm') return null;

      const source = getAuthoritativeSourceFromExactContext(exactFileContext);
      if (!source) return null;

      let output = source;
      let changed = false;
      const lowerPrompt = String(message || '').toLowerCase();
      const wantsEncoding = /encoding|charset|integration issues?/i.test(lowerPrompt);
      const wantsViewport = /viewport|device-?width|whdth|integration issues?/i.test(lowerPrompt);
      const wantsFileRefs = /file refs?|file references?|linked filenames?|integration issues?/i.test(lowerPrompt);
      const wantsId = /\bid\b|element id|integration issues?/i.test(lowerPrompt);

      if (wantsEncoding) {
        const updated = output
          .replace(/(<meta[^>]*charset\s*=\s*["'])\s*utf-?16(\s*["'][^>]*>)/ig, '$1UTF-8$2')
          .replace(/(<meta[^>]*charset\s*=\s*)utf-?16(\b[^>]*>)/ig, '$1UTF-8$2');
        if (updated !== output) changed = true;
        output = updated;
      }

      if (wantsViewport) {
        const updated = output
          .replace(/device-whdth/ig, 'device-width')
          .replace(/devicewidth/ig, 'device-width');
        if (updated !== output) changed = true;
        output = updated;
      }

      if (wantsFileRefs) {
        const root = String(projectPath || '').trim();
        if (root && fs.existsSync(root)) {
          const entries = fs.readdirSync(root, { withFileTypes: true });
          const rootFiles = entries.filter((e) => e.isFile()).map((e) => e.name);
          const byLower = new Map(rootFiles.map((f) => [String(f).toLowerCase(), f]));
          const linked = extractLinkedFilenamesFromContext(output);
          for (const linkedName of linked) {
            if (byLower.has(linkedName.toLowerCase())) continue;
            const suggestion = suggestClosestFilename(linkedName, byLower);
            if (!suggestion) continue;
            const updated = replaceLinkedFilenameInAttrs(output, linkedName, suggestion);
            if (updated !== output) changed = true;
            output = updated;
          }
        }
      }

      if (wantsId) {
        const expectedId = inferExpectedElementIdFromProjectRoot(projectPath);
        if (expectedId) {
          const htmlIds = [];
          const idRe = /\bid\s*=\s*["']([^"']+)["']/gi;
          let m;
          while ((m = idRe.exec(output)) !== null) {
            htmlIds.push(String(m[1] || '').trim());
            if (htmlIds.length >= 50) break;
          }
          if (htmlIds.length === 1 && htmlIds[0] && htmlIds[0] !== expectedId) {
            const actual = htmlIds[0];
            const updated = output.replace(
              new RegExp(`(\\bid\\s*=\\s*["'])${escapeRegExp(actual)}(["'])`, 'i'),
              `$1${expectedId}$2`
            );
            if (updated !== output) changed = true;
            output = updated;
          }
        }
      }

      if (!changed) return null;
      const lang = languageFromFilename(rel || '');
      return {
        content: `~~~${lang}\n${output}\n~~~`,
        sources: exactFileContext?.sources || []
      };
    } catch {
      return null;
    }
  }

  return {
    extractLinkedFilenamesFromContext,
    buildProjectRootFileEvidence,
    buildDeterministicProjectFilenameVerification,
    buildDeterministicReplacementApply,
    buildDeterministicIntegrationFixApply,
    languageFromFilename
  };
}

module.exports = createDeterministicFileHelpers;
