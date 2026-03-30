/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/* terminal renderer init bridge */
(function() {
  'use strict';

  function createControllerAccessors(bindings) {
    return {
      setController(name, value) {
        const entry = bindings[name];
        if (!entry || typeof entry.set !== 'function') return;
        entry.set(value);
      },
      getController(name) {
        const entry = bindings[name];
        if (!entry || typeof entry.get !== 'function') return null;
        return entry.get();
      }
    };
  }

  function createDomAccessors(bindings) {
    return {
      setDom(dom) {
        bindings.chatDisplay.set(dom.chatDisplay);
        bindings.userInput.set(dom.userInput);
        bindings.sendBtn.set(dom.sendBtn);
        bindings.stopBtn.set(dom.stopBtn);
        bindings.attachmentsBtn.set(dom.attachmentsBtn);
        bindings.statusText.set(dom.statusText);
        bindings.gpuIcon.set(dom.gpuIcon);
        bindings.gpuText.set(dom.gpuText);
      },
      getDom() {
        return {
          chatDisplay: bindings.chatDisplay.get(),
          userInput: bindings.userInput.get(),
          sendBtn: bindings.sendBtn.get(),
          stopBtn: bindings.stopBtn.get(),
          attachmentsBtn: bindings.attachmentsBtn.get(),
          statusText: bindings.statusText.get(),
          gpuIcon: bindings.gpuIcon.get(),
          gpuText: bindings.gpuText.get()
        };
      }
    };
  }

  function buildInitOptions(api) {
    const controllerAccessors = createControllerAccessors(api.controllerBindings);
    const domAccessors = createDomAccessors(api.domBindings);

    return {
      setConfig: api.setConfig,
      getConfig: api.getConfig,
      getRlmAssisted: api.getRlmAssisted,
      setRlmAssisted: api.setRlmAssisted,
      getRlmVerboseTrace: api.getRlmVerboseTrace,
      setRlmVerboseTrace: api.setRlmVerboseTrace,
      getRlmQuality: api.getRlmQuality,
      setRlmQuality: api.setRlmQuality,
      getRlmProfile: api.getRlmProfile,
      setRlmProfile: api.setRlmProfile,
      getRlmProvider: api.getRlmProvider,
      setRlmProvider: api.setRlmProvider,
      getRlmAdvancedBudgets: api.getRlmAdvancedBudgets,
      setRlmAdvancedBudgets: api.setRlmAdvancedBudgets,
      getRlmIncludeSharedAttachments: api.getRlmIncludeSharedAttachments,
      setRlmIncludeSharedAttachments: api.setRlmIncludeSharedAttachments,
      getRlmBudgets: api.getRlmBudgets,
      setRlmBudgets: api.setRlmBudgets,
      getLlmAssistedFileNaming: api.getLlmAssistedFileNaming,
      setLlmAssistedFileNaming: api.setLlmAssistedFileNaming,
      setCurrentModel: api.setCurrentModel,
      getCurrentModel: api.getCurrentModel,
      setTerminalPort: api.setTerminalPort,
      getTerminalPort: api.getTerminalPort,
      setAttachmentSessionId: api.setAttachmentSessionId,
      getAttachmentSessionId: api.getAttachmentSessionId,
      setSystemPrompt: api.setSystemPrompt,
      getSystemPrompt: api.getSystemPrompt,
      setTemperature: api.setTemperature,
      getTemperature: api.getTemperature,
      setProvider: api.setProvider,
      getProvider: api.getProvider,
      setProviderBaseUrl: api.setProviderBaseUrl,
      getProviderBaseUrl: api.getProviderBaseUrl,
      setProviderApiKey: api.setProviderApiKey,
      getProviderApiKey: api.getProviderApiKey,
      setProviderModelId: api.setProviderModelId,
      getProviderModelId: api.getProviderModelId,
      setLlamaCppModelPath: api.setLlamaCppModelPath,
      getLlamaCppModelPath: api.getLlamaCppModelPath,
      setTopP: api.setTopP,
      getTopP: api.getTopP,
      setTopK: api.setTopK,
      getTopK: api.getTopK,
      setNumCtx: api.setNumCtx,
      getNumCtx: api.getNumCtx,
      setNumGpu: api.setNumGpu,
      getNumGpu: api.getNumGpu,
      setNumPredict: api.setNumPredict,
      getNumPredict: api.getNumPredict,
      setRepeatPenalty: api.setRepeatPenalty,
      getRepeatPenalty: api.getRepeatPenalty,
      setSeed: api.setSeed,
      getSeed: api.getSeed,
      setStopSequences: api.setStopSequences,
      getStopSequences: api.getStopSequences,
      persistTerminalModelConfig: api.persistTerminalModelConfig,
      setDom: domAccessors.setDom,
      getDom: domAccessors.getDom,
      setController: controllerAccessors.setController,
      getController: controllerAccessors.getController,
      addSystemMessage: api.addSystemMessage,
      addSystemImagePreview: api.addSystemImagePreview,
      addErrorMessage: api.addErrorMessage,
      escapeHtml: api.escapeHtml,
      formatBytes: api.formatBytes,
      getConversationHistory: api.getConversationHistory,
      setConversationHistory: api.setConversationHistory,
      addMessage: api.addMessage,
      saveConversation: api.saveConversation,
      loadConversation: api.loadConversation,
      listSavedConversations: api.listSavedConversations,
      deleteSavedConversation: api.deleteSavedConversation,
      recordSessionMemory: api.recordSessionMemory,
      clearConversation: api.clearConversation,
      handleStopClick: api.handleStopClick,
      attachFile: api.attachFile,
      listAttachments: api.listAttachments,
      detachAttachment: api.detachAttachment,
      clearAttachments: api.clearAttachments,
      getActiveStream: api.getActiveStream,
      setActiveStream: api.setActiveStream,
      sanitizeQwenSelfDialogue: api.sanitizeQwenSelfDialogue,
      finalizeStreamingMessage: api.finalizeStreamingMessage,
      setWaitingState: api.setWaitingState,
      setThinkingStatusText: api.setThinkingStatusText,
      appendConversationPair: api.appendConversationPair,
      speakAssistantText: api.speakAssistantText,
      getSpeechEngine: api.getSpeechEngine,
      getSpeechChunkProfile: api.getSpeechChunkProfile,
      addInputRecallEntry: api.addInputRecallEntry,
      handleCommand: api.handleCommand,
      buildAttachmentContext: api.buildAttachmentContext,
      shouldInjectAttachmentContext: api.shouldInjectAttachmentContext,
      buildOllamaOptions: api.buildOllamaOptions,
      addAssistantShell: api.addAssistantShell,
      setStreamStopRequested: api.setStreamStopRequested,
      getStreamStopRequested: api.getStreamStopRequested,
      getRlmController: api.getRlmController,
      getRlmProvider: api.getRlmProvider,
      runRlmTurn: api.runRlmTurn,
      configureMarkdown: api.configureMarkdown,
      installDragAndDropAttach: api.installDragAndDropAttach,
      updateGPUIndicator: api.updateGPUIndicator,
      populateModelDropdown: api.populateModelDropdown,
      handleSendClick: api.handleSendClick,
      openAttachmentManager: api.openAttachmentManager,
      handleInputKeypress: api.handleInputKeypress,
      loadSessionMemoryPreferences: api.loadSessionMemoryPreferences,
      loadInputRecallHistory: api.loadInputRecallHistory,
      verifyGPUUsage: api.verifyGPUUsage
    };
  }

  function createRlmController(ctx) {
    if (!window.TerminalRlm || typeof window.TerminalRlm.createRlmController !== 'function') {
      return null;
    }
    return window.TerminalRlm.createRlmController({
      getElectronAPI: ctx.getElectronAPI,
      getSessionId: ctx.getSessionId,
      getModelName: ctx.getModelName,
      sendMessage: ctx.sendMessage,
      buildOllamaOptions: ctx.buildOllamaOptions,
      getRlmVerboseTrace: ctx.getRlmVerboseTrace,
      getRlmQuality: ctx.getRlmQuality,
      getIncludeSharedAttachments: ctx.getIncludeSharedAttachments,
      getRlmBudgets: ctx.getRlmBudgets,
      getSharedAttachmentSessionId: ctx.getSharedAttachmentSessionId,
      onThinkingStatus: ctx.onThinkingStatus
    });
  }

  window.TerminalInitBridge = {
    buildInitOptions,
    createRlmController
  };
})();
