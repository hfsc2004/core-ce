/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Stream Transport Tools
 */
const createStreamUtilityTools = require('./coding-terminal-ipc-stream-utils');
const createLlamaStreamTools = require('./coding-terminal-ipc-stream-llama');

function createStreamTools(deps = {}) {
  const {
    http,
    codingTerminalCommon,
    groundingTools,
    activeStreamRequests,
    OLLAMA_KEEP_ALIVE = '30m',
    formatGroundingProofFooter = null,
    retryGroundedRewrite = null
  } = deps;

  function streamFromBackend({ backend = 'ollama', ...args }) {
    if (String(backend || '').toLowerCase() === 'llama-cpp') {
      return streamFromLlamaCpp(args);
    }
    return streamFromOllama(args);
  }

  function streamFromOllama({ streamId, modelName, messages, sources, grounding, dispatch, generationOptions, originalUserMessage, port, sender }) {
    emitStatus(sender, streamId, modelName, `coder stream start (${modelName} @ ${port})`);
    const request = {
      model: modelName,
      messages,
      stream: true,
      keep_alive: OLLAMA_KEEP_ALIVE
    };
    if (generationOptions && typeof generationOptions === 'object' && Object.keys(generationOptions).length > 0) {
      request.options = { ...generationOptions };
    }
    const requestBody = JSON.stringify(request);

    const httpOptions = {
      hostname: 'localhost',
      port,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = http.request(httpOptions, (res) => {
      let pending = '';
      let fullText = '';
      let fullThinking = '';
      let lastAnswerRaw = '';
      let lastThinkingRaw = '';
      let completed = false;
      let serverError = '';

      const finalizeDone = async () => {
        if (completed) return;
        completed = true;
        let finalText = sanitizeAssistantText(fullText);
        if (!finalText) {
          const fallbackFromThinking = sanitizeAssistantText(fullThinking);
          if (fallbackFromThinking) {
            finalText = fallbackFromThinking;
          }
        }
        if (!finalText) {
          const reason = serverError || `No assistant content returned from Ollama (${modelName} @ ${port}).`;
          sender.send('coding-terminal:stream-error', {
            streamId,
            error: reason
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

      res.on('data', (chunk) => {
        pending += chunk.toString();
        const lines = pending.split('\n');
        pending = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data?.error) {
              serverError = String(data.error);
              completed = true;
              sender.send('coding-terminal:stream-error', {
                streamId,
                error: `Ollama error (${modelName} @ ${port}): ${serverError}`
              });
              activeStreamRequests.delete(streamId);
              return;
            }
            const answerPieceRaw = getAnswerChunk(data);
            if (answerPieceRaw) {
              const answerNorm = normalizeStreamPiece(lastAnswerRaw, answerPieceRaw);
              lastAnswerRaw = answerNorm.nextRaw;
              const answerPiece = sanitizeAssistantText(answerNorm.delta, { trim: false });
              if (answerPiece) {
                fullText += answerPiece;
                sender.send('coding-terminal:stream-data', {
                  streamId,
                  modelName,
                  chunk: answerPiece,
                  kind: 'answer'
                });
              }
            }

            const thinkingPieceRaw = getThinkingChunk(data);
            if (thinkingPieceRaw) {
              const thinkingNorm = normalizeStreamPiece(lastThinkingRaw, thinkingPieceRaw);
              lastThinkingRaw = thinkingNorm.nextRaw;
              const thinkingPiece = thinkingNorm.delta;
              if (thinkingPiece) {
                fullThinking += thinkingPiece;
                sender.send('coding-terminal:stream-data', {
                  streamId,
                  modelName,
                  chunk: thinkingPiece,
                  kind: 'thinking'
                });
              }
            }
            if (data.done) {
              void finalizeDone();
              return;
            }
          } catch {
            // Ignore malformed partial line and continue.
          }
        }
      });

      res.on('end', () => {
        const trailing = pending.trim();
        if (trailing) {
          try {
            const data = JSON.parse(trailing);
            if (data?.error) {
              serverError = String(data.error);
              completed = true;
              sender.send('coding-terminal:stream-error', {
                streamId,
                error: `Ollama error (${modelName} @ ${port}): ${serverError}`
              });
              activeStreamRequests.delete(streamId);
              return;
            }
            const answerPieceRaw = getAnswerChunk(data);
            if (answerPieceRaw) {
              const answerNorm = normalizeStreamPiece(lastAnswerRaw, answerPieceRaw);
              lastAnswerRaw = answerNorm.nextRaw;
              const answerPiece = sanitizeAssistantText(answerNorm.delta, { trim: false });
              if (answerPiece) fullText += answerPiece;
            }
            const thinkingPieceRaw = getThinkingChunk(data);
            if (thinkingPieceRaw) {
              const thinkingNorm = normalizeStreamPiece(lastThinkingRaw, thinkingPieceRaw);
              lastThinkingRaw = thinkingNorm.nextRaw;
              if (thinkingNorm.delta) fullThinking += thinkingNorm.delta;
            }
            if (data.done) {
              void finalizeDone();
              return;
            }
          } catch {
            // Ignore trailing malformed JSON chunk.
          }
        }
        if (completed) return;
        if (fullText.length > 0) {
          void finalizeDone();
        } else {
          void finalizeDone();
        }
      });
    });

    req.on('error', (err) => {
      activeStreamRequests.delete(streamId);
      sender.send('coding-terminal:stream-error', {
        streamId,
        error: `Ollama stream error: ${err.message}`
      });
    });

    req.setTimeout(600000, () => {
      req.destroy(new Error('Ollama stream timeout'));
    });

    activeStreamRequests.set(streamId, req);
    req.write(requestBody);
    req.end();
  }

  function normalizeStreamPiece(previousRaw, incomingRaw) {
    const incoming = String(incomingRaw || '');
    const previous = String(previousRaw || '');
    if (!incoming) return { delta: '', nextRaw: previous };
    if (previous && incoming.startsWith(previous)) {
      return {
        delta: incoming.slice(previous.length),
        nextRaw: incoming
      };
    }
    return {
      delta: incoming,
      nextRaw: previous + incoming
    };
  }

  function sanitizeAssistantText(text, options = {}) {
    const trim = options.trim !== false;
    let out = String(text || '');
    if (!out) return '';
    out = out
      .replace(/<\|im_start\|>/gi, '')
      .replace(/<\|im_end\|>/gi, '')
      .replace(/<\|endoftext\|>/gi, '')
      .replace(/<\|assistant\|>/gi, '')
      .replace(/<\|user\|>/gi, '')
      .replace(/<\|system\|>/gi, '');
    out = out.replace(/\n{3,}/g, '\n\n');
    return trim ? out.trim() : out;
  }
  const streamUtils = createStreamUtilityTools({
    http,
    keepAlive: OLLAMA_KEEP_ALIVE,
    sanitizeAssistantText
  });
  const {
    enforceStrictOutputContract,
    validateReplacementEditsInOutput,
    validateNoExtraEditsForReplacements,
    trySynthesizeUnifiedDiffFromModelOutput,
    requestNonStreamFallback,
    requestGenerateFallback,
    requestLlamaNonStream,
    emitSyntheticAnswerStream,
    emitStatus,
    shouldRetryWithOriginalPrompt,
    restoreOriginalUserMessage
  } = streamUtils;
  const llamaStreamTools = createLlamaStreamTools({
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
  });
  const { streamFromLlamaCpp } = llamaStreamTools;

  function getAnswerChunk(data) {
    return data?.message?.content || data?.content || '';
  }

  function getThinkingChunk(data) {
    return (
      data?.message?.thinking ||
      data?.message?.reasoning ||
      data?.message?.reasoning_content ||
      data?.thinking ||
      data?.reasoning ||
      data?.reasoning_content ||
      ''
    );
  }

  return {
    streamFromBackend,
    streamFromOllama,
    sanitizeAssistantText
  };
}

module.exports = createStreamTools;
