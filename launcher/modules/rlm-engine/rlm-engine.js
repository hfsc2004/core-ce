/**
 * ============================================================================
 * RLM ENGINE (MAIN PROCESS)
 * ============================================================================
 *
 * Global orchestration engine for RLM turns.
 * Uses deterministic tools + attachment store + model transport through deps.
 *
 * @module rlm-engine
 * @version 1.1.3 - March 5, 2026
 * ============================================================================
 */
const {
  buildAttachmentScopes,
  resolveAttachmentTarget,
  detectIntent,
  detectCodeLanguage,
  buildCodeSystemPrompt,
  ensureCodeFence,
  resolveSessionId,
  normalizeOptions,
  parseRequiredTermsFromPrompt,
  findMissingTerms,
  ensureTermsInSummary,
  normalizePlaceholderTerms,
  stripUnknownAngleBracketTerms
} = require('./rlm-engine-helpers');
const { runMitLoopForAttachments } = require('./rlm-engine-mit-loop');

function createRlmEngine(deps = {}) {
  const attachmentStore = deps.attachmentStore;
  const executeDeterministicTool = typeof deps.executeDeterministicTool === 'function'
    ? deps.executeDeterministicTool
    : (async () => ({ success: false, error: 'deterministic-tools-unavailable' }));
  const sendMessage = typeof deps.sendMessage === 'function'
    ? deps.sendMessage
    : null;

  async function runTurn(request = {}) {
    const message = String(request?.message || '').trim();
    if (!message) {
      return { success: false, handled: false, error: 'message is required' };
    }
    if (!attachmentStore || typeof attachmentStore.listAttachments !== 'function') {
      return { success: false, handled: false, error: 'attachment store unavailable' };
    }

    const options = normalizeOptions(request?.options || {});
    const sessionId = resolveSessionId(options);
    const requiredTermsFromPrompt = parseRequiredTermsFromPrompt(message);
    const trace = [];
    const steps = [];
    const executedTools = [];
    const budget = {
      startedAt: Date.now(),
      toolCalls: 0,
      stopReason: null
    };

    const markStop = (reason, detail) => {
      if (!budget.stopReason) budget.stopReason = String(reason || 'budget_limit');
      if (detail) trace.push(`stop=${budget.stopReason}: ${detail}`);
    };

    const checkBudgets = () => {
      if (budget.stopReason) return false;
      const elapsed = Date.now() - budget.startedAt;
      if (elapsed >= options.budgets.maxRuntimeMs) {
        markStop('max_runtime_ms', `${elapsed}ms >= ${options.budgets.maxRuntimeMs}ms`);
        return false;
      }
      if (budget.toolCalls >= options.budgets.maxToolCalls) {
        markStop('max_tool_calls', `${budget.toolCalls} >= ${options.budgets.maxToolCalls}`);
        return false;
      }
      return true;
    };

    const runTool = async (toolName, args = {}, role = 'planner') => {
      if (!checkBudgets()) {
        return { success: false, budgetStop: true, stopReason: budget.stopReason };
      }
      budget.toolCalls += 1;
      const result = await executeDeterministicTool(toolName, args, {
        surface: 'psf-terminal',
        role
      });
      executedTools.push(toolName);
      if (result?.success) {
        steps.push(`#${steps.length + 1} ${toolName} => ok`);
      } else {
        steps.push(`#${steps.length + 1} ${toolName} => error: ${result?.error || 'unknown'}`);
      }
      return result;
    };

    const attachments = await attachmentStore.listAttachments(sessionId);
    const selectedAttachments = await buildAttachmentScopes({
      baseAttachments: attachments,
      baseSessionId: sessionId,
      includeShared: options.includeSharedAttachments === true,
      sharedSessionId: options.sharedAttachmentSessionId,
      attachmentStore
    });

    const textAttachments = selectedAttachments.filter((item) => item && item.textExtractable === true);
    const intent = detectIntent(message);
    if (intent === 'code_generate' && sendMessage && options.modelName) {
      const target = resolveAttachmentTarget(message, textAttachments);
      let evidence = '';
      if (target) {
        trace.push(`selected_attachment=${target.id}`);
        const read = await attachmentStore.readAttachmentText({
          sessionId: target.__sessionId || sessionId,
          attachmentId: target.id,
          maxBytes: options.maxBytesPerAttachment
        });
        const text = String(read?.text || '').trim();
        if (text) {
          const chunkRes = await runTool('chunk_text', {
            text,
            chunkSize: options.chunkSize,
            overlap: options.chunkOverlap
          });
          const chunks = Array.isArray(chunkRes?.output?.chunks) ? chunkRes.output.chunks : [];
          const firstChunks = chunks.slice(0, Math.max(1, Math.min(6, options.maxSummarizedChunks)));
          const evidenceItems = firstChunks.map((chunk) => String(chunk?.text || '').trim()).filter(Boolean);
          const accRes = await runTool('accumulate_summaries', {
            items: evidenceItems,
            maxChars: Math.min(5000, options.maxSummaryChars)
          });
          evidence = String(accRes?.output?.summary || '').trim();
        }
      }
      const language = detectCodeLanguage(message);
      const systemPrompt = buildCodeSystemPrompt(language);
      const userPrompt = evidence
        ? `${message}\n\nReference material:\n${evidence}`
        : message;
      const reply = await sendMessage(options.modelName, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        port: options.port,
        keep_alive: '30m'
      });
      const raw = String(reply?.response?.message?.content || '').trim();
      if (!raw) {
        return { success: false, handled: false, error: 'code generation returned empty output', trace, steps, executedTools };
      }
      const code = ensureCodeFence(raw, language);
      return {
        success: true,
        handled: true,
        answer: code,
        plan: {
          steps: [
            { tool: 'chunk_text', args: { chunkSize: options.chunkSize, overlap: options.chunkOverlap } },
            { tool: 'accumulate_summaries', args: { maxChars: Math.min(5000, options.maxSummaryChars) } },
            { tool: 'model_generate_code', args: { language } }
          ],
          reason: 'code_generate'
        },
        trace,
        steps,
        executedTools,
        toolResult: target ? { output: { selectedAttachment: target.id } } : null,
        stopReason: budget.stopReason
      };
    }

    if (intent !== 'code_generate' && options.engineMode === 'mit-loop') {
      const mitLoop = await runMitLoopForAttachments({
        sendMessage,
        options,
        message,
        requiredTermsFromPrompt,
        textAttachments,
        attachmentStore,
        sessionId,
        checkBudgets,
        runTool,
        trace,
        steps,
        executedTools,
        budget
      });
      if (mitLoop && mitLoop.success === true && mitLoop.handled === true) {
        return mitLoop;
      }
      trace.push('mit_loop_fallback=deterministic');
    }

    if (textAttachments.length === 0) {
      return {
        success: true,
        handled: true,
        answer: 'No text-extractable attachments are available in this session.',
        plan: { tool: 'list_attachments', args: {} },
        trace,
        steps,
        executedTools,
        toolResult: null
      };
    }

    const target = resolveAttachmentTarget(message, textAttachments, true);
    if (!target) {
      const preview = textAttachments
        .slice(0, 10)
        .map((item) => `- ${item.id}: ${item.displayName}`)
        .join('\n');
      return {
        success: true,
        handled: true,
        answer: `Multiple attachments found. Please specify one attachment.\n\n${preview}`,
        plan: { tool: 'list_attachments', args: {} },
        trace,
        steps,
        executedTools,
        toolResult: null
      };
    }

    trace.push(`selected_attachment=${target.id}`);
    const read = await attachmentStore.readAttachmentText({
      sessionId: target.__sessionId || sessionId,
      attachmentId: target.id,
      maxBytes: options.maxBytesPerAttachment
    });
    const text = String(read?.text || '').trim();
    if (!text) {
      return {
        success: true,
        handled: true,
        answer: `Attachment "${target.displayName}" has no readable text content.`,
        plan: { tool: 'read_attachment', args: { attachmentId: target.id } },
        trace,
        steps,
        executedTools,
        toolResult: null
      };
    }

    const chunkRes = await runTool('chunk_text', {
      text,
      chunkSize: options.chunkSize,
      overlap: options.chunkOverlap
    });
    if (!chunkRes?.success) {
      return {
        success: false,
        handled: false,
        error: chunkRes?.error || 'chunk_text failed',
        trace,
        steps,
        executedTools,
        stopReason: budget.stopReason
      };
    }

    const chunks = Array.isArray(chunkRes?.output?.chunks) ? chunkRes.output.chunks : [];
    const termsRes = await runTool('extract_query_terms', {
      message,
      maxTerms: options.maxQueryTerms
    });
    const queryTerms = Array.isArray(termsRes?.output?.terms) ? termsRes.output.terms : [];

    let ranked = [];
    if (queryTerms.length > 0 && chunks.length > 0) {
      const rankRes = await runTool('rank_chunks_by_terms', {
        chunks,
        terms: queryTerms,
        maxChunks: options.maxRankedChunks
      });
      ranked = Array.isArray(rankRes?.output?.ranked) ? rankRes.output.ranked : [];
    }

    const selectedChunks = (ranked.length > 0 ? ranked : chunks).slice(0, options.maxSummarizedChunks);
    const summaryInputs = selectedChunks.map((chunk) => {
      const body = String(chunk?.text || '').trim();
      if (!body) return '';
      return body.length <= options.maxChunkPreviewChars
        ? body
        : `${body.slice(0, options.maxChunkPreviewChars)}...`;
    }).filter(Boolean);

    const accRes = await runTool('accumulate_summaries', {
      items: summaryInputs,
      maxChars: options.maxSummaryChars
    });
    if (!accRes?.success) {
      return {
        success: false,
        handled: false,
        error: accRes?.error || 'accumulate_summaries failed',
        trace,
        steps,
        executedTools,
        stopReason: budget.stopReason
      };
    }

    const deterministicSummary = String(accRes?.output?.summary || '').trim();
    const coverage = {
      totalChunks: chunks.length,
      processedChunks: selectedChunks.length,
      processedRatio: chunks.length > 0 ? selectedChunks.length / chunks.length : 0
    };
    let answer = deterministicSummary
      ? `Summary of ${target.displayName}:\n\n${deterministicSummary}`
      : `No extractable summary content was produced for ${target.displayName}.`;

    if (requiredTermsFromPrompt.length > 0) {
      const guardRes = await runTool('coverage_guard', {
        summary: deterministicSummary,
        requiredTerms: requiredTermsFromPrompt
      });
      const missingTerms = Array.isArray(guardRes?.output?.missingTerms)
        ? guardRes.output.missingTerms
        : [];
      if (missingTerms.length > 0) {
        trace.push(`required_terms_missing=${missingTerms.join(',')}`);
      } else {
        trace.push(`required_terms_ok=${requiredTermsFromPrompt.join(',')}`);
      }
    }

    const forceRewriteForRequiredTerms = requiredTermsFromPrompt.length > 0;
    if ((options.allowRewrite || forceRewriteForRequiredTerms) && sendMessage && checkBudgets()) {
      try {
        const rewritePrompt = [
          'You are rewriting deterministic evidence into a concise user answer.',
          'Do not ask for re-upload.',
          'Do not mention missing context unless truly missing.',
          'Keep source-grounded and concise.'
        ].join(' ');
        const requiredTermsHint = requiredTermsFromPrompt.length > 0
          ? `\n\nRequired terms to include verbatim: ${requiredTermsFromPrompt.join(', ')}`
          : '';
        const rewriteMessages = [
          { role: 'system', content: rewritePrompt },
          { role: 'user', content: `User request:\n${message}${requiredTermsHint}\n\nDeterministic evidence:\n${deterministicSummary}` }
        ];
        const rewrite = await sendMessage(options.modelName, rewriteMessages, {
          port: options.port,
          keep_alive: '30m'
        });
        const rewritten = String(rewrite?.response?.message?.content || '').trim();
        if (rewritten) {
          answer = rewritten;
          trace.push('rewrite=llm');
        } else {
          trace.push('rewrite=skipped-empty');
        }
      } catch (err) {
        trace.push(`rewrite=failed:${err?.message || err}`);
      }
    }

    if (requiredTermsFromPrompt.length > 0) {
      answer = normalizePlaceholderTerms(answer, requiredTermsFromPrompt);
      answer = stripUnknownAngleBracketTerms(answer, requiredTermsFromPrompt);
      const missingAfterRewrite = findMissingTerms(answer, requiredTermsFromPrompt);
      if (missingAfterRewrite.length > 0) {
        answer = ensureTermsInSummary(answer, requiredTermsFromPrompt);
        trace.push(`required_terms_forced=${missingAfterRewrite.join(',')}`);
      }
    }

    return {
      success: true,
      handled: true,
      answer,
      plan: {
        steps: [
          { tool: 'chunk_text', args: { chunkSize: options.chunkSize, overlap: options.chunkOverlap } },
          { tool: 'extract_query_terms', args: { maxTerms: options.maxQueryTerms } },
          { tool: 'rank_chunks_by_terms', args: { maxChunks: options.maxRankedChunks } },
          { tool: 'accumulate_summaries', args: { maxChars: options.maxSummaryChars } }
        ],
        reason: 'deterministic attachment summarize'
      },
      trace,
      steps,
      executedTools,
      toolResult: {
        output: {
          coverage
        }
      },
      stopReason: budget.stopReason
    };
  }

  return {
    runTurn
  };
}

module.exports = {
  createRlmEngine
};
