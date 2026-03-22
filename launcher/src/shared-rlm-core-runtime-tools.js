/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createRlmRuntimeToolOps(ctx) {
    const {
      getElectronAPI,
      getSessionId,
      onThinkingStatus,
      TOOL_NAMES,
      getPreset,
      uniqueStrings,
      extractHighSignalTerms,
      summarizeChunkText,
      appendMissingTerms,
      cleanSnippet,
      buildSectionAwareItems,
      isEpubLikeText,
      filterNoisyEpubRows,
      extractEpubChapterItems,
      extractPreservedLists,
      filterSectionItemsAgainstPreservedLists,
      ensureThemeCoverage,
      extractEvidenceQueries,
      listTextAttachments,
      resolveAttachmentSelection,
      ensureBudgetState,
      markBudgetStop,
      runtimeExceeded
    } = ctx || {};

    async function deterministicAccumulate(api, items, maxChars) {
      const acc = await api.executeDeterministicTool('accumulate_summaries', {
        items,
        maxChars
      }, {
        surface: 'psf-terminal',
        role: 'rlm'
      }, {
        timeoutMs: 20000
      });
      if (!acc?.success) {
        return { success: false, summary: '', error: acc?.error || 'accumulate_summaries failed' };
      }
      const summary = String(acc?.output?.summary || '').trim();
      return { success: true, summary, output: acc.output || {} };
    }

    async function recursiveMapReduceSummary(api, items, maxChars, preset, trace, state) {
      const cleaned = uniqueStrings((Array.isArray(items) ? items : []).map((v) => String(v || '').trim()).filter(Boolean));
      const threshold = Math.max(4, Number(preset?.recursiveThresholdItems) || 16);
      const batchSize = Math.max(2, Number(preset?.recursiveBatchSize) || 5);
      const policyDepth = Math.max(1, Number(preset?.recursiveMaxDepth) || 3);
      const budgetDepth = Math.max(1, Number(state?.budgets?.maxRecursionDepth || policyDepth));
      const maxDepth = Math.min(policyDepth, budgetDepth);
      if (policyDepth > maxDepth) {
        markBudgetStop(state, 'max_recursion_depth', `${maxDepth}/${policyDepth}`);
      }

      if (cleaned.length === 0) {
        return {
          success: true,
          summary: '',
          meta: { strategy: 'empty', depth: 0, batches: 0, leaves: 0, retries: 0 }
        };
      }

      if (cleaned.length < threshold) {
        const direct = await deterministicAccumulate(api, cleaned, maxChars);
        return {
          success: !!direct?.success,
          summary: String(direct?.summary || ''),
          meta: { strategy: 'direct', depth: 0, batches: 1, leaves: cleaned.length, retries: 0 },
          error: direct?.success ? null : direct?.error
        };
      }

      let current = cleaned.slice();
      let depth = 0;
      let batches = 0;
      let retries = 0;

      while (current.length > 1 && depth < maxDepth) {
        if (runtimeExceeded(state)) break;
        depth += 1;
        const reduced = [];
        const levelBatches = [];
        for (let i = 0; i < current.length; i += batchSize) {
          const batch = current.slice(i, i + batchSize);
          batches += 1;
          levelBatches.push(batch.length);
          let partial = await deterministicAccumulate(api, batch, Math.max(250, Math.floor(maxChars * 0.8)));
          if (!partial?.success || !partial.summary) {
            retries += 1;
            const retryBatch = batch.slice(0, Math.max(1, Math.floor(batch.length / 2)));
            partial = await deterministicAccumulate(api, retryBatch, Math.max(200, Math.floor(maxChars * 0.6)));
          }
          if (!partial?.success || !partial.summary) {
            partial = { success: true, summary: batch.join(' ').slice(0, Math.max(160, Math.floor(maxChars * 0.5))) };
          }
          reduced.push(String(partial.summary || '').trim());
        }
        if (Array.isArray(trace)) {
          trace.push(`map-reduce depth=${depth} batches=${levelBatches.join(',')} -> ${reduced.length} node(s)`);
        }
        current = uniqueStrings(reduced.filter(Boolean));
        if (current.length === 0) break;
      }

      const finalAcc = await deterministicAccumulate(api, current, maxChars);
      if (!finalAcc?.success || !finalAcc.summary) {
        return {
          success: false,
          summary: '',
          error: finalAcc?.error || 'recursive final accumulate failed',
          meta: { strategy: 'map-reduce', depth, batches, leaves: cleaned.length, retries }
        };
      }

      return {
        success: true,
        summary: finalAcc.summary,
        meta: { strategy: 'map-reduce', depth, batches, leaves: cleaned.length, retries }
      };
    }

    async function executeTool(step, userMessage, state) {
      const api = getElectronAPI();
      const tool = String(step?.tool || '').trim();
      const args = (step && typeof step.args === 'object' && step.args) ? step.args : {};
      const sessionId = getSessionId();
      const preset = getPreset();
      ensureBudgetState(state);

      if (!TOOL_NAMES.includes(tool)) {
        return { success: false, error: `Unsupported tool: ${tool}` };
      }
      if (runtimeExceeded(state)) {
        return { success: false, error: 'RLM budget reached: max_runtime_ms', budgetStop: true, stopReason: 'max_runtime_ms' };
      }
      if (Number(state.metrics.toolCalls || 0) >= Number(state.budgets?.maxToolCalls || 0)) {
        markBudgetStop(state, 'max_tool_calls', `${state.metrics.toolCalls}/${state.budgets.maxToolCalls}`);
        return { success: false, error: 'RLM budget reached: max_tool_calls', budgetStop: true, stopReason: 'max_tool_calls' };
      }
      state.metrics.toolCalls += 1;
      onThinkingStatus(`RLM: ${tool.replace('_', ' ')}`);

      if (tool === 'list_attachments') {
        const items = await listTextAttachments(api, sessionId);
        return {
          success: true,
          tool,
          output: {
            count: items.length,
            attachments: items.map((a) => ({
              id: a.id,
              scopedId: a.scopedId,
              sourceSessionId: a.sourceSessionId,
              displayName: a.displayName,
              sizeBytes: a.sizeBytes,
              textExtractable: !!a.textExtractable
            }))
          }
        };
      }

      if (tool === 'read_attachment') {
        const resolved = await resolveAttachmentSelection(api, sessionId, args, userMessage);
        if (!resolved.ok) {
          return {
            success: false,
            error: resolved.error,
            needsAttachmentSelection: resolved.ambiguous === true,
            output: { attachments: (resolved.items || []).map((a) => ({ id: a.id, displayName: a.displayName })) }
          };
        }
        const attachmentId = String(resolved.attachment.id || '').trim();
        const sourceSessionId = String(resolved.attachment.sourceSessionId || sessionId).trim() || sessionId;
        const offset = Math.max(0, Number(args.offset) || 0);
        const length = Math.max(0, Number(args.length) || 12000);
        const read = await api.terminalAttachmentsReadText({
          sessionId: sourceSessionId,
          attachmentId,
          offset,
          length,
          maxBytes: Math.max(16 * 1024, Number(args.maxBytes) || 768 * 1024)
        });
        if (!read || read.success === false) {
          return { success: false, error: read?.error || 'Failed to read attachment' };
        }
        state.selectedAttachmentId = attachmentId;
        state.selectedAttachmentSessionId = sourceSessionId;
        state.lastText = String(read.text || '');
        return {
          success: true,
          tool,
          output: {
            attachmentId,
            sourceSessionId,
            offset,
            length,
            textLength: read.textLength,
            text: state.lastText
          }
        };
      }

      if (tool === 'search_attachment') {
        const resolved = await resolveAttachmentSelection(api, sessionId, args, userMessage);
        if (!resolved.ok) {
          return {
            success: false,
            error: resolved.error,
            needsAttachmentSelection: resolved.ambiguous === true,
            output: { attachments: (resolved.items || []).map((a) => ({ id: a.id, displayName: a.displayName })) }
          };
        }
        const attachmentId = String(resolved.attachment.id || '').trim();
        const sourceSessionId = String(resolved.attachment.sourceSessionId || sessionId).trim() || sessionId;
        const query = String(args.query || userMessage || '').trim();
        if (!query) return { success: false, error: 'search_attachment requires query' };
        const read = await api.terminalAttachmentsReadText({
          sessionId: sourceSessionId,
          attachmentId,
          maxBytes: Math.max(32 * 1024, Number(args.maxBytes) || 1024 * 1024)
        });
        if (!read || read.success === false) {
          return { success: false, error: read?.error || 'Failed to read attachment for search' };
        }
        state.selectedAttachmentId = attachmentId;
        state.selectedAttachmentSessionId = sourceSessionId;
        state.lastText = String(read.text || '');
        const maxHits = Math.max(1, Math.min(200, Number(args.maxHits) || 25));
        const toolRun = await api.executeDeterministicTool('find_lines', {
          text: state.lastText,
          query,
          maxHits,
          caseSensitive: args.caseSensitive === true
        }, {
          surface: 'psf-terminal',
          role: 'rlm'
        }, {
          timeoutMs: 20000
        });
        return {
          success: !!toolRun?.success,
          tool,
          output: toolRun?.output || null,
          error: toolRun?.success ? null : (toolRun?.error || 'search tool failed')
        };
      }

      if (tool === 'extract_query_terms') {
        const toolRun = await api.executeDeterministicTool('extract_query_terms', {
          message: String(args.message || userMessage || ''),
          preserveTerms: Array.isArray(args.preserveTerms) ? args.preserveTerms : [],
          maxTerms: Math.max(1, Math.min(50, Number(args.maxTerms) || 12))
        }, {
          surface: 'psf-terminal',
          role: 'rlm'
        }, {
          timeoutMs: 20000
        });
        return {
          success: !!toolRun?.success,
          tool,
          output: toolRun?.output || null,
          error: toolRun?.success ? null : (toolRun?.error || 'extract_query_terms failed')
        };
      }

      if (tool === 'rank_chunks_by_terms') {
        const toolRun = await api.executeDeterministicTool('rank_chunks_by_terms', {
          chunks: Array.isArray(args.chunks) ? args.chunks : [],
          terms: Array.isArray(args.terms) ? args.terms : [],
          maxChunks: Math.max(1, Math.min(200, Number(args.maxChunks) || 20))
        }, {
          surface: 'psf-terminal',
          role: 'rlm'
        }, {
          timeoutMs: 25000
        });
        return {
          success: !!toolRun?.success,
          tool,
          output: toolRun?.output || null,
          error: toolRun?.success ? null : (toolRun?.error || 'rank_chunks_by_terms failed')
        };
      }

      if (tool === 'coverage_guard') {
        const toolRun = await api.executeDeterministicTool('coverage_guard', {
          summary: String(args.summary || ''),
          requiredTerms: Array.isArray(args.requiredTerms) ? args.requiredTerms : []
        }, {
          surface: 'psf-terminal',
          role: 'rlm'
        }, {
          timeoutMs: 15000
        });
        return {
          success: !!toolRun?.success,
          tool,
          output: toolRun?.output || null,
          error: toolRun?.success ? null : (toolRun?.error || 'coverage_guard failed')
        };
      }

      if (tool === 'summarize_text') {
        let text = String(args.text || '').trim();
        if (!text && state.lastText) text = String(state.lastText || '').trim();

        if (!text) {
          const resolved = await resolveAttachmentSelection(api, sessionId, args, userMessage);
          if (!resolved.ok) {
            return {
              success: false,
              error: resolved.error,
              needsAttachmentSelection: resolved.ambiguous === true,
              output: { attachments: (resolved.items || []).map((a) => ({ id: a.id, displayName: a.displayName })) }
            };
          }
          state.selectedAttachmentId = String(resolved.attachment.id || '').trim();
          state.selectedAttachmentSessionId = String(resolved.attachment.sourceSessionId || sessionId).trim() || sessionId;
          const read = await api.terminalAttachmentsReadText({
            sessionId: state.selectedAttachmentSessionId,
            attachmentId: state.selectedAttachmentId,
            maxBytes: Math.max(64 * 1024, Number(args.maxBytes) || 2 * 1024 * 1024)
          });
          if (read && read.success !== false) {
            text = String(read.text || '');
            state.lastText = text;
          }
        }

        if (!text) return { success: false, error: 'summarize_text requires text or attachmentId' };
        const highSignalTerms = extractHighSignalTerms(text);
        const preserveTerms = uniqueStrings([...(state.preserveTerms || []), ...highSignalTerms]).slice(0, 20);
        const preservedListBlocks = extractPreservedLists(text);

        const preset = getPreset();
        const chunkRun = await api.executeDeterministicTool('chunk_text', {
          text,
          chunkSize: Math.max(400, Math.min(3000, Number(args.chunkSize) || preset.summaryChunkSize)),
          overlap: Math.max(0, Math.min(600, Number(args.overlap) || preset.summaryOverlap))
        }, {
          surface: 'psf-terminal',
          role: 'rlm'
        }, {
          timeoutMs: 20000
        });
        if (!chunkRun?.success) {
          return { success: false, error: chunkRun?.error || 'chunk_text failed' };
        }

        const chunks = Array.isArray(chunkRun.output?.chunks) ? chunkRun.output.chunks : [];
        const maxSteps = Math.max(1, Math.min(60, Number(args.maxSteps) || preset.summaryMaxSteps));
        const rankingSeedTerms = uniqueStrings([
          ...preserveTerms,
          ...extractEvidenceQueries(userMessage, preserveTerms)
        ]).slice(0, 24);
        let usedChunks = chunks.slice(0, maxSteps);
        if (chunks.length > 0 && rankingSeedTerms.length > 0) {
          const rankRun = await executeTool({
            tool: 'rank_chunks_by_terms',
            args: {
              chunks,
              terms: rankingSeedTerms,
              maxChunks: maxSteps
            }
          }, userMessage, state);
          if (rankRun?.success) {
            const ranked = Array.isArray(rankRun?.output?.ranked) ? rankRun.output.ranked : [];
            if (ranked.length > 0) {
              usedChunks = ranked.slice(0, maxSteps).map((c, idx) => ({
                index: Number(c?.index || idx),
                start: Number(c?.start || 0),
                end: Number(c?.end || 0),
                text: String(c?.text || '')
              }));
            }
          }
        }
        const chunkBudget = Math.max(1, Number(state?.budgets?.maxChunksProcessed || usedChunks.length || 1));
        const remainingChunkBudget = Math.max(0, chunkBudget - Number(state?.metrics?.chunksProcessed || 0));
        if (remainingChunkBudget <= 0) {
          markBudgetStop(state, 'max_chunks_processed', `${state.metrics.chunksProcessed}/${chunkBudget}`);
          return { success: false, error: 'RLM budget reached: max_chunks_processed', budgetStop: true, stopReason: 'max_chunks_processed' };
        }
        if (usedChunks.length > remainingChunkBudget) {
          usedChunks = usedChunks.slice(0, remainingChunkBudget);
          markBudgetStop(state, 'max_chunks_processed', `${state.metrics.chunksProcessed + usedChunks.length}/${chunkBudget}`);
        }
        state.metrics.chunksProcessed += usedChunks.length;
        const chunkCitations = usedChunks.slice(0, 40).map((c) => ({
          id: 'chunk_' + (Number(c?.index || 0) + 1),
          index: Number(c?.index || 0) + 1,
          start: Number(c?.start || 0),
          end: Number(c?.end || 0),
          snippet: cleanSnippet(c?.text || '', 160)
        }));
        const lines = usedChunks
          .map((c, idx) => {
            const concise = summarizeChunkText(c?.text || '', 280);
            if (!concise) return '';
            return `${idx + 1}. ${concise}`;
          })
          .filter(Boolean);
        const sectionItems = buildSectionAwareItems(text);
        const epubChapterItems = extractEpubChapterItems(text);
        const filteredSectionItems = filterNoisyEpubRows(
          filterSectionItemsAgainstPreservedLists(sectionItems, preservedListBlocks)
        );
        const isLongDocument = chunks.length >= 8;
        const epubMode = isEpubLikeText(text) && epubChapterItems.length > 0;
        const summaryItems = epubMode
          ? uniqueStrings([...epubChapterItems, ...filteredSectionItems]).slice(0, 80)
          : (isLongDocument
            ? uniqueStrings([...epubChapterItems, ...filteredSectionItems, ...lines]).slice(0, 100)
            : (filteredSectionItems.length > 0 ? filteredSectionItems : lines));

        const maxChars = Math.max(400, Math.min(15000, Number(args.maxChars) || preset.summaryMaxChars));
        const recursive = await recursiveMapReduceSummary(api, summaryItems, maxChars, preset, state.trace, state);
        if (!recursive?.success) {
          return { success: false, error: recursive?.error || 'recursive summary failed' };
        }
        let summaryText = String(recursive?.summary || '').trim();
        summaryText = ensureThemeCoverage(summaryText, text, preserveTerms, preservedListBlocks);
        const guardRun = await executeTool({
          tool: 'coverage_guard',
          args: {
            summary: summaryText,
            requiredTerms: preserveTerms
          }
        }, userMessage, state);
        if (guardRun?.success) {
          const missing = Array.isArray(guardRun?.output?.missingTerms) ? guardRun.output.missingTerms : [];
          if (missing.length > 0) {
            summaryText = appendMissingTerms(summaryText, missing);
          }
        }

        return {
          success: true,
          tool,
          output: {
            summary: summaryText,
            preservedTerms: preserveTerms,
            preservedListBlocks,
            recursive: recursive?.meta || null,
            coverage: {
              processedChunks: usedChunks.length,
              totalChunks: chunks.length,
              processedRatio: chunks.length > 0 ? usedChunks.length / chunks.length : 0,
              truncatedByStepLimit: chunks.length > usedChunks.length
            },
            detailLevel: isLongDocument ? 'long-doc' : 'standard',
            chunkCitations
          },
          error: null
        };
      }

      return { success: false, error: `Tool not implemented: ${tool}` };
    }

    return {
      executeTool
    };
  }

  window.PsfRlmCoreRuntimeTools = {
    createRlmRuntimeToolOps
  };
})();
