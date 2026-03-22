/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createRlmRuntimeAnswerOps(ctx) {
    const {
      onThinkingStatus,
      sendMessage,
      buildOllamaOptions,
      looksLikeFileRequest,
      containsAllTerms,
      appendMissingTerms,
      appendSourceBlocks,
      extractEvidenceQueries,
      normalizeQuality,
      getRlmQuality,
      getRlmVerboseTrace,
      executeTool,
      runtimeExceeded,
      markBudgetStop
    } = ctx || {};

    async function rewriteSummary(api, model, summary, preserveTerms = []) {
      onThinkingStatus('RLM: refining summary');
      const rewriteMessages = [
        {
          role: 'system',
          content: [
            'Rewrite the provided deterministic summary into 5-8 concise bullet points.',
            'Use only the provided content.',
            preserveTerms.length > 0 ? `You must preserve these exact terms in output: ${preserveTerms.join(', ')}` : '',
            'Do not ask for files, uploads, links, or additional input.',
            'No markdown code fences.'
          ].filter(Boolean).join('\n')
        },
        {
          role: 'user',
          content: `Deterministic summary:\n${summary}`
        }
      ];
      const rewriteResp = await sendMessage(model, rewriteMessages, buildOllamaOptions());
      const rewritten = String(rewriteResp?.response?.message?.content || '').trim();
      if (rewritten && !looksLikeFileRequest(rewritten)) {
        if (preserveTerms.length === 0 || containsAllTerms(rewritten, preserveTerms)) {
          return rewritten;
        }
      }
      return summary;
    }

    async function verifyAndRepairAnswer(answer, options = {}) {
      const userMessage = String(options.userMessage || '');
      const state = options.state || {};
      const preserveTerms = Array.isArray(options.preserveTerms) ? options.preserveTerms : [];
      const chunkCitations = Array.isArray(options.chunkCitations) ? options.chunkCitations : [];
      const evidence = Array.isArray(options.evidence) ? options.evidence : [];
      const summaryFallback = String(options.summaryFallback || '').trim();
      const preset = options.preset || {};
      const trace = Array.isArray(options.trace) ? options.trace : [];

      let repaired = String(answer || '').trim();
      const maxRepairIterations = Math.max(1, Math.min(3, Number(preset.maxIterations) || 2));
      let lastMissing = [];

      for (let i = 0; i < maxRepairIterations; i += 1) {
        if (looksLikeFileRequest(repaired)) {
          repaired = summaryFallback || repaired;
          trace.push(`verify iter=${i + 1}: replaced file-request style response with deterministic summary`);
        }

        const guardRun = await executeTool({
          tool: 'coverage_guard',
          args: {
            summary: repaired,
            requiredTerms: preserveTerms
          }
        }, userMessage, state);

        const missing = guardRun?.success && Array.isArray(guardRun?.output?.missingTerms)
          ? guardRun.output.missingTerms
          : [];
        lastMissing = missing.slice();

        const needCitationMarkers = (chunkCitations.length > 0 || evidence.length > 0);
        const hasChunkMarkers = /\[chunk_\d+\]/i.test(repaired);
        const hasLineMarkers = /\[line:\d+\]/i.test(repaired);
        const hasAnyMarkers = hasChunkMarkers || hasLineMarkers;
        const citationGap = needCitationMarkers && !hasAnyMarkers;

        const hadMissing = missing.length > 0;
        if (hadMissing) repaired = appendMissingTerms(repaired, missing);
        if (citationGap) repaired = appendSourceBlocks(repaired, chunkCitations, evidence);

        trace.push(`verify iter=${i + 1}: missingTerms=${missing.length} citationGap=${citationGap ? 'yes' : 'no'}`);

        if (!hadMissing && !citationGap) break;
      }

      if (lastMissing.length > 0) repaired = appendMissingTerms(repaired, lastMissing);

      if ((chunkCitations.length > 0 || evidence.length > 0) && !/\[(?:chunk_\d+|line:\d+)\]/i.test(repaired)) {
        repaired = appendSourceBlocks(repaired, chunkCitations, evidence);
      }

      return repaired.trim();
    }

    async function collectEvidenceByQueries(userMessage, state, trace, preset) {
      let queries = [];
      const extracted = await executeTool({
        tool: 'extract_query_terms',
        args: {
          message: userMessage,
          preserveTerms: state.preserveTerms || [],
          maxTerms: Math.max(2, Number(preset.evidenceQueries || 4) * 2)
        }
      }, userMessage, state);
      if (extracted?.success) {
        queries = (Array.isArray(extracted?.output?.terms) ? extracted.output.terms : [])
          .slice(0, Math.max(1, Number(preset.evidenceQueries) || 4));
      }
      if (queries.length === 0) {
        queries = extractEvidenceQueries(userMessage, state.preserveTerms || []).slice(0, Math.max(1, Number(preset.evidenceQueries) || 4));
      }
      const evidence = [];
      const seen = new Set();
      const evidenceBudget = Math.max(1, Number(state?.budgets?.maxEvidenceHits || 40));

      for (let i = 0; i < queries.length; i += 1) {
        if (runtimeExceeded(state)) break;
        if (Number(state?.metrics?.evidenceHits || 0) >= evidenceBudget) {
          markBudgetStop(state, 'max_evidence_hits', `${state.metrics.evidenceHits}/${evidenceBudget}`);
          break;
        }
        const query = String(queries[i] || '').trim();
        if (!query) continue;
        const args = {
          query,
          maxHits: Math.max(1, Math.min(50, Number(preset.evidenceHitsPerQuery) || 3))
        };
        if (state.selectedAttachmentId) args.attachmentId = state.selectedAttachmentId;

        const result = await executeTool({ tool: 'search_attachment', args }, userMessage, state);
        trace.push('#iter:' + (i + 1) + ' search_attachment(query=' + query + ') => ' + (result?.success ? 'ok' : 'error'));
        if (!result?.success) continue;

        const hits = Array.isArray(result?.output?.hits) ? result.output.hits : [];
        for (let h = 0; h < hits.length; h += 1) {
          const hit = hits[h];
          const lineNumber = Number(hit?.lineNumber || 0);
          const line = String(hit?.line || '').trim();
          if (!line || !lineNumber) continue;
          const key = String(lineNumber) + '|' + line.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          evidence.push({ query, lineNumber, line });
          state.metrics.evidenceHits += 1;
          if (state.metrics.evidenceHits >= evidenceBudget) {
            markBudgetStop(state, 'max_evidence_hits', `${state.metrics.evidenceHits}/${evidenceBudget}`);
            break;
          }
          if (evidence.length >= 40) break;
        }
        if (evidence.length >= 40) break;
      }

      return evidence;
    }

    function appendVerboseTrace(trace, boundedStepsLength, evidenceLength, preset) {
      if (getRlmVerboseTrace() === true) {
        trace.push('quality=' + normalizeQuality(getRlmQuality()) + ' plannerSteps=' + boundedStepsLength + ' evidenceQueries=' + Math.max(1, Number(preset.evidenceQueries) || 4) + ' evidenceHits=' + evidenceLength);
      }
    }

    return {
      rewriteSummary,
      verifyAndRepairAnswer,
      collectEvidenceByQueries,
      appendVerboseTrace
    };
  }

  window.PsfRlmCoreRuntimeAnswer = {
    createRlmRuntimeAnswerOps
  };
})();
