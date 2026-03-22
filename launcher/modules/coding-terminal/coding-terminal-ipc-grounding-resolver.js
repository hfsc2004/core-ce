/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Grounding resolver/context memory
 */

function createGroundingResolver(deps = {}) {
  const {
    codingTerminalCommon,
    ragEngine,
    resolveActiveRagBucket,
    fs,
    path,
    crypto,
    analyzers,
    maxExactFileBytes = 200 * 1024,
    exactContextTtlMs = 20 * 60 * 1000
  } = deps;

  let lastExactFileContext = null;

  function extractFileMentions(text) {
    const matches = String(text || '').match(/\b[\w./-]+\.[a-zA-Z0-9]+\b/g) || [];
    const unique = [];
    const seen = new Set();
    for (const m of matches) {
      const key = m.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(m);
    }
    return unique;
  }

  function rememberExactFileContext(ctx) {
    if (!ctx || !Array.isArray(ctx.files) || ctx.files.length === 0) return;
    lastExactFileContext = {
      ...ctx,
      rememberedAt: Date.now()
    };
  }

  function shouldReuseExactFileContext(message) {
    const text = String(message || '').toLowerCase();
    if (!text.trim()) return false;
    if (extractFileMentions(text).length > 0) return false;
    return /(modify|fix|correct|rewrite|update|refactor|patch|change|reprint|print|show).*(code|file|program|version)|print.*(corrected|full file)|corrected version/i.test(text);
  }

  function getReusableExactFileContext(message) {
    if (!lastExactFileContext) return null;
    if (!shouldReuseExactFileContext(message)) return null;
    const ageMs = Date.now() - Number(lastExactFileContext.rememberedAt || 0);
    if (ageMs > exactContextTtlMs) return null;
    return {
      ...lastExactFileContext,
      reusedFromMemory: true
    };
  }

  function isPathInsideProject(candidatePath, projectPath) {
    try {
      const rel = path.relative(projectPath, candidatePath);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    } catch {
      return false;
    }
  }

  function findFilesByBasename(rootDir, basenameLower, maxVisited = 3000, maxMatches = 8) {
    const stack = [rootDir];
    let visited = 0;
    const matches = [];
    while (stack.length > 0 && visited < maxVisited) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        visited++;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build') continue;
          stack.push(full);
          continue;
        }
        if (e.isFile() && e.name.toLowerCase() === basenameLower) {
          matches.push(full);
          if (matches.length >= maxMatches) return matches;
        }
        if (visited >= maxVisited) break;
      }
    }
    return matches;
  }

  function resolveFileMention(projectPath, mention) {
    const normalized = mention.replace(/\\/g, '/');
    const absolute = path.isAbsolute(normalized) ? normalized : '';
    const candidates = [];
    if (absolute) {
      candidates.push(path.normalize(absolute));
    } else {
      candidates.push(path.join(projectPath, normalized));
      candidates.push(path.join(projectPath, path.basename(normalized)));
    }

    for (const c of candidates) {
      if (!isPathInsideProject(c, projectPath)) continue;
      if (fs.existsSync(c)) return { path: c, ambiguous: false, candidates: [c] };
    }

    const target = path.basename(normalized).toLowerCase();
    const found = findFilesByBasename(projectPath, target, 4000, 8);
    if (found.length === 1 && isPathInsideProject(found[0], projectPath)) {
      return { path: found[0], ambiguous: false, candidates: found };
    }
    if (found.length > 1) return { path: null, ambiguous: true, candidates: found };
    return { path: null, ambiguous: false, candidates: [] };
  }

  async function resolveFileMentionFromActiveBucket(mention, options = {}) {
    try {
      const cfg = codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {};
      if (cfg?.ragEnabled === false) {
        return { path: null, ambiguous: false, candidates: [] };
      }
      if (!ragEngine || typeof ragEngine.listSources !== 'function') {
        return { path: null, ambiguous: false, candidates: [] };
      }
      const bucket = resolveActiveRagBucket(options || {});
      const listed = await Promise.race([
        ragEngine.listSources({
          bucketId: bucket.id,
          limit: 5000
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('RAG listSources timeout')), 1500);
        })
      ]);
      const results = Array.isArray(listed?.results) ? listed.results : [];
      if (results.length === 0) return { path: null, ambiguous: false, candidates: [] };

      const filePaths = [...new Set(
        results
          .map((r) => r?.metadata?.filePath)
          .filter((p) => typeof p === 'string' && p.trim().length > 0)
          .filter((p) => fs.existsSync(p))
      )];
      if (filePaths.length === 0) return { path: null, ambiguous: false, candidates: [] };

      const normalizedMention = String(mention || '').replace(/\\/g, '/').toLowerCase();
      const mentionBase = path.basename(normalizedMention);
      const matches = filePaths.filter((p) => {
        const norm = String(p).replace(/\\/g, '/').toLowerCase();
        if (norm.endsWith(`/${normalizedMention}`) || norm === normalizedMention) return true;
        return path.basename(norm) === mentionBase;
      });

      if (matches.length === 1) return { path: matches[0], ambiguous: false, candidates: matches };
      if (matches.length > 1) return { path: null, ambiguous: true, candidates: matches.slice(0, 8) };
      return { path: null, ambiguous: false, candidates: [] };
    } catch {
      return { path: null, ambiguous: false, candidates: [] };
    }
  }

  function emptyExactFileContext() {
    return {
      contextBlock: '',
      sources: [],
      files: [],
      requestedMentions: [],
      resolvedMentions: [],
      unresolvedMentions: [],
      ambiguousMentions: []
    };
  }

  function buildExactFileResolutionError(exactFileContext, projectPath) {
    const missing = exactFileContext.unresolvedMentions || [];
    const ambiguous = exactFileContext.ambiguousMentions || [];

    const parts = [];
    if (missing.length > 0) {
      parts.push(`Couldn't locate: ${missing.join(', ')}`);
    }
    if (ambiguous.length > 0) {
      const lines = ambiguous.map((a) => {
        const previews = a.candidates
          .map((p) => {
            if (projectPath) {
              const rel = path.relative(projectPath, p).replace(/\\/g, '/');
              return rel && !rel.startsWith('..') ? rel : p;
            }
            return p;
          })
          .join(', ');
        return `- ${a.mention}: ${previews}`;
      });
      parts.push(`Ambiguous file names:\n${lines.join('\n')}`);
    }

    if (parts.length === 0) {
      parts.push(`Couldn't locate referenced file(s): ${exactFileContext.requestedMentions.join(', ')}`);
    }
    if (projectPath) {
      parts.push(`Attached project: ${projectPath}`);
      parts.push('Use a more specific relative path (for example: src/checkers.html).');
    } else {
      parts.push('No project folder is attached. File lookup used the active RAG bucket.');
      parts.push('Use a more specific path (for example: src/checkers.html) or attach the project folder.');
    }
    return parts.join('\n');
  }

  async function tryGetExactFileContext(message, projectPath, options = {}) {
    try {
      const mentions = extractFileMentions(message).slice(0, 3);
      if (mentions.length === 0) return emptyExactFileContext();

      const blocks = [];
      const sources = [];
      const files = [];
      const resolvedMentions = [];
      const unresolvedMentions = [];
      const ambiguousMentions = [];
      for (const mention of mentions) {
        let resolution = projectPath ? resolveFileMention(projectPath, mention) : null;
        if ((!resolution || !resolution.path) && options.allowBucketFallback !== false) {
          resolution = await resolveFileMentionFromActiveBucket(mention, options);
        }
        if (!resolution || !resolution.path) {
          unresolvedMentions.push(mention);
          continue;
        }
        if (resolution.ambiguous && Array.isArray(resolution.candidates) && resolution.candidates.length > 1) {
          ambiguousMentions.push({
            mention,
            candidates: resolution.candidates.slice(0, 5)
          });
          continue;
        }
        const resolved = resolution.path;
        const stat = fs.statSync(resolved);
        if (!stat.isFile() || stat.size > maxExactFileBytes) continue;

        const content = fs.readFileSync(resolved, 'utf8');
        const rel = projectPath
          ? (path.relative(projectPath, resolved) || path.basename(resolved))
          : path.basename(resolved);
        const lang = analyzers.languageFromFile(resolved, path);
        const sha = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
        resolvedMentions.push(mention);
        blocks.push(`# ${rel}\n# sha256:${sha}\n~~~${lang}\n${content}\n~~~`);
        files.push({
          mention,
          path: resolved,
          relativePath: rel,
          sha256: sha,
          content
        });
        sources.push({
          id: codingTerminalCommon.generateId(),
          score: 1,
          metadata: {
            filePath: resolved,
            startLine: 0,
            endLine: Math.max(0, content.split('\n').length - 1),
            text: content.slice(0, 1200),
            retrieval: 'exact-file-read',
            sha256: sha
          }
        });
      }

      if (files.length > 0) {
        rememberExactFileContext({
          contextBlock: blocks.join('\n\n'),
          sources,
          files,
          requestedMentions: mentions,
          resolvedMentions,
          unresolvedMentions,
          ambiguousMentions
        });
      }

      return {
        contextBlock: blocks.join('\n\n'),
        sources,
        files,
        requestedMentions: mentions,
        resolvedMentions,
        unresolvedMentions,
        ambiguousMentions
      };
    } catch {
      return emptyExactFileContext();
    }
  }

  return {
    extractFileMentions,
    getReusableExactFileContext,
    buildExactFileResolutionError,
    tryGetExactFileContext,
    resolveFileMention,
    resolveFileMentionFromActiveBucket,
    rememberExactFileContext
  };
}

module.exports = createGroundingResolver;
