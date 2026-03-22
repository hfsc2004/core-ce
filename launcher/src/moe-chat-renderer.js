const MoEChat = (function() {
  const REQUEST_TIMEOUT_MS = 180000;
  let kvmTarget = 'pipeline';  // 'pipeline' or agent ID
  let agents = [];  // Populated from deployment status
  let isProcessing = false;
  let attachedCodeFile = null;
  let latestEsp32Telemetry = null;
  let latestEsp32TelemetryAt = '';
  let voiceController = null;
  let speechEngine = null;
  const sessionOps = window.MoeChatSessionOps || null;
  const sessionController = sessionOps?.createController
    ? sessionOps.createController()
    : null;
  let elements = {};
  const voiceActivityOps = window.createMoeChatVoiceActivityOps
    ? window.createMoeChatVoiceActivityOps({
      getElements: () => elements,
      isProcessing: () => isProcessing,
      setStatus,
      addSystemMessage,
      sendMessage
    })
    : null;
  const renderUtils = window.createMoeChatRenderUtilsOps
    ? window.createMoeChatRenderUtilsOps({ requestTimeoutMs: REQUEST_TIMEOUT_MS })
    : null;
  const esp32Ops = window.createMoeChatEsp32Ops
    ? window.createMoeChatEsp32Ops({
      getElectronAPI: () => window.electronAPI || null,
      getAttachedCodeFile: () => attachedCodeFile,
      getLatestTelemetry: () => ({ data: latestEsp32Telemetry, at: latestEsp32TelemetryAt }),
      setLatestTelemetry: (data, atIso) => {
        latestEsp32Telemetry = data;
        latestEsp32TelemetryAt = atIso;
      }
    })
    : null;
  const messageOps = window.createMoeChatMessageOps
    ? window.createMoeChatMessageOps({
      getElements: () => elements,
      getKvmTarget: () => kvmTarget,
      getRenderUtils: () => renderUtils,
      setStatus,
      runContractFromMessage,
      speakAssistantText,
      sessionController
    })
    : null;
  const pipelineOps = window.createMoeChatPipelineOps
    ? window.createMoeChatPipelineOps({
      getElements: () => elements,
      getAgents: () => agents,
      setAgents: (next) => { agents = Array.isArray(next) ? next : []; },
      setKvmTarget: (next) => { kvmTarget = String(next || 'pipeline'); },
      addSystemMessage,
      startEsp32TelemetryPolling,
      stopEsp32TelemetryPolling
    })
    : null;

  /**
   * Initialize the chat interface
   */
  async function initialize() {
    console.log('[MoE Chat] Initializing...');
    if (sessionOps?.applyGlobalThemeFromSettings) {
      await sessionOps.applyGlobalThemeFromSettings(window.electronAPI);
      if (window.electronAPI?.onThemeUpdated) {
        window.electronAPI.onThemeUpdated(() => {
          sessionOps.applyGlobalThemeFromSettings(window.electronAPI);
        });
      }
    }
    if (sessionController?.loadState) {
      await sessionController.loadState(window.electronAPI);
    }
    elements = {
      messages: document.getElementById('chat-messages'),
      input: document.getElementById('chat-input'),
      sendBtn: document.getElementById('send-btn'),
      attachBtn: document.getElementById('attach-btn'),
      attachedFileChip: document.getElementById('attached-file-chip'),
      clearAttachBtn: document.getElementById('clear-attach-btn'),
      voiceBtn: document.getElementById('voice-btn'),
      voiceModeBtn: document.getElementById('voice-mode-btn'),
      statusBadge: document.getElementById('status-badge'),
      kvmSelect: document.getElementById('kvm-select'),
      kvmIndicator: document.getElementById('kvm-indicator'),
      pipelineFlow: document.getElementById('pipeline-flow')
    };
    bindEvents();
    updateAttachedFileUi();
    await initializeVoiceToText();
    await checkPipelineStatus();
    startEsp32TelemetryPolling();
    
    console.log('[MoE Chat] Ready');
  }

  /**
   * Bind event listeners
   */
  function bindEvents() {
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.attachBtn?.addEventListener('click', handleAttachCodeFile);
    elements.clearAttachBtn?.addEventListener('click', () => clearAttachedCodeFile(true));
    elements.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        if (sessionController?.applyPromptRecall?.(elements.input, -1)) e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown') {
        if (sessionController?.applyPromptRecall?.(elements.input, 1)) e.preventDefault();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    elements.kvmSelect.addEventListener('change', updateKvmSelection);
    window.addEventListener('focus', () => {
      if (!elements.input.disabled) {
        elements.input.focus();
      }
    });
    window.addEventListener('beforeunload', () => {
      stopEsp32TelemetryPolling();
    });
  }

  function setInputBusyState(busy) {
    isProcessing = !!busy;
    elements.input.disabled = !!busy;
    elements.sendBtn.disabled = !!busy;
    if (elements.attachBtn) elements.attachBtn.disabled = !!busy;
  }

  function updateAttachedFileUi() {
    if (!elements.attachedFileChip || !elements.clearAttachBtn) return;
    if (!attachedCodeFile) {
      elements.attachedFileChip.style.display = 'none';
      elements.attachedFileChip.textContent = '';
      elements.clearAttachBtn.style.display = 'none';
      return;
    }
    const sizeKb = Math.max(1, Math.round(Number(attachedCodeFile.size || 0) / 1024));
    const truncatedTag = attachedCodeFile.truncated ? ' (truncated)' : '';
    elements.attachedFileChip.style.display = 'inline-block';
    elements.attachedFileChip.textContent = `Attached: ${attachedCodeFile.fileName} • ${sizeKb} KB${truncatedTag}`;
    elements.clearAttachBtn.style.display = 'inline-block';
  }

  function clearAttachedCodeFile(notify = false) {
    const hadAttachment = !!attachedCodeFile;
    attachedCodeFile = null;
    updateAttachedFileUi();
    if (notify && hadAttachment) {
      addSystemMessage('Cleared attached code file.');
    }
  }

  async function handleAttachCodeFile() {
    try {
      if (!window.electronAPI?.moePickCodeFile || !window.electronAPI?.moeReadTextFile) {
        addMessage('error', 'Attachment API unavailable.');
        return;
      }
      const picked = await window.electronAPI.moePickCodeFile();
      if (!picked?.ok) throw new Error(picked?.error || 'File picker failed.');
      if (picked?.canceled) return;
      const loaded = await window.electronAPI.moeReadTextFile(picked.filePath, { maxBytes: 800000 });
      if (!loaded?.ok) throw new Error(loaded?.error || 'Failed to read selected file.');
      attachedCodeFile = {
        filePath: loaded.filePath,
        fileName: loaded.fileName || picked.fileName || 'attached-file',
        content: String(loaded.content || ''),
        size: Number(loaded.size || 0),
        truncated: !!loaded.truncated
      };
      updateAttachedFileUi();
      addSystemMessage(`Attached code file: ${attachedCodeFile.fileName}${attachedCodeFile.truncated ? ' (truncated to size limit)' : ''}.`);
    } catch (err) {
      console.error('[MoE Chat] Attach code file error:', err);
      addMessage('error', err?.message || String(err));
    }
  }

  function isEsp32UploadIntent(prompt) {
    return esp32Ops?.isEsp32UploadIntent ? esp32Ops.isEsp32UploadIntent(prompt) : false;
  }

  function isEsp32ControlIntent(prompt) {
    return esp32Ops?.isEsp32ControlIntent ? esp32Ops.isEsp32ControlIntent(prompt) : false;
  }

  function buildOutboundMessage(text) {
    if (esp32Ops?.buildOutboundMessage) return esp32Ops.buildOutboundMessage(text);
    return String(text || '').trim();
  }

  async function fetchEsp32TelemetrySnapshot() {
    if (!esp32Ops?.fetchEsp32TelemetrySnapshot) return null;
    return esp32Ops.fetchEsp32TelemetrySnapshot();
  }

  function startEsp32TelemetryPolling() {
    esp32Ops?.startEsp32TelemetryPolling?.();
  }

  function stopEsp32TelemetryPolling() {
    esp32Ops?.stopEsp32TelemetryPolling?.();
  }

  function startActivityIndicator(label = 'Working...') {
    voiceActivityOps?.startActivityIndicator?.(label);
  }

  function stopActivityIndicator() {
    voiceActivityOps?.stopActivityIndicator?.();
  }
  
  /**
   * Check pipeline status and populate agents
   */
  async function checkPipelineStatus() {
    if (pipelineOps?.checkPipelineStatus) {
      await pipelineOps.checkPipelineStatus();
    }
  }
  
  /**
   * Populate KVM dropdown with agents
   */
  function populateKvmDropdown() {
    pipelineOps?.populateKvmDropdown?.();
  }
  
  /**
   * Update pipeline flow display
   */
  function updatePipelineFlow() {
    pipelineOps?.updatePipelineFlow?.();
  }
  
  /**
   * Handle KVM selection change
   */
  function updateKvmSelection() {
    pipelineOps?.updateKvmSelection?.();
  }
  
  /**
   * Set status badge
   */
  function setStatus(state, text) {
    if (pipelineOps?.setStatus) {
      pipelineOps.setStatus(state, text);
      return;
    }
    elements.statusBadge.textContent = text;
    elements.statusBadge.className = 'status-badge ' + state;
  }
  
  /**
   * Send message through pipeline or to direct agent
   */
  async function sendMessage() {
    const text = elements.input.value.trim();
    const controlIntent = isEsp32ControlIntent(text);
    const uploadIntent = isEsp32UploadIntent(text);
    if (controlIntent && !uploadIntent) {
      await fetchEsp32TelemetrySnapshot().catch(() => {});
    }
    const outboundText = buildOutboundMessage(text);
    if (!outboundText || isProcessing) return;
    sessionController?.addPromptEntry?.(text);
    
    setInputBusyState(true);
    elements.input.value = '';
    
    const isPipeline = kvmTarget === 'pipeline';
    const targetAgent = !isPipeline ? agents.find(a => a.id === kvmTarget) : null;
    const userPreview = text || `(using attachment: ${attachedCodeFile?.fileName || 'code'})`;
    if (isPipeline) {
      addMessage('user', userPreview, null, 0, '→ Full Pipeline');
    } else {
      addMessage('user', userPreview, null, 0, `→ ${targetAgent?.name || 'Agent'}`);
    }
    
    setStatus('processing', 'Processing...');
    startActivityIndicator(isPipeline ? 'Pipeline is working' : `Waiting on ${targetAgent?.name || 'agent'}`);
    
    try {
      let result;
      
      if (isPipeline) {
        const liveIrgEnabled = await isLiveIrgInputGatewayEnabled();
        if (liveIrgEnabled) {
          result = await withRequestTimeout(
            'Pipeline request',
            window.electronAPI.routeMoEMessage(outboundText, { irgModeOverride: 'live' }),
            REQUEST_TIMEOUT_MS
          );
        } else {
          result = await withRequestTimeout(
            'Pipeline request',
            window.electronAPI.routeMoEMessage(outboundText),
            REQUEST_TIMEOUT_MS
          );
        }
        
        if (result.success) {
          renderPipelineResult(result);
        } else {
          throw new Error(result.error || 'Pipeline error');
        }
      } else {
        result = await withRequestTimeout(
          `Direct agent request (${targetAgent?.name || kvmTarget})`,
          window.electronAPI.sendToMoEAgent(kvmTarget, outboundText),
          REQUEST_TIMEOUT_MS
        );
        
        if (result.success) {
          addMessage('direct', result.content, targetAgent?.name);
          setStatus('connected', 'Ready • Direct Mode');
        } else {
          throw new Error(result.error || 'Agent error');
        }
      }
    } catch (err) {
      console.error('[MoE Chat] Send error:', err);
      addMessage('error', err.message);
      setStatus('error', 'Error');
    } finally {
      stopActivityIndicator();
      setInputBusyState(false);
      elements.input.focus();
    }
  }

  function renderPipelineResult(result) {
    if (messageOps?.renderPipelineResult) {
      messageOps.renderPipelineResult(result);
    }
  }
  
  /**
   * Add a message to the chat
   */
  function addMessage(type, content, agentName = '', durationMs = 0, routeInfo = '', meta = null) {
    messageOps?.addMessage?.(type, content, agentName, durationMs, routeInfo, meta);
  }
  
  /**
   * Add system message
   */
  function addSystemMessage(text) {
    messageOps?.addSystemMessage?.(text);
  }

  async function speakAssistantText(text) {
    const content = String(text || '').trim();
    if (!content) return;
    if (speechEngine && typeof speechEngine.enqueueText === 'function') {
      try {
        await speechEngine.enqueueText(content, { maxChunkChars: 420 });
      } catch (err) {
        console.warn('[MoE Chat] TTS error:', err?.message || err);
      }
      return;
    }
    if (!voiceController || typeof voiceController.speak !== 'function') return;
    try {
      await voiceController.speak(content);
    } catch (err) {
      console.warn('[MoE Chat] TTS error:', err?.message || err);
    }
  }

  async function runContractFromMessage(contract) {
    if (!window.electronAPI?.runMoEIrgContract) {
      addMessage('error', 'Contract run API not available.');
      return;
    }
    if (isProcessing) return;
    setInputBusyState(true);
    setStatus('processing', 'Running selected contract...');
    startActivityIndicator('Running selected contract');
    try {
      const liveIrgEnabled = await isLiveIrgInputGatewayEnabled();
      const options = liveIrgEnabled ? { irgModeOverride: 'live' } : {};
      const result = await withRequestTimeout(
        'Run contract request',
        window.electronAPI.runMoEIrgContract(contract, options),
        REQUEST_TIMEOUT_MS
      );
      if (!result?.success) {
        throw new Error(result?.error || result?.response || 'Contract execution failed');
      }
      addSystemMessage('Replaying selected contract...');
      renderPipelineResult(result);
    } catch (err) {
      console.error('[MoE Chat] Contract replay error:', err);
      addMessage('error', err?.message || String(err));
      setStatus('error', 'Error');
    } finally {
      stopActivityIndicator();
      setInputBusyState(false);
      elements.input.focus();
    }
  }
  
  /**
   * Clear chat history
   */
  function clearHistory() {
    elements.messages.innerHTML = '';
    addSystemMessage('Chat history cleared.');
  }

  async function initializeVoiceToText() {
    if (!voiceActivityOps?.initializeVoiceToText) return;
    const result = await voiceActivityOps.initializeVoiceToText();
    if (result?.voiceController) {
      voiceController = result.voiceController;
    }
    if (result?.speechEngine) {
      speechEngine = result.speechEngine;
    }
  }

  async function isLiveIrgInputGatewayEnabled() {
    try {
      const status = await window.electronAPI.getMoEStatus();
      const gateways = Object.values(status?.gateways || {});
      for (const gateway of gateways) {
        if (String(gateway?.position || '').toLowerCase() !== 'input') continue;
        const irgEnabled = gateway?.irg?.enabled !== false;
        const executeMode = String(gateway?.irg?.executeMode || '').toLowerCase();
        if (irgEnabled && executeMode === 'live') return true;
      }
    } catch (err) {
      console.warn('[MoE Chat] Live IRG check failed:', err?.message || err);
    }
    return false;
  }

  function openDryRunPreviewModal(previewText) {
    return renderUtils?.openDryRunPreviewModal
      ? renderUtils.openDryRunPreviewModal(previewText)
      : Promise.resolve(false);
  }

  function formatChatContent(text, options = {}) {
    return renderUtils?.formatChatContent
      ? renderUtils.formatChatContent(text, options)
      : String(text || '');
  }

  function buildRouteTraceLine(meta) {
    return renderUtils?.buildRouteTraceLine
      ? renderUtils.buildRouteTraceLine(meta)
      : '';
  }

  function buildHandoffDetails(meta) {
    return renderUtils?.buildHandoffDetails
      ? renderUtils.buildHandoffDetails(meta)
      : '';
  }

  function extractIrgContractFromText(content) {
    return renderUtils?.extractIrgContractFromText
      ? renderUtils.extractIrgContractFromText(content)
      : null;
  }

  function withRequestTimeout(label, promise, timeoutMs) {
    return renderUtils?.withRequestTimeout
      ? renderUtils.withRequestTimeout(label, promise, timeoutMs)
      : Promise.resolve(promise);
  }
  return {
    initialize,
    clearHistory
  };
})();
