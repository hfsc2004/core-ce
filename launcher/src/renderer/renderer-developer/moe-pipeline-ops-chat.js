/**
 * MOE PIPELINE OPS - Chat Operations
 */

let moeKvmTarget = 'pipeline';
let moeSessionMemoryEnabled = true;
let moeSessionMemoryLoaded = false;
let moeSessionMemoryLoadPromise = null;
let moePromptRecallHistory = [];
let moePromptRecallIndex = -1;
let moePromptRecallDraft = '';

function activateMoeChatInput(inputCandidate = null) {
  const input = inputCandidate instanceof HTMLInputElement
    ? inputCandidate
    : document.getElementById('moe-chat-input');
  if (!(input instanceof HTMLInputElement)) return;
  try {
    if (typeof window.focus === 'function') {
      window.focus();
    }
    if (document.activeElement !== input) input.focus({ preventScroll: true });
    input.style.caretColor = 'var(--psf-accent, #00d4ff)';
    input.style.cursor = 'text';
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : String(input.value || '').length;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
    if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(start, end);
    }
  } catch (_) {
    // no-op
  }
}

function recordMoeSessionMemory(entry = {}) {
  try {
    if (!moeSessionMemoryEnabled) return;
    if (!window.electronAPI || typeof window.electronAPI.sessionMemoryAppend !== 'function') return;
    window.electronAPI.sessionMemoryAppend({
      surface: 'moe-irg-embedded',
      sessionId: 'moe-embedded',
      role: String(entry.role || 'user'),
      channel: String(entry.channel || 'chat'),
      content: String(entry.content || ''),
      meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {}
    }).catch(() => {});
  } catch (_) {
    // no-op
  }
}

async function ensureMoeSessionMemoryState() {
  if (moeSessionMemoryLoaded) return;
  if (moeSessionMemoryLoadPromise) return moeSessionMemoryLoadPromise;
  moeSessionMemoryLoadPromise = (async () => {
  if (!window.electronAPI) return;
  try {
    if (typeof window.electronAPI.getSettings === 'function') {
      const settings = await window.electronAPI.getSettings();
      moeSessionMemoryEnabled = settings?.session_memory_enabled !== false;
    } else {
      moeSessionMemoryEnabled = true;
    }
    if (!moeSessionMemoryEnabled || typeof window.electronAPI.sessionMemoryList !== 'function') {
      moePromptRecallHistory = [];
      moePromptRecallIndex = -1;
      moePromptRecallDraft = '';
      return;
    }
    const rows = await window.electronAPI.sessionMemoryList({
      surface: 'moe-irg-embedded',
      sessionId: 'moe-embedded',
      role: 'user',
      direction: 'asc',
      limit: 500
    });
    moePromptRecallHistory = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const value = String(row?.content || '').trim();
      if (!value) continue;
      if (moePromptRecallHistory[moePromptRecallHistory.length - 1] === value) continue;
      moePromptRecallHistory.push(value);
    }
    if (moePromptRecallHistory.length > 500) {
      moePromptRecallHistory = moePromptRecallHistory.slice(-500);
    }
    moePromptRecallIndex = -1;
    moePromptRecallDraft = '';
  } catch (_) {
    moeSessionMemoryEnabled = true;
  }
  finally {
    moeSessionMemoryLoaded = true;
    moeSessionMemoryLoadPromise = null;
  }
  })();
  return moeSessionMemoryLoadPromise;
}

function addMoePromptRecallEntry(text) {
  if (!moeSessionMemoryEnabled) return;
  const value = String(text || '').trim();
  if (!value) return;
  const last = moePromptRecallHistory[moePromptRecallHistory.length - 1];
  if (last === value) return;
  moePromptRecallHistory.push(value);
  if (moePromptRecallHistory.length > 500) {
    moePromptRecallHistory = moePromptRecallHistory.slice(-500);
  }
  moePromptRecallIndex = -1;
  moePromptRecallDraft = '';
}

function applyMoePromptRecall(input, offset) {
  if (!moeSessionMemoryEnabled || !input || moePromptRecallHistory.length === 0) return false;
  if (offset < 0) {
    if (moePromptRecallIndex === -1) {
      moePromptRecallDraft = input.value;
    }
    if (moePromptRecallIndex < moePromptRecallHistory.length - 1) {
      moePromptRecallIndex += 1;
    }
  } else {
    if (moePromptRecallIndex === -1) return false;
    moePromptRecallIndex -= 1;
  }
  if (moePromptRecallIndex === -1) {
    input.value = moePromptRecallDraft;
  } else {
    input.value = moePromptRecallHistory[moePromptRecallHistory.length - 1 - moePromptRecallIndex];
  }
  const cursor = input.value.length;
  input.setSelectionRange(cursor, cursor);
  return true;
}

function handleMoeChatInputKeydown(event) {
  const input = event?.target;
  if (!(input instanceof HTMLInputElement)) return true;
  ensureMoeSessionMemoryState();
  if (event.key === 'ArrowUp') {
    if (applyMoePromptRecall(input, -1)) event.preventDefault();
    return false;
  }
  if (event.key === 'ArrowDown') {
    if (applyMoePromptRecall(input, 1)) event.preventDefault();
    return false;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMoeChatMessage();
    return false;
  }
  return true;
}

function updateKvmSelection() {
  const select = document.getElementById('moe-kvm-select');
  const indicator = document.getElementById('moe-kvm-indicator');
  const input = document.getElementById('moe-chat-input');

  if (!select) return;

  moeKvmTarget = select.value;

  if (indicator) {
    if (moeKvmTarget === 'pipeline') {
      indicator.textContent = '● Pipeline';
      indicator.style.color = '#00ff88';
    } else {
      const agent = window.modelOrderingState.moeItems.find(i => i.id === moeKvmTarget);
      indicator.textContent = `● Direct: ${agent?.name || 'Agent'}`;
      indicator.style.color = '#8a2be2';
    }
  }

  if (input) {
    if (moeKvmTarget === 'pipeline') {
      input.placeholder = 'Type a message to send through the full pipeline...';
    } else {
      const agent = window.modelOrderingState.moeItems.find(i => i.id === moeKvmTarget);
      input.placeholder = `Type a message directly to ${agent?.name || 'agent'}...`;
    }
  }
}

function initializeMoeChatInput() {
  const input = document.getElementById('moe-chat-input');
  if (!(input instanceof HTMLInputElement)) return;

  if (input.dataset.psfChatInit === '1') return;
  input.dataset.psfChatInit = '1';
  input.disabled = false;
  input.readOnly = false;
  input.tabIndex = 0;

  const restoreCaret = () => {
    activateMoeChatInput(input);
  };

  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
  });
  input.addEventListener('input', () => {
    input.style.caretColor = 'var(--psf-accent, #00d4ff)';
  });
  input.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    requestAnimationFrame(() => {
      activateMoeChatInput(input);
    });
  });
  input.addEventListener('focus', () => {
    requestAnimationFrame(restoreCaret);
  });
  input.addEventListener('mousedown', () => {
    requestAnimationFrame(() => {
      if (document.activeElement !== input) input.focus({ preventScroll: true });
    });
  });
  input.addEventListener('click', () => {
    requestAnimationFrame(() => {
      if (document.activeElement !== input) input.focus({ preventScroll: true });
      restoreCaret();
    });
  });
}

async function sendMoeChatMessage() {
  const input = document.getElementById('moe-chat-input');
  const messagesDiv = document.getElementById('moe-chat-messages');
  const statusSpan = document.getElementById('moe-chat-status');

  if (!input || !messagesDiv) return;

  const message = input.value.trim();
  if (!message) return;
  await ensureMoeSessionMemoryState();
  addMoePromptRecallEntry(message);

  input.value = '';

  const isPipeline = moeKvmTarget === 'pipeline';
  const targetAgent = !isPipeline ? window.modelOrderingState.moeItems.find(i => i.id === moeKvmTarget) : null;

  if (isPipeline) {
    appendChatMessage('user', message, null, 0, '→ Full Pipeline');
  } else {
    appendChatMessage('user', message, null, 0, `→ ${targetAgent?.name || 'Agent'}`);
  }

  if (statusSpan) {
    statusSpan.textContent = '(Processing...)';
    statusSpan.style.color = '#ffd400';
  }

  try {
    let result;

    if (isPipeline) {
      const irgInput = await window.MoePipelineOpsChatHelpers.getIrgInputGatewayState();
      if (irgInput.liveEnabled) {
        result = await window.electronAPI.routeMoEMessage(message, { irgModeOverride: 'live' });
      } else {
        result = await window.electronAPI.routeMoEMessage(message);
      }

      if (result.success) {
        if (result.trace && result.trace.steps) {
          for (const step of result.trace.steps) {
            appendChatMessage('agent', step.output, step.agentName, step.durationMs, '', step);
          }
        }
        appendChatMessage('final', result.response);

        const executionMode = String(result?.irg?.execution?.mode || '').toLowerCase();
        if (result?.irg?.handled && executionMode === 'simulate') {
          const reasonBits = [];
          if (!irgInput?.exists) {
            reasonBits.push('no input gateway configured');
          } else if (!irgInput?.enabled) {
            reasonBits.push('IRG is disabled on input gateway');
          } else if (irgInput?.mode && irgInput.mode !== 'live') {
            reasonBits.push(`executeMode is "${irgInput.mode}"`);
          }
          const reason = reasonBits.length ? ` (${reasonBits.join(', ')})` : '';
          appendChatMessage(
            'system',
            `IRG ran in simulate mode${reason}. Set input gateway IRG executeMode to "live" (with serial enabled) to deploy to hardware.`
          );
        }

        if (statusSpan) {
          const totalTime = result.trace?.totalDurationMs || 0;
          if (result?.irg?.handled && executionMode === 'simulate') {
            statusSpan.textContent = `(Ready - Simulated IRG, last: ${totalTime}ms)`;
          } else {
            statusSpan.textContent = `(Ready - last: ${totalTime}ms)`;
          }
          statusSpan.style.color = '#00ff88';
        }
      } else {
        const detail = String(result?.response || '').trim();
        if (detail) {
          if (result.trace && result.trace.steps) {
            for (const step of result.trace.steps) {
              appendChatMessage('agent', step.output, step.agentName, step.durationMs, '', step);
            }
          }
          appendChatMessage('final', detail);
          if (statusSpan) {
            statusSpan.textContent = '(Blocked)';
            statusSpan.style.color = '#ff6b6b';
          }
        } else {
          throw new Error(result.error || 'Pipeline error');
        }
      }
    } else {
      result = await window.electronAPI.sendToMoEAgent(moeKvmTarget, message);

      if (result.success) {
        appendChatMessage('direct', result.content, targetAgent?.name);

        if (statusSpan) {
          statusSpan.textContent = '(Ready - Direct Mode)';
          statusSpan.style.color = '#8a2be2';
        }
      } else {
        throw new Error(result.error || 'Agent error');
      }
    }
  } catch (err) {
    appendChatMessage('error', err.message);
    if (statusSpan) {
      statusSpan.textContent = '(Error)';
      statusSpan.style.color = '#ff6b6b';
    }
  }
}

function openMoeDryRunPreviewModal(previewText) {
  return window.MoePipelineChatRenderOps?.openMoeDryRunPreviewModal
    ? window.MoePipelineChatRenderOps.openMoeDryRunPreviewModal(previewText, { escapeHtml })
    : Promise.resolve(false);
}

function appendChatMessage(type, content, agentName = '', durationMs = 0, routeInfo = '', meta = null) {
  const messagesDiv = document.getElementById('moe-chat-messages');
  if (!messagesDiv) return;

  if (messagesDiv.querySelector('div[style*="text-align: center"]')) {
    messagesDiv.innerHTML = '';
  }

  const msgDiv = document.createElement('div');
  msgDiv.style.marginBottom = '12px';
  msgDiv.style.padding = '8px 12px';
  msgDiv.style.borderRadius = '6px';

  const timestamp = new Date().toLocaleTimeString();

  switch (type) {
    case 'user':
      msgDiv.style.background = 'rgba(0,212,255,0.1)';
      msgDiv.style.borderLeft = '3px solid var(--psf-accent, #00d4ff)';
      msgDiv.innerHTML = `
        <div style="color: var(--psf-accent, #00d4ff); font-size: 11px; margin-bottom: 4px;">
          👤 You (${timestamp}) <span style="color: #666;">${routeInfo}</span>
        </div>
        <div style="color: #fff; white-space: pre-wrap; word-break: break-word; line-height: 1.45;">${escapeHtml(content)}</div>
      `;
      break;

    case 'agent':
      msgDiv.style.background = 'rgba(138,43,226,0.1)';
      msgDiv.style.borderLeft = '3px solid #8a2be2';
      const routeLine = buildInlineRouteTrace(meta);
      const handoffDetails = buildInlineHandoffDetails(meta);
      msgDiv.innerHTML = `
        <div style="color: #8a2be2; font-size: 11px; margin-bottom: 4px;">
          🤖 ${agentName} <span style="color: #666;">(${durationMs}ms)</span>
        </div>
        ${routeLine}
        <div style="color: #ccc; font-size: 12px; line-height: 1.45;">${formatPipelineChatContent(content, { maxLength: 2000 })}</div>
        ${handoffDetails}
      `;
      break;

    case 'direct':
      msgDiv.style.background = 'rgba(138,43,226,0.2)';
      msgDiv.style.borderLeft = '3px solid #8a2be2';
      msgDiv.innerHTML = `
        <div style="color: #8a2be2; font-size: 11px; margin-bottom: 4px;">
          🎛️ ${agentName} (Direct) <span style="color: #666;">${timestamp}</span>
        </div>
        <div style="color: #fff; line-height: 1.45;">${formatPipelineChatContent(content, { maxLength: 2400 })}</div>
      `;
      break;

    case 'final':
      msgDiv.style.background = 'rgba(0,255,136,0.1)';
      msgDiv.style.borderLeft = '3px solid #00ff88';
      msgDiv.innerHTML = `
        <div style="color: #00ff88; font-size: 11px; margin-bottom: 4px;">✅ Final Response (Pipeline)</div>
        <div style="color: #fff; line-height: 1.45;">${formatPipelineChatContent(content, { maxLength: 4000 })}</div>
      `;
      break;

    case 'error':
      msgDiv.style.background = 'rgba(255,107,107,0.1)';
      msgDiv.style.borderLeft = '3px solid #ff6b6b';
      msgDiv.innerHTML = `
        <div style="color: #ff6b6b; font-size: 11px; margin-bottom: 4px;">❌ Error</div>
        <div style="color: #ff6b6b; white-space: pre-wrap; word-break: break-word; line-height: 1.45;">${escapeHtml(content)}</div>
      `;
      break;

    case 'system':
      msgDiv.style.background = 'rgba(255, 212, 0, 0.08)';
      msgDiv.style.borderLeft = '3px solid #ffd400';
      msgDiv.innerHTML = `
        <div style="color: #ffd400; font-size: 11px; margin-bottom: 4px;">💡 System</div>
        <div style="color: #ddd; white-space: pre-wrap; word-break: break-word; line-height: 1.45;">${escapeHtml(content)}</div>
      `;
      break;
  }

  if (type === 'user') {
    recordMoeSessionMemory({
      role: 'user',
      channel: moeKvmTarget === 'pipeline' ? 'pipeline-chat' : 'direct-chat',
      content,
      meta: { routeInfo, target: moeKvmTarget }
    });
  } else if (type === 'agent' || type === 'direct' || type === 'final' || type === 'error' || type === 'system') {
    recordMoeSessionMemory({
      role: type === 'error' ? 'error' : 'assistant',
      channel: type,
      content,
      meta: { agentName, durationMs, routeInfo }
    });
  }

  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function formatPipelineChatContent(text, options = {}) {
  return window.MoePipelineChatRenderOps?.formatPipelineChatContent
    ? window.MoePipelineChatRenderOps.formatPipelineChatContent(text, options, { escapeHtml })
    : escapeHtml(String(text || ''));
}

function buildInlineRouteTrace(meta) {
  return window.MoePipelineChatRenderOps?.buildInlineRouteTrace
    ? window.MoePipelineChatRenderOps.buildInlineRouteTrace(meta, { escapeHtml })
    : '';
}

function buildInlineHandoffDetails(meta) {
  return window.MoePipelineChatRenderOps?.buildInlineHandoffDetails
    ? window.MoePipelineChatRenderOps.buildInlineHandoffDetails(meta, { escapeHtml })
    : '';
}

window.updateKvmSelection = updateKvmSelection;
window.handleMoeChatInputKeydown = handleMoeChatInputKeydown;
window.sendMoeChatMessage = sendMoeChatMessage;
window.appendChatMessage = appendChatMessage;
window.formatPipelineChatContent = formatPipelineChatContent;
window.buildInlineRouteTrace = buildInlineRouteTrace;
window.buildInlineHandoffDetails = buildInlineHandoffDetails;
window.openMoeChatWindow = () => window.MoePipelineOpsChatHelpers.openMoeChatWindow();
window.initializeMoeChatInput = initializeMoeChatInput;
window.activateMoeChatInput = activateMoeChatInput;
