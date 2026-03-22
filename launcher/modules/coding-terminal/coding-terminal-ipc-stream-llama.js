/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createLlamaStreamTools(deps = {}) {
  const {
    http,
    emitStatus,
    sanitizeAssistantText,
    groundingTools,
    enforceStrictOutputContract,
    trySynthesizeUnifiedDiffFromModelOutput,
    validateReplacementEditsInOutput,
    validateNoExtraEditsForReplacements,
    formatGroundingProofFooter,
    codingTerminalCommon,
    activeStreamRequests
  } = deps;

  function normalizeMessagesForLlamaTemplate(messages = []) {
    const rows = Array.isArray(messages) ? messages : [];
    const normalized = [];
    for (const row of rows) {
      const rawRole = String(row?.role || '').trim().toLowerCase();
      const content = String(row?.content || '').trim();
      if (!content) continue;
      const role = rawRole === 'assistant' ? 'assistant' : 'user';
      if (normalized.length === 0 && role === 'assistant') {
        normalized.push({ role: 'user', content: 'Continue.' });
      }
      const prev = normalized[normalized.length - 1];
      if (prev && prev.role === role) {
        prev.content = `${prev.content}\n\n${content}`.trim();
      } else {
        normalized.push({ role, content });
      }
    }
    if (normalized.length === 0) {
      normalized.push({ role: 'user', content: 'Hello.' });
    }
    const last = normalized[normalized.length - 1];
    if (last && last.role !== 'user') {
      normalized.push({ role: 'user', content: 'Continue.' });
    }
    return normalized;
  }

  async function streamFromLlamaCpp({
    streamId,
    modelName,
    messages,
    sources,
    grounding,
    dispatch,
    generationOptions,
    originalUserMessage,
    port,
    sender
  }) {
    emitStatus(sender, streamId, modelName, `coder stream start (${modelName} @ ${port}, llama.cpp)`);
    const body = {
      model: modelName || 'local-model',
      messages: normalizeMessagesForLlamaTemplate(messages),
      stream: true
    };
    if (generationOptions && typeof generationOptions === 'object') {
      if (generationOptions.temperature !== undefined) body.temperature = generationOptions.temperature;
      if (generationOptions.top_p !== undefined) body.top_p = generationOptions.top_p;
      if (generationOptions.top_k !== undefined) body.top_k = generationOptions.top_k;
      if (generationOptions.num_predict !== undefined) body.max_tokens = generationOptions.num_predict;
      if (generationOptions.repeat_penalty !== undefined) body.repeat_penalty = generationOptions.repeat_penalty;
      if (generationOptions.stop !== undefined) body.stop = generationOptions.stop;
    }
    const payload = JSON.stringify(body);

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let pending = '';
      let fullText = '';
      let fullThinking = '';
      let completed = false;
      let serverError = '';
      const rawEvents = [];
      const rawMax = 40;
      let rawBody = '';

      const finalizeDone = async () => {
        if (completed) return;
        completed = true;
        let finalText = sanitizeAssistantText(fullText);
        if (!finalText) {
          let rawPreview = '';
          if (rawEvents.length > 0) {
            const serialized = rawEvents.join('\n');
            const max = 2200;
            rawPreview = serialized.length > max
              ? `${serialized.slice(0, max)}\n...[truncated]`
              : serialized;
          } else {
            const body = String(rawBody || '').trim();
            if (body) {
              const max = 2200;
              rawPreview = body.length > max
                ? `${body.slice(0, max)}\n...[truncated]`
                : body;
            }
          }
          const statusPart = Number.isFinite(Number(res.statusCode)) ? `HTTP ${Number(res.statusCode)}` : 'HTTP n/a';
          const details = [
            `No assistant content returned from llama.cpp (${modelName} @ ${port}).`,
            `${statusPart}`
          ];
          if (serverError) details.push(`server_error=${serverError}`);
          if (rawPreview) details.push(`Raw response preview:\n${rawPreview}`);
          sender.send('coding-terminal:stream-error', {
            streamId,
            error: details.join('\n')
          });
          activeStreamRequests.delete(streamId);
          return;
        }

        if (grounding?.enabled && grounding?.exactFileContext) {
          const verdict = groundingTools.validateGroundedAnalysis(finalText, grounding.exactFileContext, grounding);
          if (!verdict.ok) {
            if (grounding?.rewriteMode) {
              const message = typeof groundingTools.buildGroundingFailureMessage === 'function'
                ? groundingTools.buildGroundingFailureMessage(verdict, grounding.exactFileContext)
                : `Grounded rewrite rejected: ${verdict.reason || 'rewrite-validation-failed'}`;
              finalText = `${finalText}\n\n[Validation warning]\n${message}`;
            }
          } else if (grounding?.rewriteMode && verdict?.applied?.content) {
            const lang = verdict?.applied?.language ? String(verdict.applied.language) : '';
            finalText = `~~~${lang}\n${verdict.applied.content}\n~~~`;
          }
        }
        const strictVerdict = enforceStrictOutputContract(finalText, dispatch);
        if (!strictVerdict.ok) {
          const strictOutput = String(dispatch?.strictOutput || '').trim().toLowerCase();
          if (strictOutput === 'unified_diff') {
            const synthesized = trySynthesizeUnifiedDiffFromModelOutput({
              outputText: finalText,
              exactFileContext: grounding?.exactFileContext || null
            });
            if (synthesized) {
              finalText = `${synthesized}\n\n[Validation warning]\nstrictOutput=unified_diff: synthesized diff from authoritative file + model full-file output.`;
            } else {
              finalText = `${finalText}\n\n[Validation error]\n${strictVerdict.error || 'strictOutput validation failed.'}`;
            }
          } else {
            finalText = `${finalText}\n\n[Validation error]\n${strictVerdict.error || 'strictOutput validation failed.'}`;
          }
        } else {
          finalText = strictVerdict.text;
          if (strictVerdict.warning) {
            finalText = `${finalText}\n\n[Validation warning]\n${strictVerdict.warning}`;
          }
        }
        const replacementVerdict = validateReplacementEditsInOutput({
          userMessage: originalUserMessage,
          outputText: finalText,
          dispatch
        });
        if (!replacementVerdict.ok) {
          finalText = `${finalText}\n\n[Validation warning]\n${replacementVerdict.error || 'deterministic replacement validation failed.'}`;
        }
        const noExtraEditsVerdict = validateNoExtraEditsForReplacements({
          userMessage: originalUserMessage,
          outputText: finalText,
          dispatch,
          exactFileContext: grounding?.exactFileContext || null
        });
        if (!noExtraEditsVerdict.ok) {
          finalText = `${finalText}\n\n[Validation warning]\n${noExtraEditsVerdict.error}`;
        }
        if (typeof formatGroundingProofFooter === 'function') {
          const proof = formatGroundingProofFooter({
            modelName,
            sources: Array.isArray(sources) ? sources : [],
            grounding,
            dispatch
          });
          if (proof) finalText = `${finalText}\n\n${proof}`;
        }
        codingTerminalCommon.addMessage('assistant', finalText);
        sender.send('coding-terminal:stream-done', {
          streamId,
          modelName,
          text: finalText,
          thinking: fullThinking,
          sources: Array.isArray(sources) ? sources : []
        });
        activeStreamRequests.delete(streamId);
      };

      const processEvent = (eventData) => {
        const evt = String(eventData || '').trim();
        if (!evt) return;
        if (rawEvents.length < rawMax) rawEvents.push(evt);
        if (evt === '[DONE]') {
          void finalizeDone();
          return;
        }
        try {
          const parsed = JSON.parse(evt);
          if (parsed?.error) {
            serverError = String(
              parsed?.error?.message ||
              parsed?.error ||
              serverError ||
              ''
            ).trim();
          }
          const piece = sanitizeAssistantText(
            parsed?.choices?.[0]?.delta?.content ||
            parsed?.choices?.[0]?.message?.content ||
            '',
            { trim: false }
          );
          if (piece) {
            fullText += piece;
            sender.send('coding-terminal:stream-data', {
              streamId,
              modelName,
              chunk: piece,
              kind: 'answer'
            });
          }
          const thinkingPiece = String(
            parsed?.choices?.[0]?.delta?.reasoning_content ||
            parsed?.choices?.[0]?.delta?.reasoning ||
            ''
          );
          if (thinkingPiece) {
            fullThinking += thinkingPiece;
            sender.send('coding-terminal:stream-data', {
              streamId,
              modelName,
              chunk: thinkingPiece,
              kind: 'thinking'
            });
          }
          const finish = String(parsed?.choices?.[0]?.finish_reason || '').trim();
          if (finish) {
            void finalizeDone();
          }
        } catch {
          // Ignore malformed event chunks.
        }
      };

      res.on('data', (chunk) => {
        const chunkText = chunk.toString();
        rawBody += chunkText;
        if (rawBody.length > 120000) rawBody = rawBody.slice(-120000);
        pending += chunkText;
        const lines = pending.split('\n');
        pending = lines.pop() || '';
        for (const rawLine of lines) {
          const line = String(rawLine || '').trim();
          if (!line) continue;
          if (line.startsWith('data:')) {
            processEvent(line.slice(5).trim());
          }
        }
      });

      res.on('end', () => {
        if (!serverError && Number(res.statusCode) >= 400) {
          try {
            const parsed = JSON.parse(String(rawBody || '{}'));
            const maybeErr = String(parsed?.error?.message || parsed?.error || '').trim();
            if (maybeErr) serverError = maybeErr;
          } catch {
            const trimmed = String(rawBody || '').trim();
            if (trimmed) serverError = trimmed.slice(0, 2000);
          }
        }
        const trailing = pending.trim();
        if (trailing && trailing.startsWith('data:')) {
          processEvent(trailing.slice(5).trim());
        }
        if (!completed) void finalizeDone();
      });
    });

    req.on('error', (err) => {
      activeStreamRequests.delete(streamId);
      const code = String(err?.code || '').toUpperCase();
      const detail = code === 'ECONNRESET'
        ? ' (connection reset; llama.cpp server likely exited under load. Try lower context/parallel and ensure enough VRAM/RAM.)'
        : '';
      sender.send('coding-terminal:stream-error', {
        streamId,
        error: `llama.cpp stream error: ${err.message}${detail}`
      });
    });

    req.setTimeout(600000, () => {
      req.destroy(new Error('llama.cpp stream timeout'));
    });

    activeStreamRequests.set(streamId, req);
    req.write(payload);
    req.end();
  }

  return {
    streamFromLlamaCpp
  };
}

module.exports = createLlamaStreamTools;
