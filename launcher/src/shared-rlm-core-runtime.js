/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
(function() {
  'use strict';

  function createRlmCoreRuntime(ctx) {
    const {
      getElectronAPI,
      getSessionId,
      getModelName,
      buildOllamaOptions,
      sendMessage,
      getRlmVerboseTrace,
      getRlmQuality,
      getIncludeSharedAttachments,
      getSharedAttachmentSessionId,
      onThinkingStatus,
      TOOL_NAMES,
      normalizeQuality,
      getPreset,
      getEffectiveBudgets,
      plannerSystemPrompt,
      parsePlannerJson,
      normalizePlanSteps,
      helpers
    } = ctx || {};

    const {
      uniqueStrings,
      extractRequestedPreserveTerms,
      extractHighSignalTerms,
      summarizeChunkText,
      containsAllTerms,
      appendMissingTerms,
      cleanSnippet,
      buildSectionAwareItems,
      isEpubLikeText,
      filterNoisyEpubRows,
      extractEpubChapterItems,
      extractPreservedLists,
      filterSectionItemsAgainstPreservedLists,
      ensureThemeCoverage,
      userRequestedSummary,
      looksLikeFileRequest,
      extractEvidenceQueries,
      appendSourceBlocks,
      formatAttachmentSelectionHelp,
      buildToolDigest
    } = helpers || {};

    const runtimeStateOps = window.PsfRlmCoreRuntimeState?.createRlmRuntimeStateOps?.({
      getIncludeSharedAttachments,
      getSharedAttachmentSessionId,
      getEffectiveBudgets
    }) || {};

    const {
      listTextAttachments,
      resolveAttachmentSelection,
      ensureBudgetState,
      markBudgetStop,
      runtimeExceeded
    } = runtimeStateOps;
    const runtimeToolOps = window.PsfRlmCoreRuntimeTools?.createRlmRuntimeToolOps?.({
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
    }) || {};

    const executeTool = runtimeToolOps.executeTool;

    const runtimeAnswerOps = window.PsfRlmCoreRuntimeAnswer?.createRlmRuntimeAnswerOps?.({
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
    }) || {};

    async function runSingleStep(userMessage, conversationHistory = [], systemPrompt = '') {
      const api = getElectronAPI();
      const model = getModelName();
      if (!api || !model) return { handled: false, error: 'Missing API or model' };
      onThinkingStatus('RLM: planning');

      try {
        const plannerMessages = [];
        if (systemPrompt) plannerMessages.push({ role: 'system', content: String(systemPrompt) });
        plannerMessages.push({ role: 'system', content: plannerSystemPrompt() });
        plannerMessages.push({ role: 'user', content: String(userMessage || '') });

        const planResp = await sendMessage(model, plannerMessages, buildOllamaOptions());
        const plannerText = String(planResp?.response?.message?.content || '');
        const plan = parsePlannerJson(plannerText);
        const plannedSteps = normalizePlanSteps(plan);

        const preset = getPreset();
        const trace = [];
        const summaryIntent = userRequestedSummary(userMessage);

        const steps = (plannedSteps.length > 0 ? plannedSteps : [{ tool: 'list_attachments', args: {} }]).slice(0, preset.plannerMaxSteps);
        if (summaryIntent && !steps.some((s) => s && s.tool === 'summarize_text')) {
          steps.push({ tool: 'summarize_text', args: {} });
        }

        const state = {
          selectedAttachmentId: '',
          selectedAttachmentSessionId: '',
          lastText: '',
          preserveTerms: uniqueStrings(extractRequestedPreserveTerms(userMessage)),
          trace,
          budgets: getEffectiveBudgets(),
          metrics: {
            startedAt: Date.now(),
            runtimeMs: 0,
            toolCalls: 0,
            chunksProcessed: 0,
            evidenceHits: 0
          },
          stopReasons: [],
          stopReason: ''
        };
        const maxPlannedStepsByBudget = Math.max(1, Math.min(steps.length, Number(state.budgets.maxToolCalls || steps.length)));
        const boundedSteps = steps.slice(0, maxPlannedStepsByBudget);
        if (boundedSteps.length < steps.length) {
          markBudgetStop(state, 'max_tool_calls', `${boundedSteps.length}/${state.budgets.maxToolCalls}`);
        }

        const results = [];
        for (let i = 0; i < boundedSteps.length; i += 1) {
          if (runtimeExceeded(state)) break;
          const step = boundedSteps[i];
          const result = await executeTool(step, userMessage, state);
          results.push(result);
          trace.push('#' + (i + 1) + ' ' + step.tool + ' => ' + (result?.success ? 'ok' : 'error'));
          if (!result?.success) {
            if (result?.budgetStop === true) {
              markBudgetStop(state, result?.stopReason || 'budget_limit');
            }
            if (result?.needsAttachmentSelection === true) {
              return {
                handled: true,
                answer: formatAttachmentSelectionHelp(result?.output?.attachments || []),
                plan,
                steps: boundedSteps,
                trace,
                toolResult: result,
                executedTools: results.map((r) => String(r?.tool || '').trim()).filter(Boolean),
                stopReason: state.stopReason || '',
                stopReasons: state.stopReasons.slice(),
                budgetUsage: {
                  ...state.metrics,
                  budgets: state.budgets
                }
              };
            }
            return {
              handled: false,
              error: result?.error || 'Tool execution failed',
              plan,
              steps: boundedSteps,
              trace,
              toolResult: result,
              stopReason: state.stopReason || '',
              stopReasons: state.stopReasons.slice(),
              budgetUsage: {
                ...state.metrics,
                budgets: state.budgets
              }
            };
          }
        }

        let summaryResult = [...results].reverse().find((r) => r?.success && r?.tool === 'summarize_text') || null;
        if (!summaryResult) {
          const forced = await executeTool({ tool: 'summarize_text', args: {} }, userMessage, state);
          results.push(forced);
          trace.push('#' + results.length + ' summarize_text => ' + (forced?.success ? 'ok' : 'error') + ' (forced)');
          if (!forced?.success) {
            if (forced?.budgetStop === true) {
              markBudgetStop(state, forced?.stopReason || 'budget_limit');
            }
            return {
              handled: false,
              error: forced?.error || 'summarize_text failed',
              plan,
              steps: boundedSteps,
              trace,
              toolResult: forced,
              stopReason: state.stopReason || '',
              stopReasons: state.stopReasons.slice(),
              budgetUsage: {
                ...state.metrics,
                budgets: state.budgets
              }
            };
          }
          summaryResult = forced;
        }

        const summary = String(summaryResult?.output?.summary || '').trim();
        const preserveTerms = Array.isArray(summaryResult?.output?.preservedTerms) ? summaryResult.output.preservedTerms : [];
        const chunkCitations = Array.isArray(summaryResult?.output?.chunkCitations) ? summaryResult.output.chunkCitations : [];
        const coverage = summaryResult?.output?.coverage || null;
        const isLongDocument = Number(coverage?.totalChunks || 0) >= 8;

        state.preserveTerms = uniqueStrings([...(state.preserveTerms || []), ...preserveTerms]);

        onThinkingStatus('RLM: recursive evidence loop');
        const evidence = await runtimeAnswerOps.collectEvidenceByQueries(userMessage, state, trace, preset);

        const executedTools = results.map((r) => String(r?.tool || '').trim()).filter(Boolean);

        if (summaryIntent) {
          let answer = summary;
          if (normalizeQuality(getRlmQuality()) !== 'fast' && !isLongDocument && summary) {
            try {
              answer = await runtimeAnswerOps.rewriteSummary(api, model, summary, preserveTerms);
            } catch (_) {
              answer = summary;
            }
          }

          answer = await runtimeAnswerOps.verifyAndRepairAnswer(answer, {
            userMessage,
            state,
            preserveTerms,
            chunkCitations,
            evidence,
            summaryFallback: summary,
            preset,
            trace
          });

          runtimeAnswerOps.appendVerboseTrace(trace, boundedSteps.length, evidence.length, preset);

          return {
            handled: true,
            answer,
            plan,
            steps: boundedSteps,
            trace,
            toolResult: summaryResult,
            executedTools,
            stopReason: state.stopReason || '',
            stopReasons: state.stopReasons.slice(),
            budgetUsage: {
              ...state.metrics,
              budgets: state.budgets
            }
          };
        }

        onThinkingStatus('RLM: finalizing response');
        const digest = buildToolDigest(results);
        const evidencePayload = {
          summary,
          chunkCitations: chunkCitations.slice(0, 18),
          evidence: evidence.slice(0, 24)
        };

        const finalMessages = [];
        if (systemPrompt) finalMessages.push({ role: 'system', content: String(systemPrompt) });
        if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
          finalMessages.push(...conversationHistory);
        }
        finalMessages.push({
          role: 'system',
          content: [
            'You are an evidence-grounded answer composer.',
            'Use only the deterministic evidence payload provided.',
            'When citing chunk citations, use format [chunk_N].',
            'When citing line evidence, use format [line:NN].',
            'If evidence is insufficient, state what is missing.'
          ].join('\n')
        });
        finalMessages.push({ role: 'system', content: 'Deterministic tool results:\n' + JSON.stringify(digest) });
        finalMessages.push({ role: 'system', content: 'Evidence payload:\n' + JSON.stringify(evidencePayload) });
        finalMessages.push({ role: 'user', content: String(userMessage || '') });

        const finalResp = await sendMessage(model, finalMessages, buildOllamaOptions());
        let answer = String(finalResp?.response?.message?.content || '').trim();
        if (!answer) {
          answer = summary || 'I could not compose a final answer from deterministic evidence.';
        }

        answer = await runtimeAnswerOps.verifyAndRepairAnswer(answer, {
          userMessage,
          state,
          preserveTerms,
          chunkCitations,
          evidence,
          summaryFallback: summary,
          preset,
          trace
        });

        runtimeAnswerOps.appendVerboseTrace(trace, boundedSteps.length, evidence.length, preset);

        return {
          handled: true,
          answer,
          plan,
          steps: boundedSteps,
          trace,
          toolResult: summaryResult,
          executedTools,
          stopReason: state.stopReason || '',
          stopReasons: state.stopReasons.slice(),
          budgetUsage: {
            ...state.metrics,
            budgets: state.budgets
          }
        };
      } finally {
        onThinkingStatus('Thinking');
      }
    }

    return {
      runSingleStep
    };
  }

  window.PsfRlmCoreRuntime = {
    createRlmCoreRuntime
  };
})();
