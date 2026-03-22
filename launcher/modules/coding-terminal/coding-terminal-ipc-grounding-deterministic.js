/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - Deterministic grounded file intents
 */

function createGroundingDeterministic(deps = {}) {
  const {
    codingTerminalCommon,
    resolver,
    analyzers,
    fs,
    path,
    crypto,
    maxExactFileBytes = 200 * 1024
  } = deps;

  function exactFileAnalysisSource(filePath, lines, content) {
    return {
      id: codingTerminalCommon.generateId(),
      score: 1,
      metadata: {
        filePath,
        startLine: 0,
        endLine: Math.max(0, lines.length - 1),
        text: content.slice(0, 1200),
        retrieval: 'exact-file-analysis'
      }
    };
  }

  async function tryHandleDeterministicFileRequest(message) {
    try {
      const text = String(message || '');
      if (!text.trim()) return null;
      const mentions = resolver.extractFileMentions(text).slice(0, 1);
      if (mentions.length === 0) return null;
      const textLower = text.toLowerCase();
      const explicitFileIntent = /(examine|inspect|analy|analysis|review|show|print|read|content|contents|summari[sz]e|list|quote)\b/i
        .test(textLower);

      const projectPath = codingTerminalCommon.getProject();
      let resolution = projectPath ? resolver.resolveFileMention(projectPath, mentions[0]) : null;
      if (!resolution || !resolution.path) {
        resolution = await resolver.resolveFileMentionFromActiveBucket(mentions[0], {});
      }
      if (!resolution || !resolution.path || resolution.ambiguous) {
        if (explicitFileIntent) {
          const unresolvedCtx = {
            requestedMentions: [mentions[0]],
            resolvedMentions: [],
            unresolvedMentions: [mentions[0]],
            ambiguousMentions: resolution?.ambiguous
              ? [{ mention: mentions[0], candidates: resolution.candidates || [] }]
              : []
          };
          return {
            content: resolver.buildExactFileResolutionError(unresolvedCtx, projectPath),
            sources: []
          };
        }
        return null;
      }

      const filePath = resolution.path;
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > maxExactFileBytes) return null;

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const rel = projectPath
        ? (path.relative(projectPath, filePath) || path.basename(filePath))
        : path.basename(filePath);
      const langForContext = analyzers.languageFromFile(filePath, path);
      const shaForContext = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
      resolver.rememberExactFileContext({
        contextBlock: `# ${rel}\n# sha256:${shaForContext}\n~~~${langForContext}\n${content}\n~~~`,
        sources: [{
          id: codingTerminalCommon.generateId(),
          score: 1,
          metadata: {
            filePath,
            startLine: 0,
            endLine: Math.max(0, lines.length - 1),
            text: content.slice(0, 1200),
            retrieval: 'exact-file-read',
            sha256: shaForContext
          }
        }],
        files: [{
          mention: mentions[0],
          path: filePath,
          relativePath: rel,
          sha256: shaForContext,
          content
        }],
        requestedMentions: [mentions[0]],
        resolvedMentions: [mentions[0]],
        unresolvedMentions: [],
        ambiguousMentions: []
      });

      const summarizeIntent = /\b(summari[sz]e|summary|overview|describe)\b/i.test(text.toLowerCase());
      const functionListIntent = /((list|show|identify|find).*(real|defined|actual)?.*(functions?|methods?)|what functions?)/i.test(text.toLowerCase());
      const variableListIntent = /((list|show|identify|find).*(variables?|constants?)|what (variables?|constants?))/i.test(text.toLowerCase());
      const eventListenerIntent = /((list|show|find|identify).*(event listeners?|addeventlistener|handlers?)|what event listeners?)/i.test(text.toLowerCase());
      const importListIntent = /((list|show|find|identify).*(imports?|dependencies?|requires?|modules?)|what (imports?|dependencies?))/i.test(text.toLowerCase());
      const exactLineIntent = /(quote|show|print).*(first line|line 1|line one|first \d+ lines|first [a-z]+ lines).*(exact|exactly)?/i.test(text);
      const fileReadIntent = /(tell me what (it|this file) says|what does .*?(say|contain)|read( the)? file|show( me)?(?:\s+(?:its|it's|the|this|that|file))?\s+contents?|show( me)?\s+the\s+file|print (the )?(file|contents?)|dump (the )?file)/i.test(text.toLowerCase());

      if (!exactLineIntent && !fileReadIntent && !functionListIntent && !summarizeIntent && !variableListIntent && !eventListenerIntent && !importListIntent) return null;

      if (summarizeIntent) {
        const declaredFunctions = analyzers.extractDeclaredFunctionsFromSource(content);
        const declaredVariables = analyzers.extractDeclaredVariablesFromSource(content);
        const listeners = analyzers.extractEventListenersFromSource(content);
        const listedDeps = analyzers.extractDependenciesFromSource(content);
        const nonEmptyLines = lines.filter((line) => line.trim().length > 0).length;
        const lang = analyzers.languageFromFile(filePath, path) || path.extname(filePath).replace('.', '') || 'text';
        return {
          content: [
            `Exact file summary: ${rel}`,
            `Language: ${lang}`,
            `Lines: ${lines.length} (${nonEmptyLines} non-empty)`,
            `Declared functions: ${declaredFunctions.length}`,
            `Declared variables/constants: ${declaredVariables.length}`,
            `Event listeners: ${listeners.length}`,
            `Imports/dependencies: ${listedDeps.length}`,
            declaredFunctions.length > 0 ? `Function names: ${declaredFunctions.slice(0, 20).join(', ')}` : 'Function names: none',
            listedDeps.length > 0 ? `Dependencies: ${listedDeps.slice(0, 20).map((d) => d.path).join(', ')}` : 'Dependencies: none'
          ].join('\n'),
          sources: [exactFileAnalysisSource(filePath, lines, content)]
        };
      }

      if (functionListIntent) {
        const declared = analyzers.extractDeclaredFunctionsFromSource(content);
        return {
          content: [
            `Exact file analysis: ${rel}`,
            declared.length > 0 ? `Declared functions (${declared.length}):` : 'Declared functions (0):',
            ...(declared.length > 0 ? declared.map((name) => `- ${name}`) : ['- none'])
          ].join('\n'),
          sources: [exactFileAnalysisSource(filePath, lines, content)]
        };
      }

      if (variableListIntent) {
        const declared = analyzers.extractDeclaredVariablesFromSource(content);
        return {
          content: [
            `Exact file analysis: ${rel}`,
            declared.length > 0 ? `Declared variables/constants (${declared.length}):` : 'Declared variables/constants (0):',
            ...(declared.length > 0 ? declared.map((name) => `- ${name}`) : ['- none'])
          ].join('\n'),
          sources: [exactFileAnalysisSource(filePath, lines, content)]
        };
      }

      if (eventListenerIntent) {
        const listeners = analyzers.extractEventListenersFromSource(content);
        return {
          content: [
            `Exact file analysis: ${rel}`,
            listeners.length > 0 ? `Event listeners (${listeners.length}):` : 'Event listeners (0):',
            ...(listeners.length > 0
              ? listeners.map((item) => `- ${item.event} -> ${item.handler}${item.line ? ` at ~line ${item.line}` : ''}`)
              : ['- none'])
          ].join('\n'),
          sources: [exactFileAnalysisSource(filePath, lines, content)]
        };
      }

      if (importListIntent) {
        const listedDeps = analyzers.extractDependenciesFromSource(content);
        return {
          content: [
            `Exact file analysis: ${rel}`,
            listedDeps.length > 0 ? `Imports/dependencies (${listedDeps.length}):` : 'Imports/dependencies (0):',
            ...(listedDeps.length > 0 ? listedDeps.map((dep) => `- ${dep.path} (${dep.kind})`) : ['- none'])
          ].join('\n'),
          sources: [exactFileAnalysisSource(filePath, lines, content)]
        };
      }

      if (exactLineIntent) {
        const lineCount = analyzers.parseRequestedLineCount(text);
        const selected = lines.slice(0, Math.max(1, Math.min(lineCount, 20)));
        return {
          content: [
            `Exact file read: ${rel}`,
            `Quoted line${selected.length > 1 ? 's' : ''} 1-${selected.length}:`,
            ...selected.map((line, i) => `${i + 1}: ${line}`)
          ].join('\n'),
          sources: [{
            id: codingTerminalCommon.generateId(),
            score: 1,
            metadata: {
              filePath,
              startLine: 0,
              endLine: Math.max(0, selected.length - 1),
              text: selected.join('\n'),
              retrieval: 'exact-file-read'
            }
          }]
        };
      }

      const maxLines = Math.min(lines.length, 200);
      const selected = lines.slice(0, maxLines);
      const lang = analyzers.languageFromFile(filePath, path);
      return {
        content: [
          `Exact file read: ${rel}`,
          `Total lines: ${lines.length}`,
          maxLines < lines.length ? `Showing first ${maxLines} lines:` : 'Showing full file:',
          `~~~${lang}`,
          selected.join('\n'),
          '~~~'
        ].join('\n'),
        sources: [{
          id: codingTerminalCommon.generateId(),
          score: 1,
          metadata: {
            filePath,
            startLine: 0,
            endLine: Math.max(0, lines.length - 1),
            text: content.slice(0, 1200),
            retrieval: 'exact-file-read'
          }
        }]
      };
    } catch (err) {
      const fallbackText = String(message || '');
      const fallbackMentions = resolver.extractFileMentions(fallbackText).slice(0, 1);
      const explicitFileIntent = /(examine|inspect|analy|analysis|review|show|print|read|content|contents|summari[sz]e|list|quote)\b/i
        .test(fallbackText.toLowerCase());
      if (explicitFileIntent && fallbackMentions.length > 0) {
        return {
          content:
            `Deterministic file read failed for: ${fallbackMentions.join(', ')}\n` +
            `Reason: ${err?.message || 'Unknown error'}\n` +
            'This request was not forwarded to model generation to prevent hallucinated file contents.',
          sources: []
        };
      }
      return null;
    }
  }

  return {
    tryHandleDeterministicFileRequest
  };
}

module.exports = createGroundingDeterministic;
