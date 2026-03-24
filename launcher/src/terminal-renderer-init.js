/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createInitController() {
    function initializeTerminal(terminalConfig, ctx) {
      console.log('[Terminal] Initializing with config:', terminalConfig);

      ctx.setConfig(terminalConfig);
      ctx.setCurrentModel((terminalConfig.modelName && terminalConfig.modelName !== 'unknown') ? terminalConfig.modelName : null);
      ctx.setTerminalPort(terminalConfig.port);
      ctx.setAttachmentSessionId(`terminal-${terminalConfig.port}`);
      ctx.setProvider(terminalConfig.provider || 'ollama');
      ctx.setProviderBaseUrl(terminalConfig.baseUrl || '');
      ctx.setProviderApiKey(terminalConfig.apiKey || '');
      ctx.setProviderModelId(terminalConfig.providerModel || '');
      ctx.setLlamaCppModelPath(terminalConfig.llamaCppModelPath || '');

      if (terminalConfig.systemPrompt) {
        ctx.setSystemPrompt(terminalConfig.systemPrompt);
        console.log('[Terminal] System prompt loaded from Modelfile');
      }
      if (terminalConfig.temperature !== null) {
        ctx.setTemperature(terminalConfig.temperature);
        console.log(`[Terminal] Temperature set from Modelfile: ${terminalConfig.temperature}`);
      }
      if (terminalConfig.top_p !== null) ctx.setTopP(terminalConfig.top_p);
      if (terminalConfig.top_k !== null) ctx.setTopK(terminalConfig.top_k);
      if (terminalConfig.num_ctx !== null) ctx.setNumCtx(terminalConfig.num_ctx);
      if (terminalConfig.num_gpu !== null) ctx.setNumGpu(terminalConfig.num_gpu);
      if (terminalConfig.num_predict !== null) ctx.setNumPredict(terminalConfig.num_predict);
      if (terminalConfig.repeat_penalty !== null) ctx.setRepeatPenalty(terminalConfig.repeat_penalty);
      if (terminalConfig.seed !== null) ctx.setSeed(terminalConfig.seed);
      if (terminalConfig.stop !== null) ctx.setStopSequences(terminalConfig.stop);

      const dom = {
        chatDisplay: document.getElementById('chat-display'),
        userInput: document.getElementById('user-input'),
        sendBtn: document.getElementById('send-btn'),
        stopBtn: document.getElementById('stop-btn'),
        attachmentsBtn: document.getElementById('attachments-btn'),
        statusText: document.getElementById('status-text'),
        gpuIcon: document.getElementById('gpu-icon'),
        gpuText: document.getElementById('gpu-text')
      };
      ctx.setDom(dom);

      if (!dom.chatDisplay || !dom.userInput || !dom.sendBtn) {
        console.error('[Terminal] CRITICAL: Required DOM elements not found!');
        console.error('[Terminal] chatDisplay:', dom.chatDisplay);
        console.error('[Terminal] userInput:', dom.userInput);
        console.error('[Terminal] sendBtn:', dom.sendBtn);
        return false;
      }

      if (window.TerminalRuntime && typeof window.TerminalRuntime.createRuntimeController === 'function') {
        const runtimeController = window.TerminalRuntime.createRuntimeController({
          getCurrentModel: ctx.getCurrentModel,
          getTerminalPort: ctx.getTerminalPort,
          getProvider: ctx.getProvider,
          getProviderBaseUrl: ctx.getProviderBaseUrl,
          getProviderApiKey: ctx.getProviderApiKey,
          getProviderModelId: ctx.getProviderModelId,
          getLlamaCppModelPath: ctx.getLlamaCppModelPath,
          getConfig: ctx.getConfig,
          getTemperature: ctx.getTemperature,
          getTopP: ctx.getTopP,
          getTopK: ctx.getTopK,
          getNumCtx: ctx.getNumCtx,
          getNumGpu: ctx.getNumGpu,
          getNumPredict: ctx.getNumPredict,
          getRepeatPenalty: ctx.getRepeatPenalty,
          getSeed: ctx.getSeed,
          getStopSequences: ctx.getStopSequences,
          setGpuIndicator: (icon, text) => {
            const currentDom = ctx.getDom();
            if (currentDom.gpuIcon) currentDom.gpuIcon.textContent = icon;
            if (currentDom.gpuText) currentDom.gpuText.textContent = text;
          }
        });
        ctx.setController('runtimeController', runtimeController);
      }

      if (window.TerminalBootstrap && typeof window.TerminalBootstrap.createBootstrapController === 'function') {
        ctx.setController('bootstrapController', window.TerminalBootstrap.createBootstrapController());
      }
      if (!ctx.getController('bootstrapController')) {
        console.error('[Terminal] Bootstrap controller module not loaded.');
        return false;
      }

      const controllers = ctx.getController('bootstrapController').buildControllers({
        config: ctx.getConfig(),
        chatDisplay: dom.chatDisplay,
        userInput: dom.userInput,
        sendBtn: dom.sendBtn,
        stopBtn: dom.stopBtn,
        attachmentsBtn: dom.attachmentsBtn,
        statusText: dom.statusText,
        gpuIcon: dom.gpuIcon,
        gpuText: dom.gpuText,
        attachmentSessionId: ctx.getAttachmentSessionId(),
        addSystemMessage: ctx.addSystemMessage,
        addSystemImagePreview: ctx.addSystemImagePreview,
        addErrorMessage: ctx.addErrorMessage,
        escapeHtml: ctx.escapeHtml,
        formatBytes: ctx.formatBytes,
        getCurrentModel: ctx.getCurrentModel,
        setCurrentModel: ctx.setCurrentModel,
        getTerminalPort: ctx.getTerminalPort,
        getProvider: ctx.getProvider,
        setProvider: ctx.setProvider,
        getProviderBaseUrl: ctx.getProviderBaseUrl,
        setProviderBaseUrl: ctx.setProviderBaseUrl,
        getProviderApiKey: ctx.getProviderApiKey,
        setProviderApiKey: ctx.setProviderApiKey,
        getProviderModelId: ctx.getProviderModelId,
        setProviderModelId: ctx.setProviderModelId,
        getLlamaCppModelPath: ctx.getLlamaCppModelPath,
        setLlamaCppModelPath: ctx.setLlamaCppModelPath,
        getSystemPrompt: ctx.getSystemPrompt,
        setSystemPrompt: ctx.setSystemPrompt,
        getProvider: ctx.getProvider,
        setProvider: ctx.setProvider,
        getProviderBaseUrl: ctx.getProviderBaseUrl,
        setProviderBaseUrl: ctx.setProviderBaseUrl,
        getProviderApiKey: ctx.getProviderApiKey,
        setProviderApiKey: ctx.setProviderApiKey,
        getProviderModelId: ctx.getProviderModelId,
        setProviderModelId: ctx.setProviderModelId,
        getLlamaCppModelPath: ctx.getLlamaCppModelPath,
        setLlamaCppModelPath: ctx.setLlamaCppModelPath,
        getRlmAssisted: ctx.getRlmAssisted,
        setRlmAssisted: ctx.setRlmAssisted,
        getRlmVerboseTrace: ctx.getRlmVerboseTrace,
        setRlmVerboseTrace: ctx.setRlmVerboseTrace,
        getRlmQuality: ctx.getRlmQuality,
        setRlmQuality: ctx.setRlmQuality,
        getRlmProfile: ctx.getRlmProfile,
        setRlmProfile: ctx.setRlmProfile,
        getRlmProvider: ctx.getRlmProvider,
        setRlmProvider: ctx.setRlmProvider,
        getRlmAdvancedBudgets: ctx.getRlmAdvancedBudgets,
        setRlmAdvancedBudgets: ctx.setRlmAdvancedBudgets,
        getRlmIncludeSharedAttachments: ctx.getRlmIncludeSharedAttachments,
        setRlmIncludeSharedAttachments: ctx.setRlmIncludeSharedAttachments,
        getRlmBudgets: ctx.getRlmBudgets,
        setRlmBudgets: ctx.setRlmBudgets,
        getLlmAssistedFileNaming: ctx.getLlmAssistedFileNaming,
        setLlmAssistedFileNaming: ctx.setLlmAssistedFileNaming,
        getTemperature: ctx.getTemperature,
        setTemperature: ctx.setTemperature,
        getTopP: ctx.getTopP,
        setTopP: ctx.setTopP,
        getTopK: ctx.getTopK,
        setTopK: ctx.setTopK,
        getNumCtx: ctx.getNumCtx,
        setNumCtx: ctx.setNumCtx,
        getNumGpu: ctx.getNumGpu,
        setNumGpu: ctx.setNumGpu,
        getNumPredict: ctx.getNumPredict,
        setNumPredict: ctx.setNumPredict,
        getRepeatPenalty: ctx.getRepeatPenalty,
        setRepeatPenalty: ctx.setRepeatPenalty,
        getSeed: ctx.getSeed,
        setSeed: ctx.setSeed,
        getStopSequences: ctx.getStopSequences,
        setStopSequences: ctx.setStopSequences,
        persistTerminalModelConfig: ctx.persistTerminalModelConfig,
        getConversationHistory: ctx.getConversationHistory,
        setConversationHistory: ctx.setConversationHistory,
        clearChatDisplay: () => {
          const currentDom = ctx.getDom();
          if (currentDom.chatDisplay) currentDom.chatDisplay.innerHTML = '';
        },
        addMessage: ctx.addMessage,
        saveConversation: ctx.saveConversation,
        loadConversation: ctx.loadConversation,
        listSavedConversations: ctx.listSavedConversations,
        deleteSavedConversation: ctx.deleteSavedConversation,
        recordSessionMemory: ctx.recordSessionMemory,
        clearConversation: ctx.clearConversation,
        handleStopClick: ctx.handleStopClick,
        attachFile: ctx.attachFile,
        listAttachments: ctx.listAttachments,
        detachAttachment: ctx.detachAttachment,
        clearAttachments: ctx.clearAttachments,
        getActiveStream: ctx.getActiveStream,
        setActiveStream: ctx.setActiveStream,
        sanitizeQwenSelfDialogue: ctx.sanitizeQwenSelfDialogue,
        finalizeStreamingMessage: ctx.finalizeStreamingMessage,
        setWaitingState: ctx.setWaitingState,
        appendConversationPair: ctx.appendConversationPair,
        speakAssistantText: ctx.speakAssistantText,
        getSpeechEngine: ctx.getSpeechEngine,
        getSpeechChunkProfile: ctx.getSpeechChunkProfile,
        addInputRecallEntry: ctx.addInputRecallEntry,
        handleCommand: ctx.handleCommand,
        buildAttachmentContext: ctx.buildAttachmentContext,
        shouldInjectAttachmentContext: ctx.shouldInjectAttachmentContext,
        buildOllamaOptions: ctx.buildOllamaOptions,
        addAssistantShell: ctx.addAssistantShell,
        setStreamStopRequested: ctx.setStreamStopRequested,
        getStreamStopRequested: ctx.getStreamStopRequested,
        getRlmAssisted: ctx.getRlmAssisted,
        getRlmController: ctx.getRlmController,
        getRlmProvider: ctx.getRlmProvider,
        runRlmTurn: ctx.runRlmTurn,
        getRlmVerboseTrace: ctx.getRlmVerboseTrace,
        getRlmQuality: ctx.getRlmQuality,
        getRlmBudgets: ctx.getRlmBudgets,
        getRlmIncludeSharedAttachments: ctx.getRlmIncludeSharedAttachments,
        getConfig: ctx.getConfig
      });

      ctx.setController('uiController', controllers.uiController || null);
      ctx.setController('memoryController', controllers.memoryController || null);
      ctx.setController('attachmentController', controllers.attachmentController || null);
      ctx.setController('persistenceController', controllers.persistenceController || null);
      ctx.setController('sessionController', controllers.sessionController || null);
      ctx.setController('commandController', controllers.commandController || null);
      ctx.setController('contextMenuController', controllers.contextMenuController || null);
      ctx.setController('streamController', controllers.streamController || null);
      ctx.setController('chatFlowController', controllers.chatFlowController || null);

      ctx.getController('bootstrapController').runPostInit({
        config: ctx.getConfig(),
        chatDisplay: dom.chatDisplay,
        userInput: dom.userInput,
        sendBtn: dom.sendBtn,
        stopBtn: dom.stopBtn,
        attachmentsBtn: dom.attachmentsBtn,
        contextMenuController: ctx.getController('contextMenuController'),
        streamController: ctx.getController('streamController'),
        configureMarkdown: ctx.configureMarkdown,
        installDragAndDropAttach: ctx.installDragAndDropAttach,
        updateGPUIndicator: ctx.updateGPUIndicator,
        populateModelDropdown: ctx.populateModelDropdown,
        handleSendClick: ctx.handleSendClick,
        handleStopClick: ctx.handleStopClick,
        openAttachmentManager: ctx.openAttachmentManager,
        handleInputKeypress: ctx.handleInputKeypress,
        addSystemMessage: ctx.addSystemMessage,
        getCurrentModel: ctx.getCurrentModel,
        getTerminalPort: ctx.getTerminalPort,
        getProvider: ctx.getProvider,
        getProviderBaseUrl: ctx.getProviderBaseUrl,
        getSystemPrompt: ctx.getSystemPrompt,
        loadSessionMemoryPreferences: ctx.loadSessionMemoryPreferences,
        loadInputRecallHistory: ctx.loadInputRecallHistory,
        verifyGPUUsage: ctx.verifyGPUUsage
      });

      console.log('[Terminal] Initialization complete');
      return true;
    }

    return {
      initializeTerminal
    };
  }

  window.TerminalInit = {
    createInitController
  };
})();
