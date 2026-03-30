/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function sanitizeAssistantText(input = '') {
  if (typeof input !== 'string') return '';
  return input.replace(/\r\n/g, '\n').trim();
}

function formatGroundingProofFooter({
  modelName,
  sources = [],
  grounding = null,
  dispatch = null
} = {}) {
  const src = Array.isArray(sources) ? sources : [];
  const hasExactSource = src.some((s) => {
    const retrieval = String(s?.metadata?.retrieval || '').toLowerCase();
    return retrieval.includes('exact-file');
  });
  const retrieval = grounding?.enabled
    ? 'grounded'
    : (hasExactSource ? 'exact-file-context' : (src.length > 0 ? 'rag' : 'none'));
  const lines = [
    '---',
    `Grounding proof: mode=${dispatch?.mode || 'n/a'} | model=${modelName || 'unknown'} | retrieval=${retrieval}`
  ];
  if (dispatch?.used && dispatch?.dispatcherModel) {
    lines.push(`Router: ${dispatch.dispatcherModel}${dispatch.dispatcherPort ? `@${dispatch.dispatcherPort}` : ''} -> ${modelName}`);
    const rewritten = String(dispatch?.rewrittenMessage || '').trim();
    if (rewritten) {
      const compact = rewritten.replace(/\s+/g, ' ').trim();
      const preview = compact.length > 240 ? `${compact.slice(0, 240)}...` : compact;
      lines.push(`Router rewrite: ${preview}`);
    }
  } else {
    lines.push('Router: bypassed');
  }
  if (src.length > 0) {
    const refs = src.slice(0, 3).map((s) => {
      const meta = s?.metadata || {};
      const file = meta.filePath || 'unknown';
      const start = Number.isFinite(meta.startLine) ? (meta.startLine + 1) : null;
      const end = Number.isFinite(meta.endLine) ? (meta.endLine + 1) : null;
      if (start && end) return `${file}:${start}-${end}`;
      if (start) return `${file}:${start}`;
      return file;
    });
    lines.push(`Sources: ${refs.join(' | ')}`);
  } else {
    lines.push('Sources: none');
  }
  return lines.join('\n');
}

function createGroundingProofTools({
  withTimeout,
  getBackend,
  getRuntimeContext,
  ollamaManager,
  inferenceManager,
  groundingTools,
  keepAlive,
  rewriteRetryPrompt
} = {}) {
  async function retryGroundedRewrite({
    modelName,
    messages,
    grounding,
    port,
    generationOptions = {}
  } = {}) {
    try {
      if (!grounding?.enabled || !grounding?.rewriteMode || !grounding?.exactFileContext) {
        return { success: false, reason: 'not-grounded-rewrite' };
      }
      const retryMessages = [
        ...Array.isArray(messages) ? messages : [],
        { role: 'system', content: rewriteRetryPrompt }
      ];
      const reply = await withTimeout(
        (getBackend() === 'ollama'
          ? ollamaManager.sendMessage(modelName, retryMessages, {
              port,
              keep_alive: keepAlive,
              temperature: 0,
              top_p: 0.7,
              top_k: 20,
              repeat_penalty: 1.15,
              num_predict: Number.isFinite(Number(generationOptions?.num_predict))
                ? Number(generationOptions.num_predict)
                : 4096
            })
          : inferenceManager.sendMessage(getRuntimeContext().appDir, modelName, retryMessages, {
              keep_alive: keepAlive,
              temperature: 0,
              top_p: 0.7,
              top_k: 20,
              repeat_penalty: 1.15,
              num_predict: Number.isFinite(Number(generationOptions?.num_predict))
                ? Number(generationOptions.num_predict)
                : 4096
            })),
        90000,
        'Grounded rewrite strict retry timeout'
      );
      if (!reply?.success || reply?.response?.error) {
        return { success: false, reason: 'retry-request-failed' };
      }
      const content = sanitizeAssistantText(
        reply?.response?.message?.content ||
        reply?.response?.content ||
        reply?.response?.message?.reasoning ||
        reply?.response?.message?.thinking ||
        ''
      );
      if (!content || !content.trim()) {
        return { success: false, reason: 'retry-empty' };
      }
      const verdict = groundingTools.validateGroundedAnalysis(content, grounding.exactFileContext, grounding);
      if (!verdict.ok) {
        return { success: false, reason: verdict.reason || 'retry-validation-failed', verdict };
      }
      if (grounding?.rewriteMode && verdict?.applied?.content) {
        const lang = verdict?.applied?.language ? String(verdict.applied.language) : '';
        return { success: true, content: `~~~${lang}\n${verdict.applied.content}\n~~~` };
      }
      return { success: true, content };
    } catch (err) {
      return { success: false, reason: err?.message || 'retry-exception' };
    }
  }

  return {
    formatGroundingProofFooter,
    retryGroundedRewrite
  };
}

module.exports = createGroundingProofTools;
