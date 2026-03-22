/**
 * RLM engine MIT-loop execution.
 */

const {
  parseJsonFromModelText,
  uniqueStrings,
  resolveAttachmentTarget,
  normalizePlaceholderTerms,
  stripUnknownAngleBracketTerms,
  ensureTermsInSummary
} = require('./rlm-engine-helpers');

async function runMitLoopForAttachments(ctx = {}) {
  const {
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
  } = ctx;

  if (!sendMessage || !options?.modelName) return null;
  if (!checkBudgets()) return null;

  const plannerSystem = [
    'You are an internal planner for deterministic tools.',
    'Return only strict JSON.',
    'Allowed tools: list_attachments, read_attachment, extract_query_terms, chunk_text, rank_chunks_by_terms, find_lines, extract_between, accumulate_summaries, coverage_guard.',
    'Plan up to 6 steps to answer the user from available attachments.',
    'Prefer deterministic coverage and concise outputs.'
  ].join(' ');
  const plannerPayload = {
    userMessage: message,
    requiredTermsHint: requiredTermsFromPrompt,
    attachments: textAttachments.slice(0, 24).map((item) => ({ id: item.id, name: item.displayName })),
    defaults: {
      chunkSize: options.chunkSize,
      overlap: options.chunkOverlap,
      maxChunks: options.maxRankedChunks
    },
    outputSchema: {
      steps: [{ tool: 'name', args: {} }],
      requiredTerms: ['term'],
      reason: 'short'
    }
  };

  let planObj = null;
  try {
    const plannerReply = await sendMessage(options.modelName, [
      { role: 'system', content: plannerSystem },
      { role: 'user', content: JSON.stringify(plannerPayload) }
    ], { port: options.port, keep_alive: '30m' });
    const plannerRaw = String(plannerReply?.response?.message?.content || '').trim();
    planObj = parseJsonFromModelText(plannerRaw);
    if (planObj && Array.isArray(planObj.steps) && planObj.steps.length > 0) {
      steps.push(`#${steps.length + 1} planner => ok`);
    } else {
      steps.push(`#${steps.length + 1} planner => empty`);
      return null;
    }
  } catch (err) {
    steps.push(`#${steps.length + 1} planner => error: ${err?.message || err}`);
    return null;
  }

  const stepList = Array.isArray(planObj.steps) ? planObj.steps.slice(0, options.maxPlannerSteps) : [];
  const plannerTerms = Array.isArray(planObj.requiredTerms)
    ? planObj.requiredTerms.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 20)
    : [];
  const requiredTerms = uniqueStrings([...(requiredTermsFromPrompt || []), ...plannerTerms]).slice(0, 24);
  let selectedAttachment = null;
  let workingText = '';
  let chunks = [];
  let terms = [];
  let ranked = [];
  let summary = '';
  for (const step of stepList) {
    if (!checkBudgets()) break;
    const tool = String(step?.tool || '').trim().toLowerCase();
    const args = (step?.args && typeof step.args === 'object') ? { ...step.args } : {};
    if (!tool) continue;
    if (tool === 'list_attachments') {
      executedTools.push('list_attachments');
      steps.push(`#${steps.length + 1} list_attachments => ok`);
      continue;
    }
    if (tool === 'read_attachment') {
      const requestedId = String(args.attachmentId || args.id || '').trim();
      const target = requestedId
        ? textAttachments.find((item) => String(item.id) === requestedId)
        : (selectedAttachment || resolveAttachmentTarget(message, textAttachments, false));
      if (!target) {
        steps.push(`#${steps.length + 1} read_attachment => error: attachment not found`);
        continue;
      }
      selectedAttachment = target;
      trace.push(`selected_attachment=${target.id}`);
      const read = await attachmentStore.readAttachmentText({
        sessionId: target.__sessionId || sessionId,
        attachmentId: target.id,
        maxBytes: options.maxBytesPerAttachment
      });
      workingText = String(read?.text || '').trim();
      executedTools.push('read_attachment');
      steps.push(`#${steps.length + 1} read_attachment => ok`);
      continue;
    }
    if (tool === 'extract_query_terms') {
      const result = await runTool('extract_query_terms', {
        message: String(args.message || message),
        maxTerms: Number(args.maxTerms) || options.maxQueryTerms
      });
      terms = Array.isArray(result?.output?.terms) ? result.output.terms : terms;
      continue;
    }
    if (tool === 'chunk_text') {
      const result = await runTool('chunk_text', {
        text: String(args.text || workingText),
        chunkSize: Number(args.chunkSize) || options.chunkSize,
        overlap: Number(args.overlap) || options.chunkOverlap
      });
      chunks = Array.isArray(result?.output?.chunks) ? result.output.chunks : chunks;
      continue;
    }
    if (tool === 'rank_chunks_by_terms') {
      const result = await runTool('rank_chunks_by_terms', {
        chunks: Array.isArray(args.chunks) ? args.chunks : chunks,
        terms: Array.isArray(args.terms) ? args.terms : terms,
        maxChunks: Number(args.maxChunks) || options.maxRankedChunks
      });
      ranked = Array.isArray(result?.output?.ranked) ? result.output.ranked : ranked;
      continue;
    }
    if (tool === 'find_lines') {
      await runTool('find_lines', {
        text: String(args.text || workingText),
        query: String(args.query || terms[0] || '').trim(),
        caseSensitive: args.caseSensitive === true,
        maxHits: Number(args.maxHits) || 50
      });
      continue;
    }
    if (tool === 'extract_between') {
      await runTool('extract_between', {
        text: String(args.text || workingText),
        startMarker: String(args.startMarker || '').trim(),
        endMarker: String(args.endMarker || '').trim(),
        includeMarkers: args.includeMarkers === true
      });
      continue;
    }
    if (tool === 'accumulate_summaries') {
      const sourceRows = Array.isArray(args.items) && args.items.length > 0
        ? args.items.map((v) => String(v || ''))
        : (ranked.length > 0 ? ranked : chunks).slice(0, options.maxSummarizedChunks).map((row) => String(row?.text || ''));
      const result = await runTool('accumulate_summaries', {
        items: sourceRows,
        maxChars: Number(args.maxChars) || options.maxSummaryChars
      });
      summary = String(result?.output?.summary || summary).trim();
      continue;
    }
    if (tool === 'coverage_guard') {
      await runTool('coverage_guard', {
        summary: String(args.summary || summary),
        requiredTerms: Array.isArray(args.requiredTerms) ? args.requiredTerms : requiredTerms
      });
      continue;
    }
    steps.push(`#${steps.length + 1} ${tool} => error: unsupported tool`);
  }

  if (!summary) {
    const sourceRows = (ranked.length > 0 ? ranked : chunks)
      .slice(0, options.maxSummarizedChunks)
      .map((row) => {
        const body = String(row?.text || '').trim();
        return body.length <= options.maxChunkPreviewChars ? body : `${body.slice(0, options.maxChunkPreviewChars)}...`;
      })
      .filter(Boolean);
    if (sourceRows.length > 0) {
      const accRes = await runTool('accumulate_summaries', {
        items: sourceRows,
        maxChars: options.maxSummaryChars
      });
      summary = String(accRes?.output?.summary || '').trim();
    }
  }
  if (!summary) return null;

  let verifier = null;
  if (checkBudgets()) {
    try {
      const verifySystem = [
        'You verify whether deterministic evidence summary answers the user.',
        'Return strict JSON only: {"status":"ok|revise","requiredTerms":["..."],"reason":"..."}'
      ].join(' ');
      const verifyPayload = {
        userMessage: message,
        summary,
        requiredTerms
      };
      const verifyReply = await sendMessage(options.modelName, [
        { role: 'system', content: verifySystem },
        { role: 'user', content: JSON.stringify(verifyPayload) }
      ], { port: options.port, keep_alive: '30m' });
      verifier = parseJsonFromModelText(String(verifyReply?.response?.message?.content || ''));
      steps.push(`#${steps.length + 1} verifier => ok`);
    } catch (err) {
      steps.push(`#${steps.length + 1} verifier => error: ${err?.message || err}`);
    }
  }

  const reviseNeeded = String(verifier?.status || '').toLowerCase() === 'revise';
  const verifyTerms = Array.isArray(verifier?.requiredTerms) && verifier.requiredTerms.length > 0
    ? verifier.requiredTerms.map((v) => String(v || '').trim()).filter(Boolean)
    : requiredTerms;
  if (reviseNeeded && verifyTerms.length > 0 && checkBudgets()) {
    const guard = await runTool('coverage_guard', {
      summary,
      requiredTerms: verifyTerms
    });
    const missing = Array.isArray(guard?.output?.missingTerms) ? guard.output.missingTerms : [];
    if (missing.length > 0) {
      const reRank = await runTool('rank_chunks_by_terms', {
        chunks: ranked.length > 0 ? ranked : chunks,
        terms: missing,
        maxChunks: Math.min(10, options.maxRankedChunks)
      });
      const addRows = Array.isArray(reRank?.output?.ranked)
        ? reRank.output.ranked.slice(0, 6).map((row) => String(row?.text || '')).filter(Boolean)
        : [];
      if (addRows.length > 0) {
        const addendum = await runTool('accumulate_summaries', {
          items: addRows,
          maxChars: Math.min(2400, options.maxSummaryChars)
        });
        const extra = String(addendum?.output?.summary || '').trim();
        if (extra) {
          summary = `${summary}\n\n${extra}`;
          trace.push('verifier=revise-applied');
        }
      }
    }
  }

  if (requiredTerms.length > 0 && checkBudgets()) {
    summary = normalizePlaceholderTerms(summary, requiredTerms);
    summary = stripUnknownAngleBracketTerms(summary, requiredTerms);
    const finalGuard = await runTool('coverage_guard', {
      summary,
      requiredTerms
    });
    const missingTerms = Array.isArray(finalGuard?.output?.missingTerms) ? finalGuard.output.missingTerms : [];
    if (missingTerms.length > 0) {
      trace.push(`required_terms_missing=${missingTerms.join(',')}`);
      summary = ensureTermsInSummary(summary, requiredTerms);
      trace.push(`required_terms_forced=${missingTerms.join(',')}`);
    } else {
      trace.push(`required_terms_ok=${requiredTerms.join(',')}`);
    }
  }

  return {
    success: true,
    handled: true,
    answer: `Summary:\n\n${summary}`,
    plan: {
      steps: stepList,
      reason: String(planObj?.reason || 'mit-loop'),
      mode: 'mit-loop'
    },
    trace: trace.concat(['engine_mode=mit-loop']),
    steps,
    executedTools,
    toolResult: {
      output: {
        coverage: {
          totalChunks: chunks.length,
          processedChunks: (ranked.length > 0 ? ranked : chunks).slice(0, options.maxSummarizedChunks).length,
          processedRatio: chunks.length > 0
            ? ((ranked.length > 0 ? ranked : chunks).slice(0, options.maxSummarizedChunks).length / chunks.length)
            : 0
        }
      }
    },
    stopReason: budget.stopReason
  };
}

module.exports = {
  runMitLoopForAttachments
};
