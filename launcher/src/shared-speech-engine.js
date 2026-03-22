/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function initPsfSpeechEngine(global) {
  'use strict';

  function splitSpeechChunks(text, maxLen = 240) {
    const value = String(text || '').trim();
    if (!value) return [];
    const units = value.match(/[^.!?]+[.!?]?/g) || [value];
    const chunks = [];
    let current = '';
    for (const unitRaw of units) {
      const unit = String(unitRaw || '').trim();
      if (!unit) continue;
      if (!current) {
        current = unit;
        continue;
      }
      if ((current.length + 1 + unit.length) <= maxLen) {
        current += ` ${unit}`;
      } else {
        chunks.push(current);
        current = unit;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  function buildStreamingPreview(text) {
    const content = String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!content || content.length < 20) return '';
    const clauses = content.match(/[^,;:.!?]+[,;:.!?]?/g) || [];
    const first = String(clauses[0] || '').trim();
    if (!first || first.length < 18) return '';
    if (!/[,;:.!?]$/.test(first)) {
      if (content.length < 24) return '';
      const soft = content.slice(0, 72);
      const cut = Math.max(soft.lastIndexOf(' '), soft.lastIndexOf(','), soft.lastIndexOf(';'));
      const preview = (cut > 20 ? soft.slice(0, cut) : soft).trim();
      return preview.length >= 20 ? preview : '';
    }
    if (/,$/.test(first) && first.length < 16) return '';
    return first.slice(0, 110).trim();
  }

  function buildStreamingSegment(text, startIndex = 0) {
    const content = String(text || '');
    const start = Math.max(0, Number(startIndex) || 0);
    if (start >= content.length) return '';
    const tail = content.slice(start);
    if (tail.trim().length < 40) return '';

    const punctWindow = tail.slice(0, 220);
    const punctMatch = punctWindow.match(/^([\s\S]{40,170}[.!?;:])\s/);
    if (punctMatch && punctMatch[1]) {
      return String(punctMatch[1]).trim();
    }

    if (tail.length < 120) return '';
    const soft = tail.slice(0, 170);
    const lastSpace = soft.lastIndexOf(' ');
    const cut = lastSpace > 90 ? lastSpace : 130;
    return soft.slice(0, cut).trim();
  }

  function createSpeechEngine(options = {}) {
    const runSpeak = typeof options.runSpeak === 'function' ? options.runSpeak : null;
    const runSynthesize = typeof options.runSynthesize === 'function' ? options.runSynthesize : null;
    const runPlayAudio = typeof options.runPlayAudio === 'function' ? options.runPlayAudio : null;
    const interruptPlayback = typeof options.interruptPlayback === 'function' ? options.interruptPlayback : null;
    const debugEnabled = typeof options.isDebugEnabled === 'function' ? options.isDebugEnabled : (() => false);
    const onDebug = typeof options.onDebug === 'function' ? options.onDebug : (() => {});
    const splitFn = typeof options.splitChunks === 'function' ? options.splitChunks : splitSpeechChunks;
    const streamPreviewFn = typeof options.buildStreamPreview === 'function' ? options.buildStreamPreview : buildStreamingPreview;
    const streamSegmentFn = typeof options.buildStreamSegment === 'function' ? options.buildStreamSegment : buildStreamingSegment;
    let minEnqueueIntervalMs = Math.max(200, Number(options.minEnqueueIntervalMs) || 1200);
    let maxQueueDepthForStream = Math.max(0, Number(options.maxQueueDepthForStream) || 1);
    let minContentCharsForIncrementalSegments = Math.max(120, Number(options.minContentCharsForIncrementalSegments) || 300);
    let minTailSpeakChars = Math.max(0, Number(options.minTailSpeakChars) || 24);
    const debugQueueEvents = options.debugQueueEvents === true;
    const logDeferred = options.logDeferred === true;
    const debugDeferredIntervalMs = Math.max(250, Number(options.debugDeferredIntervalMs) || 1800);
    let maxAudioQueueDepth = Math.max(1, Number(options.maxAudioQueueDepth) || 4);
    let minAudioQueueBeforePlay = Math.max(1, Number(options.minAudioQueueBeforePlay) || 1);

    let queueDepth = 0;
    let jobSeq = 0;
    let synthLoopRunning = false;
    let playLoopRunning = false;
    let synthInFlight = 0;
    let playInFlight = 0;
    const textQueue = [];
    const audioQueue = [];
    const streamState = new Map();
    const cancelledStreams = new Set();

    function log(message) {
      if (!debugEnabled()) return;
      onDebug(`[SpeechEngine] ${message}`);
    }

    function getQueueDepth() {
      return queueDepth;
    }

    function recomputeQueueDepth() {
      queueDepth = textQueue.length + audioQueue.length + synthInFlight + playInFlight;
    }

    function getStream(streamId) {
      const key = String(streamId || 'default');
      let state = streamState.get(key);
      if (!state) {
        state = {
          spokenChars: 0,
          lastEnqueueAt: 0,
          lastDeferredLogAt: {
            preview: 0,
            bootstrap: 0,
            segment: 0
          }
        };
        streamState.set(key, state);
      }
      return state;
    }

    function maybeLogDeferred(state, type, message) {
      if (!logDeferred) return;
      const now = Date.now();
      const last = Number(state?.lastDeferredLogAt?.[type] || 0);
      if ((now - last) < debugDeferredIntervalMs) return;
      if (state?.lastDeferredLogAt) state.lastDeferredLogAt[type] = now;
      log(message);
    }

    function pushTextJob(chunkText, options = {}) {
      const text = String(chunkText || '').trim();
      if (!text || (!runSpeak && !runSynthesize)) return;
      const streamId = options.streamId ? String(options.streamId) : '';
      const jobId = ++jobSeq;
      textQueue.push({ jobId, text, options, streamId });
      recomputeQueueDepth();
      if (debugQueueEvents) log(`text +1 job=${jobId} depth=${queueDepth}`);
      void pumpSynthesis();
    }

    async function enqueueText(text, options = {}) {
      const value = String(text || '').trim();
      if (!value) return;
      const maxChunkChars = Math.max(80, Number(options.maxChunkChars) || 360);
      const chunks = splitFn(value, maxChunkChars);
      for (const chunk of chunks) {
        pushTextJob(chunk, options);
      }
    }

    function enqueueTextDeferred(text, options = {}) {
      void enqueueText(text, options);
    }

    async function pumpSynthesis() {
      if (synthLoopRunning) return;
      synthLoopRunning = true;
      try {
        while (textQueue.length > 0) {
          if (audioQueue.length >= maxAudioQueueDepth) break;
          const job = textQueue.shift();
          if (!job) break;
          const { jobId, text, options: jobOptions, streamId } = job;
          if (streamId && cancelledStreams.has(streamId)) {
            recomputeQueueDepth();
            if (debugQueueEvents) log(`text skip cancelled stream=${streamId} job=${jobId}`);
            continue;
          }
          synthInFlight += 1;
          recomputeQueueDepth();
          try {
            if (runSynthesize && runPlayAudio) {
              const result = await runSynthesize(text, jobOptions || {});
              if (result?.success && result?.audioBase64) {
                audioQueue.push({
                  jobId,
                  streamId,
                  audioBase64: result.audioBase64,
                  mimeType: result.mimeType || 'audio/wav'
                });
                recomputeQueueDepth();
                if (debugQueueEvents) log(`audio +1 job=${jobId} depth=${queueDepth}`);
                void pumpPlayback();
              }
            } else if (runSpeak) {
              // Fallback for non-pipelined integrations.
              audioQueue.push({
                jobId,
                streamId,
                directSpeakText: text,
                directSpeakOptions: jobOptions || {}
              });
              recomputeQueueDepth();
              if (debugQueueEvents) log(`audio +1(direct) job=${jobId} depth=${queueDepth}`);
              void pumpPlayback();
            }
          } finally {
            synthInFlight = Math.max(0, synthInFlight - 1);
            recomputeQueueDepth();
          }
        }
      } finally {
        synthLoopRunning = false;
        // If items remain and playback has drained, allow synthesis to continue.
        if (textQueue.length > 0 && audioQueue.length < maxAudioQueueDepth) {
          void pumpSynthesis();
        }
      }
    }

    async function pumpPlayback() {
      if (playLoopRunning) return;
      playLoopRunning = true;
      try {
        while (audioQueue.length > 0) {
          if (audioQueue.length < minAudioQueueBeforePlay && (textQueue.length > 0 || synthInFlight > 0)) {
            break;
          }
          const job = audioQueue.shift();
          if (!job) break;
          const streamId = job.streamId ? String(job.streamId) : '';
          if (streamId && cancelledStreams.has(streamId)) {
            recomputeQueueDepth();
            if (debugQueueEvents) log(`audio skip cancelled stream=${streamId} job=${job.jobId}`);
            continue;
          }
          playInFlight += 1;
          recomputeQueueDepth();
          try {
            if (job.directSpeakText && runSpeak) {
              await runSpeak(job.directSpeakText, job.directSpeakOptions || {});
            } else if (runPlayAudio && job.audioBase64) {
              await runPlayAudio(job, job.directSpeakOptions || {});
            }
          } finally {
            playInFlight = Math.max(0, playInFlight - 1);
            recomputeQueueDepth();
            if (debugQueueEvents) log(`audio -1 job=${job.jobId} depth=${queueDepth}`);
          }
          if (textQueue.length > 0 && audioQueue.length < maxAudioQueueDepth) {
            void pumpSynthesis();
          }
        }
      } finally {
        playLoopRunning = false;
      }
    }

    function configure(next = {}) {
      if (!next || typeof next !== 'object') return;
      if (Number.isFinite(next.minEnqueueIntervalMs)) {
        minEnqueueIntervalMs = Math.max(200, Number(next.minEnqueueIntervalMs));
      }
      if (Number.isFinite(next.maxQueueDepthForStream)) {
        maxQueueDepthForStream = Math.max(0, Number(next.maxQueueDepthForStream));
      }
      if (Number.isFinite(next.minContentCharsForIncrementalSegments)) {
        minContentCharsForIncrementalSegments = Math.max(120, Number(next.minContentCharsForIncrementalSegments));
      }
      if (Number.isFinite(next.minTailSpeakChars)) {
        minTailSpeakChars = Math.max(0, Number(next.minTailSpeakChars));
      }
      if (Number.isFinite(next.maxAudioQueueDepth)) {
        maxAudioQueueDepth = Math.max(1, Number(next.maxAudioQueueDepth));
      }
      if (Number.isFinite(next.minAudioQueueBeforePlay)) {
        minAudioQueueBeforePlay = Math.max(1, Number(next.minAudioQueueBeforePlay));
      }
    }

    function canEnqueue(state) {
      const nowMs = Date.now();
      const depth = getQueueDepth();
      return depth <= maxQueueDepthForStream && (nowMs - state.lastEnqueueAt) >= minEnqueueIntervalMs;
    }

    function ingestStreamText(streamId, fullText, options = {}) {
      const sid = String(streamId || 'default');
      const state = getStream(sid);
      const content = String(fullText || '');
      if (!content) return false;

      if (state.spokenChars === 0) {
        const preview = streamPreviewFn(content);
        if (preview) {
          if (!canEnqueue(state)) {
            maybeLogDeferred(state, 'preview', `stream preview deferred stream=${sid} depth=${getQueueDepth()}`);
            return false;
          }
          state.lastEnqueueAt = Date.now();
          state.spokenChars = Math.min(content.length, preview.length);
          log(`stream preview queued stream=${sid} chars=${preview.length} spokenChars=${state.spokenChars}`);
        enqueueTextDeferred(preview, {
            ...options,
            streamId: sid,
            maxChunkChars: Math.max(80, Number(options.previewMaxChunkChars) || 180)
          });
          return true;
        }

        // If preview cannot form (for example punctuation-light output),
        // force a first segment from the stream buffer so speech starts early.
        const bootstrapSegment = streamSegmentFn(content, 0);
        if (!bootstrapSegment) return false;
        if (!canEnqueue(state)) {
          maybeLogDeferred(state, 'bootstrap', `stream bootstrap deferred stream=${sid} depth=${getQueueDepth()}`);
          return false;
        }
        state.lastEnqueueAt = Date.now();
        state.spokenChars = Math.min(content.length, bootstrapSegment.length);
        log(`stream bootstrap queued stream=${sid} chars=${bootstrapSegment.length} spokenChars=${state.spokenChars}`);
        enqueueTextDeferred(bootstrapSegment, {
          ...options,
          streamId: sid,
          maxChunkChars: Math.max(80, Number(options.segmentMaxChunkChars) || 420)
        });
        return true;
      }

      const segment = streamSegmentFn(content, state.spokenChars);
      if (content.length < minContentCharsForIncrementalSegments) return false;
      if (!segment) return false;
      if (!canEnqueue(state)) {
        maybeLogDeferred(state, 'segment', `stream segment deferred stream=${sid} depth=${getQueueDepth()}`);
        return false;
      }
      state.lastEnqueueAt = Date.now();
      state.spokenChars = Math.min(content.length, state.spokenChars + segment.length);
      log(`stream segment queued stream=${sid} chars=${segment.length} spokenChars=${state.spokenChars}`);
      enqueueTextDeferred(segment, {
        ...options,
        streamId: sid,
        maxChunkChars: Math.max(80, Number(options.segmentMaxChunkChars) || 420)
      });
      return true;
    }

    function finalizeStream(streamId, fullText, options = {}) {
      const sid = String(streamId || 'default');
      const state = getStream(sid);
      const content = String(fullText || '');
      const spokenChars = Math.max(0, Number(state.spokenChars) || 0);
      const remaining = content.slice(spokenChars).trim();
      streamState.delete(sid);
      cancelledStreams.delete(sid);
      if (remaining.length > 0 && remaining.length < minTailSpeakChars) {
        log(`stream done tiny tail dropped stream=${sid} chars=${remaining.length} spokenChars=${spokenChars}`);
        return false;
      }
      if (!remaining) {
        log(`stream done no tail stream=${sid} spokenChars=${spokenChars}`);
        return false;
      }
      log(`stream done tail queued stream=${sid} chars=${remaining.length} spokenChars=${spokenChars}`);
      enqueueTextDeferred(remaining, {
        ...options,
        streamId: sid,
        maxChunkChars: Math.max(80, Number(options.tailMaxChunkChars) || 720)
      });
      return true;
    }

    function cancelStream(streamId) {
      const sid = String(streamId || 'default');
      cancelledStreams.add(sid);
      streamState.delete(sid);
      for (let i = textQueue.length - 1; i >= 0; i -= 1) {
        if (String(textQueue[i]?.streamId || '') === sid) {
          textQueue.splice(i, 1);
        }
      }
      for (let i = audioQueue.length - 1; i >= 0; i -= 1) {
        if (String(audioQueue[i]?.streamId || '') === sid) {
          audioQueue.splice(i, 1);
        }
      }
      if (interruptPlayback) {
        try { interruptPlayback(); } catch (_) {}
      }
      recomputeQueueDepth();
      log(`stream cancelled stream=${sid}`);
    }

    function reset() {
      streamState.clear();
      cancelledStreams.clear();
      textQueue.length = 0;
      audioQueue.length = 0;
      if (interruptPlayback) {
        try { interruptPlayback(); } catch (_) {}
      }
      recomputeQueueDepth();
    }

    return {
      enqueueText,
      enqueueTextDeferred,
      ingestStreamText,
      finalizeStream,
      cancelStream,
      getQueueDepth,
      configure,
      reset
    };
  }

  global.PsfSpeechEngine = {
    createSpeechEngine
  };
})(window);
