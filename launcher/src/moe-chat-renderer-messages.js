/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

window.createMoeChatMessageOps = function createMoeChatMessageOps(ctx = {}) {
  const getElements = () => (typeof ctx.getElements === 'function' ? ctx.getElements() : {});
  const getKvmTarget = () => (typeof ctx.getKvmTarget === 'function' ? ctx.getKvmTarget() : 'pipeline');
  const renderUtils = () => (typeof ctx.getRenderUtils === 'function' ? (ctx.getRenderUtils() || {}) : {});

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
        headerText = '💡 System';
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
    addSystemMessage
  };
};
