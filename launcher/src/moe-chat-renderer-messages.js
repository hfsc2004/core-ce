/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

window.createMoeChatMessageOps = function createMoeChatMessageOps(ctx = {}) {
  const getElements = () => (typeof ctx.getElements === 'function' ? ctx.getElements() : {});
  const getKvmTarget = () => (typeof ctx.getKvmTarget === 'function' ? ctx.getKvmTarget() : 'pipeline');
  const renderUtils = () => (typeof ctx.getRenderUtils === 'function' ? (ctx.getRenderUtils() || {}) : {});
  const ACTIVITY_MAX = 1500;
  const activeStreams = new Map();

  function compactActivityText(value, max = 220) {
    const raw = String(value || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    return raw.length > max ? `${raw.slice(0, max)}...` : raw;
  }

  function appendActivityLine(message, level = 'info') {
    const elements = getElements();
    const body = elements?.activityLog;
    if (!body) return;
    const stamp = new Date().toLocaleTimeString();
    const safeMessage = String(message || '').trim();
    if (!safeMessage) return;
    const safeLevel = String(level || 'info').trim().toLowerCase();
    const color = safeLevel === 'error'
      ? '#ff9b9b'
      : safeLevel === 'warn'
        ? '#ffd38a'
        : safeLevel === 'success'
          ? '#8dffbd'
          : '#9fb2cc';
    if (body.textContent.includes('No activity yet.')) {
      body.innerHTML = '';
    }
    const line = document.createElement('div');
    line.style.color = color;
    line.textContent = `[${stamp}] ${safeMessage}`;
    body.appendChild(line);
    while (body.childElementCount > ACTIVITY_MAX) {
      body.removeChild(body.firstChild);
    }
    body.scrollTop = body.scrollHeight;
  }

  function clearActivityLog() {
    const elements = getElements();
    const body = elements?.activityLog;
    if (!body) return;
    body.innerHTML = '<div class="activity-empty">No activity yet.</div>';
    activeStreams.clear();
  }

  function beginActivityStream(agentId, agentName = '') {
    const elements = getElements();
    const body = elements?.activityLog;
    if (!body) return;
    if (body.textContent.includes('No activity yet.')) {
      body.innerHTML = '';
    }
    const row = document.createElement('div');
    row.style.marginBottom = '8px';
    const header = document.createElement('div');
    header.style.color = '#8dffbd';
    header.style.fontWeight = '600';
    header.textContent = `[${new Date().toLocaleTimeString()}] ${agentName || agentId || 'Agent'} (streaming)`;
    const bodyText = document.createElement('div');
    bodyText.style.color = '#b9c9dc';
    bodyText.style.whiteSpace = 'pre-wrap';
    bodyText.style.wordBreak = 'break-word';
    row.appendChild(header);
    row.appendChild(bodyText);
    body.appendChild(row);
    activeStreams.set(String(agentId || ''), { row, header, bodyText, chars: 0 });
    while (body.childElementCount > ACTIVITY_MAX) {
      body.removeChild(body.firstChild);
    }
    body.scrollTop = body.scrollHeight;
  }

  function appendActivityStream(agentId, chunk) {
    const key = String(agentId || '');
    if (!key) return;
    const stream = activeStreams.get(key);
    if (!stream) return;
    const text = String(chunk || '');
    if (!text) return;
    stream.bodyText.textContent += text;
    stream.chars += text.length;
    const elements = getElements();
    const body = elements?.activityLog;
    if (body) body.scrollTop = body.scrollHeight;
  }

  function endActivityStream(agentId, payload = {}) {
    const key = String(agentId || '');
    if (!key) return;
    const stream = activeStreams.get(key);
    if (!stream) return;
    const success = payload?.success !== false;
    const durationMs = Number(payload?.durationMs || 0);
    stream.header.style.color = success ? '#8dffbd' : '#ff9b9b';
    stream.header.textContent = `[${new Date().toLocaleTimeString()}] ${payload?.agentName || key} (${success ? 'done' : 'error'}${durationMs > 0 ? `, ${durationMs}ms` : ''})`;
    activeStreams.delete(key);
  }

  function renderPipelineResult(result) {
    if (result?.trace?.steps) {
      for (const step of result.trace.steps) {
        addMessage('agent', step.output, step.agentName, step.durationMs, '', step);
      }
    }
    addMessage('final', result?.response || '');
    const totalTime = result?.trace?.totalDurationMs || 0;
    if (typeof ctx.setStatus === 'function') {
      ctx.setStatus('connected', `Ready • Last: ${totalTime}ms`);
    }
  }

  function addMessage(type, content, agentName = '', durationMs = 0, routeInfo = '', meta = null) {
    const elements = getElements();
    const messagesEl = elements?.messages;
    if (!messagesEl) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ' + type;

    const timestamp = new Date().toLocaleTimeString();
    const ops = renderUtils();

    let headerText = '';
    let contentText = (ops.escapeHtml || ((x) => String(x || '')))(content);

    switch (type) {
      case 'user':
        headerText = `👤 You (${timestamp}) <span style="color:#666;">${routeInfo}</span>`;
        break;
      case 'agent':
        headerText = `🤖 ${agentName} <span style="color:#666;">(${durationMs}ms)</span>`;
        contentText = ops.formatChatContent ? ops.formatChatContent(content, { maxLength: 2000 }) : String(content || '');
        break;
      case 'direct':
        headerText = `🎛️ ${agentName} (Direct) <span style="color:#666;">${timestamp}</span>`;
        contentText = ops.formatChatContent ? ops.formatChatContent(content, { maxLength: 2400 }) : String(content || '');
        break;
      case 'final':
        headerText = '✅ Final Response (Pipeline)';
        contentText = ops.formatChatContent ? ops.formatChatContent(content, { maxLength: 4000 }) : String(content || '');
        break;
      case 'error':
        headerText = '❌ Error';
        break;
      case 'system':
        headerText = `<span class="message-header-inline message-system-inline"><span class="message-info-icon" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#58a6ff" stroke-width="1.5" stroke-linecap="round"><circle cx="5" cy="5" r="4"></circle><line x1="5" y1="4" x2="5" y2="7"></line><circle cx="5" cy="2.5" r="0.4" fill="#58a6ff" stroke="none"></circle></svg></span>SYSTEM</span>`;
        break;
      default:
        break;
    }

    const snippet = compactActivityText(content);
    switch (type) {
    case 'user':
      appendActivityLine(`USER ${routeInfo || ''}: ${snippet || '(empty)'}`, 'info');
      break;
    case 'agent':
      appendActivityLine(`AGENT ${agentName || 'Unknown'} (${durationMs}ms): ${snippet || '(empty)'}`, 'success');
      break;
    case 'direct':
      appendActivityLine(`DIRECT ${agentName || 'Agent'}: ${snippet || '(empty)'}`, 'success');
      break;
    case 'final':
      appendActivityLine(`FINAL: ${snippet || '(empty)'}`, 'success');
      break;
    case 'error':
      appendActivityLine(`ERROR: ${snippet || '(empty)'}`, 'error');
      break;
    case 'system':
      appendActivityLine(`SYSTEM: ${snippet || '(empty)'}`, 'warn');
      break;
    default:
      break;
    }

    const routeLine = type === 'agent' && ops.buildRouteTraceLine ? ops.buildRouteTraceLine(meta) : '';
    const handoffDetails = type === 'agent' && ops.buildHandoffDetails ? ops.buildHandoffDetails(meta) : '';

    msgDiv.innerHTML = `
      <div class="message-header">${headerText}</div>
      ${routeLine}
      <div class="message-content">${contentText}</div>
      ${handoffDetails}
    `;

    const contract = (type === 'agent' || type === 'final') && ops.extractIrgContractFromText
      ? ops.extractIrgContractFromText(content)
      : null;
    if (contract) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';
      const runBtn = document.createElement('button');
      runBtn.className = 'message-action-btn';
      runBtn.textContent = '▶ Run This Contract';
      runBtn.addEventListener('click', () => ctx.runContractFromMessage?.(contract));
      actionsDiv.appendChild(runBtn);
      msgDiv.appendChild(actionsDiv);
    }

    const sessionController = ctx.sessionController || null;
    if (type === 'user') {
      sessionController?.recordSessionMemory?.(window.electronAPI, {
        role: 'user',
        channel: getKvmTarget() === 'pipeline' ? 'pipeline-chat' : 'direct-chat',
        content,
        meta: { routeInfo, target: getKvmTarget() }
      });
    } else if (type === 'agent' || type === 'direct' || type === 'final' || type === 'error') {
      sessionController?.recordSessionMemory?.(window.electronAPI, {
        role: type === 'error' ? 'error' : 'assistant',
        channel: type,
        content,
        meta: { agentName, durationMs, routeInfo }
      });
    }

    messagesEl.appendChild(msgDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (type === 'final' || type === 'direct') {
      void ctx.speakAssistantText?.(content);
    }
  }

  function addSystemMessage(text) {
    addMessage('system', text);
  }

  return {
    renderPipelineResult,
    addMessage,
    addSystemMessage,
    appendActivityLine,
    clearActivityLog,
    beginActivityStream,
    appendActivityStream,
    endActivityStream
  };
};
