/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createStreamController(deps) {
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const getActiveStream = typeof deps?.getActiveStream === 'function' ? deps.getActiveStream : () => null;
    const setActiveStream = typeof deps?.setActiveStream === 'function' ? deps.setActiveStream : (() => {});
    const getUserInput = typeof deps?.getUserInput === 'function' ? deps.getUserInput : () => null;
    const getChatDisplay = typeof deps?.getChatDisplay === 'function' ? deps.getChatDisplay : () => null;
    const sanitizeQwenSelfDialogue = typeof deps?.sanitizeQwenSelfDialogue === 'function' ? deps.sanitizeQwenSelfDialogue : ((v) => String(v || ''));
    const finalizeStreamingMessage = typeof deps?.finalizeStreamingMessage === 'function' ? deps.finalizeStreamingMessage : (() => {});
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const setWaitingState = typeof deps?.setWaitingState === 'function' ? deps.setWaitingState : (() => {});
    const appendConversationPair = typeof deps?.appendConversationPair === 'function' ? deps.appendConversationPair : (() => {});
    const speakAssistantText = typeof deps?.speakAssistantText === 'function' ? deps.speakAssistantText : null;
    const getSpeechEngine = typeof deps?.getSpeechEngine === 'function' ? deps.getSpeechEngine : (() => null);
    const getSpeechChunkProfile = typeof deps?.getSpeechChunkProfile === 'function'
      ? deps.getSpeechChunkProfile
      : (() => ({ preview: 140, segment: 220, tail: 240 }));
    const getTtsQueueDepth = typeof deps?.getTtsQueueDepth === 'function' ? deps.getTtsQueueDepth : (() => 0);
    const isTtsDebugTraceEnabled = typeof deps?.isTtsDebugTraceEnabled === 'function' ? deps.isTtsDebugTraceEnabled : (() => false);

    function addTtsDebug(message) {
      if (!isTtsDebugTraceEnabled()) return;
      addSystemMessage(`[TTS debug] ${message}`);
    }

    function buildStreamingPreview(text) {
      const content = String(text || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!content || content.length < 14) return '';
      const clauses = content.match(/[^,;:.!?]+[,;:.!?]?/g) || [];
      const first = String(clauses[0] || '').trim();
      if (!first) return '';
      if (first.length < 10) return '';
      // Allow early speech on clause punctuation, not only full sentence punctuation.
      if (!/[,;:.!?]$/.test(first)) {
        // Fallback: if we have enough plain text but no punctuation yet,
        // speak a short leading fragment to start audio sooner.
        if (content.length < 24) return '';
        const soft = content.slice(0, 72);
        const cut = Math.max(soft.lastIndexOf(' '), soft.lastIndexOf(','), soft.lastIndexOf(';'));
        const preview = (cut > 20 ? soft.slice(0, cut) : soft).trim();
        return preview.length >= 14 ? preview : '';
      }
      // Commas are often too early; require a little more context to avoid choppy starts.
      if (/,$/.test(first) && first.length < 16) return '';
      return first.slice(0, 110).trim();
    }

    function buildStreamingSegment(text, startIndex = 0) {
      const content = String(text || '');
      const start = Math.max(0, Number(startIndex) || 0);
      if (start >= content.length) return '';
      const tail = content.slice(start);
      if (tail.trim().length < 40) return '';

      // Prefer natural punctuation boundaries for smoother TTS.
      const punctWindow = tail.slice(0, 280);
      const punctMatch = punctWindow.match(/^([\s\S]{60,240}[.!?;:])\s/);
      if (punctMatch && punctMatch[1]) {
        return String(punctMatch[1]).trim();
      }

      // Fallback: cut at a word boundary once we have enough buffered text.
      if (tail.length < 180) return '';
      const soft = tail.slice(0, 220);
      const lastSpace = soft.lastIndexOf(' ');
      const cut = lastSpace > 120 ? lastSpace : 180;
      return soft.slice(0, cut).trim();
    }

    function installStreamListener() {
      const api = getElectronAPI();
      if (!api || typeof api.onOllamaStreamData !== 'function') {
        console.warn('[Terminal] Streaming APIs not available; using non-streaming responses.');
        return;
      }

      api.onOllamaStreamData((data) => {
        const activeStream = getActiveStream();
        if (!activeStream) {
          return;
        }

        if (data && data.port !== undefined && data.port !== activeStream.port) {
          console.log(`[Terminal] Ignoring stream data for port ${data.port}, we are port ${activeStream.port}`);
          return;
        }

        try {
          if (data && data.error) {
            const speechEngine = getSpeechEngine();
            if (speechEngine && typeof speechEngine.cancelStream === 'function' && activeStream.ttsStreamId) {
              speechEngine.cancelStream(activeStream.ttsStreamId);
            }
            if (activeStream.content && activeStream.contentDiv) {
              const sanitized = sanitizeQwenSelfDialogue(activeStream.content);
              finalizeStreamingMessage(activeStream.contentDiv, sanitized || activeStream.content);
            }
            addErrorMessage(`Stream error: ${data.error}`);
            setActiveStream(null);
            setWaitingState(false);
            const userInput = getUserInput();
            if (userInput) userInput.focus();
            return;
          }

          if (data && data.message && typeof data.message.content === 'string') {
            activeStream.content += data.message.content;
            if (activeStream.contentDiv) {
              activeStream.contentDiv.textContent = activeStream.content;
            }
            if (typeof speakAssistantText === 'function') {
              const speechEngine = getSpeechEngine();
              if (!activeStream.ttsStreamId) {
                activeStream.ttsStreamId = `terminal:${activeStream.port || 'unknown'}:${Date.now()}`;
              }
              if (speechEngine && typeof speechEngine.ingestStreamText === 'function') {
                const chunkProfile = getSpeechChunkProfile();
                speechEngine.ingestStreamText(activeStream.ttsStreamId, activeStream.content, {
                  previewMaxChunkChars: Math.max(80, Number(chunkProfile?.preview) || 140),
                  segmentMaxChunkChars: Math.max(100, Number(chunkProfile?.segment) || 220)
                });
              } else {
                if (typeof activeStream.ttsSpokenChars !== 'number' || activeStream.ttsSpokenChars < 0) {
                  activeStream.ttsSpokenChars = 0;
                }
                if (typeof activeStream.ttsLastEnqueueAt !== 'number') {
                  activeStream.ttsLastEnqueueAt = 0;
                }
                const queueDepth = Math.max(0, Number(getTtsQueueDepth()) || 0);
                const nowMs = Date.now();
                const canEnqueue = queueDepth <= 1 && (nowMs - activeStream.ttsLastEnqueueAt) >= 1200;
                if (activeStream.ttsSpokenChars === 0) {
                  const preview = buildStreamingPreview(activeStream.content);
                  if (preview && canEnqueue) {
                    activeStream.ttsLastEnqueueAt = nowMs;
                    activeStream.ttsSpokenChars = Math.min(activeStream.content.length, preview.length);
                    addTtsDebug(`stream preview queued chars=${preview.length} spokenChars=${activeStream.ttsSpokenChars}`);
                    void speakAssistantText(preview, { maxChunkChars: 140 });
                  }
                } else {
                  const segment = buildStreamingSegment(activeStream.content, activeStream.ttsSpokenChars);
                  if (segment && canEnqueue) {
                    activeStream.ttsLastEnqueueAt = nowMs;
                    activeStream.ttsSpokenChars = Math.min(
                      activeStream.content.length,
                      activeStream.ttsSpokenChars + segment.length
                    );
                    addTtsDebug(`stream segment queued chars=${segment.length} spokenChars=${activeStream.ttsSpokenChars}`);
                    void speakAssistantText(segment, { maxChunkChars: 220 });
                  } else if (segment && !canEnqueue) {
                    addTtsDebug(`stream segment deferred queueDepth=${queueDepth}`);
                  }
                }
              }
            }
            const chatDisplay = getChatDisplay();
            if (chatDisplay) {
              chatDisplay.scrollTop = chatDisplay.scrollHeight;
            }
          }

          if (data && data.done) {
            const sanitized = sanitizeQwenSelfDialogue(activeStream.content);
            if (sanitized !== activeStream.content) {
              activeStream.content = sanitized;
            }
            if (activeStream.localOnly === true && !String(activeStream.content || '').startsWith('{local} ')) {
              activeStream.content = `{local} ${String(activeStream.content || '').trim()}`;
            }

            if (activeStream.contentDiv && activeStream.content) {
              finalizeStreamingMessage(activeStream.contentDiv, activeStream.content);
            }

            if (typeof speakAssistantText === 'function') {
              const speechEngine = getSpeechEngine();
              if (speechEngine && typeof speechEngine.finalizeStream === 'function' && activeStream.ttsStreamId) {
                const chunkProfile = getSpeechChunkProfile();
                speechEngine.finalizeStream(activeStream.ttsStreamId, activeStream.content, {
                  tailMaxChunkChars: Math.max(100, Number(chunkProfile?.tail) || 240)
                });
              } else {
                const spokenChars = Math.max(0, Number(activeStream.ttsSpokenChars) || 0);
                const remaining = String(activeStream.content || '').slice(spokenChars).trim();
                if (remaining) {
                  addTtsDebug(`stream done tail queued chars=${remaining.length} spokenChars=${spokenChars}`);
                  void speakAssistantText(remaining, { maxChunkChars: 240 });
                } else {
                  addTtsDebug(`stream done no tail spokenChars=${spokenChars}`);
                }
              }
            }

            if (activeStream.userMessage && activeStream.content) {
              appendConversationPair(activeStream.userMessage, activeStream.content, {
                skipTts: true,
                skipRelay: activeStream.localOnly === true
              });
            }

            setActiveStream(null);
            setWaitingState(false);
            const userInput = getUserInput();
            if (userInput) userInput.focus();
          }
        } catch (err) {
          console.error('[Terminal] Stream handler error:', err);
          const speechEngine = getSpeechEngine();
          if (speechEngine && typeof speechEngine.cancelStream === 'function' && activeStream.ttsStreamId) {
            speechEngine.cancelStream(activeStream.ttsStreamId);
          }
          addErrorMessage(`Stream handler error: ${err.message || err}`);
          setActiveStream(null);
          setWaitingState(false);
          const userInput = getUserInput();
          if (userInput) userInput.focus();
        }
      });
    }

    return {
      installStreamListener
    };
  }

  window.TerminalStream = {
    createStreamController
  };
})();
