/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Grounding analyzers/utilities
 */

function parseRequestedLineCount(text) {
  const s = String(text || '').toLowerCase();
  const numMatch = s.match(/first\s+(\d+)\s+lines?/);
  if (numMatch) return parseInt(numMatch[1], 10);
  if (/first two lines?/.test(s)) return 2;
  if (/first three lines?/.test(s)) return 3;
  if (/first four lines?/.test(s)) return 4;
  if (/first five lines?/.test(s)) return 5;
  return 1;
}

function languageFromFile(filePath, path) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'jsx',
    '.tsx': 'tsx',
    '.html': 'html',
    '.css': 'css',
    '.py': 'python',
    '.json': 'json',
    '.md': 'markdown',
    '.sh': 'bash',
    '.yml': 'yaml',
    '.yaml': 'yaml'
  };
  return map[ext] || '';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDeclaredFunctionsFromSource(content) {
  const text = String(content || '');
  const names = new Set();
  let m;

  const fnDecl = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  while ((m = fnDecl.exec(text)) !== null) names.add(m[1]);

  const arrowOrAssigned = /\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_][A-Za-z0-9_]*\s*=>)/g;
  while ((m = arrowOrAssigned.exec(text)) !== null) names.add(m[1]);

  return [...names];
}

function extractDeclaredVariablesFromSource(content) {
  const text = String(content || '');
  const names = new Set();
  const rx = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m;
  while ((m = rx.exec(text)) !== null) names.add(m[1]);
  return [...names];
}

function lineAtOffset(text, index) {
  const i = Math.max(0, Math.min(Number(index) || 0, String(text || '').length));
  let line = 1;
  for (let p = 0; p < i; p++) {
    if (text[p] === '\n') line++;
  }
  return line;
}

function findTopLevelComma(expr) {
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inString = null;
  let escaped = false;
  const text = String(expr || '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
    else if (ch === ',' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) return i;
  }
  return -1;
}

function extractEventListenersFromSource(content) {
  const text = String(content || '');
  const listeners = [];
  const seen = new Set();
  let m;

  const rx = /\baddEventListener\s*\(\s*(['"`])([a-zA-Z0-9:_-]+)\1\s*,\s*/g;
  while ((m = rx.exec(text)) !== null) {
    const event = String(m[2] || '').toLowerCase();
    const after = text.slice(rx.lastIndex);
    let handler = 'unknown';
    const ident = after.match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (ident) handler = ident[1];
    else if (/^\s*\(/.test(after)) handler = 'inline-arrow';
    else if (/^\s*function\b/.test(after)) handler = 'inline-function';
    const key = `${event}::${handler}`;
    if (!seen.has(key)) {
      seen.add(key);
      listeners.push({ event, handler, line: lineAtOffset(text, m.index) });
    }
  }

  let i = 0;
  while (i < text.length) {
    const p = text.indexOf('.on(', i);
    if (p === -1) break;
    const open = p + 3;
    let depth = 1;
    let q = open + 1;
    while (q < text.length && depth > 0) {
      const ch = text[q];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      q++;
    }
    if (depth !== 0) break;
    const args = text.slice(open + 1, q - 1);
    const firstComma = findTopLevelComma(args);
    if (firstComma > -1) {
      const eventExpr = args.slice(0, firstComma).trim();
      const handlerExpr = args.slice(firstComma + 1).trim();
      const eventMatch = eventExpr.match(/^['"`]([^'"`]+)['"`]$/);
      const event = eventMatch ? String(eventMatch[1]).toLowerCase() : 'unknown';
      let handler = 'unknown';
      const idMatch = handlerExpr.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (idMatch) handler = idMatch[1];
      else if (/^\(/.test(handlerExpr)) handler = 'inline-arrow';
      else if (/^function\b/.test(handlerExpr)) handler = 'inline-function';
      const key = `${event}::${handler}`;
      if (!seen.has(key)) {
        seen.add(key);
        listeners.push({ event, handler, line: lineAtOffset(text, p) });
      }
    }
    i = p + 1;
  }

  const htmlRx = /\bon([a-z]+)\s*=\s*["'][^"']*["']/gi;
  while ((m = htmlRx.exec(text)) !== null) {
    const event = String(m[1] || '').toLowerCase();
    const key = `${event}::inline-html`;
    if (seen.has(key)) continue;
    seen.add(key);
    listeners.push({ event, handler: 'inline-html', line: lineAtOffset(text, m.index) });
  }

  return listeners;
}

function extractDependenciesFromSource(content) {
  const text = String(content || '');
  const listedDeps = [];
  const seen = new Set();
  let m;
  const addDep = (depPath, kind) => {
    const p = String(depPath || '').trim();
    if (!p) return;
    const key = `${p}::${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    listedDeps.push({ path: p, kind });
  };

  const importRx = /\bimport\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  while ((m = importRx.exec(text)) !== null) addDep(m[1], 'import');
  const requireRx = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRx.exec(text)) !== null) addDep(m[1], 'require');
  const dynamicImportRx = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicImportRx.exec(text)) !== null) addDep(m[1], 'dynamic-import');
  const cssImportRx = /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)['"]?\s*\)?/g;
  while ((m = cssImportRx.exec(text)) !== null) addDep(m[1], 'css-import');
  const htmlAssetRx = /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  while ((m = htmlAssetRx.exec(text)) !== null) addDep(m[1], 'html-asset');

  return listedDeps;
}

module.exports = {
  parseRequestedLineCount,
  languageFromFile,
  escapeRegExp,
  extractDeclaredFunctionsFromSource,
  extractDeclaredVariablesFromSource,
  extractEventListenersFromSource,
  extractDependenciesFromSource
};
