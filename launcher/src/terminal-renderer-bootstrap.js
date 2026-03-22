/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createBootstrapController(deps) {
    function buildControllers(ctx) {
      const controllers = {};

      if (window.TerminalUI && typeof window.TerminalUI.createUIController === 'function') {
        controllers.uiController = window.TerminalUI.createUIController({
          getChatDisplay: () => ctx.chatDisplay,
          getUserInput: () => ctx.userInput,
          getSendBtn: () => ctx.sendBtn,
          getStopBtn: () => ctx.stopBtn,
          getStatusText: () => ctx.statusText,
          getGpuIcon: () => ctx.gpuIcon,
          getGpuText: () => ctx.gpuText,
          getLlmAssistedFileNaming: ctx.getLlmAssistedFileNaming
        });
      } else {
        console.warn('[Terminal] UI controller module not loaded.');
      }

      if (window.TerminalMemory && typeof window.TerminalMemory.createMemoryController === 'function') {
        controllers.memoryController = window.TerminalMemory.createMemoryController({
          getElectronAPI: () => window.electronAPI,
          getSessionId: () => ctx.attachmentSessionId,
          getUserInput: () => ctx.userInput
        });
      } else {
        console.warn('[Terminal] Memory controller module not loaded.');
      }

      if (window.TerminalAttachments && typeof window.TerminalAttachments.createAttachmentController === 'function') {
        controllers.attachmentController = window.TerminalAttachments.createAttachmentController({
          getSessionId: () => ctx.attachmentSessionId,
          getElectronAPI: () => window.electronAPI,
          addSystemMessage: ctx.addSystemMessage,
          addSystemImagePreview: ctx.addSystemImagePreview,
          addErrorMessage: ctx.addErrorMessage,
          escapeHtml: ctx.escapeHtml,
          formatBytes: ctx.formatBytes
        });
      } else {
        console.warn('[Terminal] Attachment controller module not loaded.');
      }

      if (window.TerminalPersistence && typeof window.TerminalPersistence.createPersistenceController === 'function') {
        controllers.persistenceController = window.TerminalPersistence.createPersistenceController({
          getElectronAPI: () => window.electronAPI,
          getCurrentModel: ctx.getCurrentModel,
          setCurrentModel: ctx.setCurrentModel,
          getTerminalPort: ctx.getTerminalPort,
          getSystemPrompt: ctx.getSystemPrompt,
          setSystemPrompt: ctx.setSystemPrompt,
          getTemperature: ctx.getTemperature,
          setTemperature: ctx.setTemperature,
          getTopP: ctx.getTopP,
          setTopP: ctx.setTopP,
          getTopK: ctx.getTopK,
          setTopK: ctx.setTopK,
          getNumCtx: ctx.getNumCtx,
          setNumCtx: ctx.setNumCtx,
          getNumPredict: ctx.getNumPredict,
          setNumPredict: ctx.setNumPredict,
          getRepeatPenalty: ctx.getRepeatPenalty,
          setRepeatPenalty: ctx.setRepeatPenalty,
          getSeed: ctx.getSeed,
          setSeed: ctx.setSeed,
          getStopSequences: ctx.getStopSequences,
          setStopSequences: ctx.setStopSequences,
          getConversationHistory: ctx.getConversationHistory,
          setConversationHistory: ctx.setConversationHistory,
          clearChatDisplay: ctx.clearChatDisplay,
          addMessage: ctx.addMessage,
          addSystemMessage: ctx.addSystemMessage,
          addErrorMessage: ctx.addErrorMessage
        });
      } else {
        console.warn('[Terminal] Persistence controller module not loaded.');
      }

      if (window.TerminalSessions && typeof window.TerminalSessions.createSessionController === 'function') {
        controllers.sessionController = window.TerminalSessions.createSessionController({
          saveConversation: ctx.saveConversation,
          loadConversation: ctx.loadConversation,
          listSavedConversations: ctx.listSavedConversations,
          deleteSavedConversation: ctx.deleteSavedConversation,
          addSystemMessage: ctx.addSystemMessage
        });
      } else {
        console.warn('[Terminal] Session controller module not loaded.');
      }

      if (window.TerminalCommands && typeof window.TerminalCommands.createCommandController === 'function') {
        controllers.commandController = window.TerminalCommands.createCommandController({
          getElectronAPI: () => window.electronAPI,
          getConfig: ctx.getConfig,
          getCurrentModel: ctx.getCurrentModel,
          setCurrentModel: ctx.setCurrentModel,
          getTerminalPort: ctx.getTerminalPort,
          getTemperature: ctx.getTemperature,
          setTemperatureValue: ctx.setTemperature,
          getTopP: ctx.getTopP,
          setTopP: ctx.setTopP,
          getTopK: ctx.getTopK,
          setTopK: ctx.setTopK,
          getNumCtx: ctx.getNumCtx,
          setNumCtx: ctx.setNumCtx,
          getNumPredict: ctx.getNumPredict,
          getRepeatPenalty: ctx.getRepeatPenalty,
          setRepeatPenalty: ctx.setRepeatPenalty,
          getSeed: ctx.getSeed,
          getStopSequences: ctx.getStopSequences,
          persistTerminalModelConfig: ctx.persistTerminalModelConfig,
          getSystemPrompt: ctx.getSystemPrompt,
          setSystemPromptValue: ctx.setSystemPrompt,
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
          getConversationHistoryLength: () => ctx.getConversationHistory().length,
          clearConversationHistory: () => ctx.setConversationHistory([]),
          addSystemMessage: ctx.addSystemMessage,
          addErrorMessage: ctx.addErrorMessage,
          formatBytes: ctx.formatBytes,
          recordSessionMemory: ctx.recordSessionMemory,
          clearConversation: ctx.clearConversation,
          handleStopClick: ctx.handleStopClick,
          attachFile: ctx.attachFile,
          listAttachments: ctx.listAttachments,
          detachAttachment: ctx.detachAttachment,
          clearAttachments: ctx.clearAttachments,
          saveConversation: ctx.saveConversation,
          loadConversation: ctx.loadConversation
        });
      } else {
        console.warn('[Terminal] Command controller module not loaded.');
      }

      if (window.TerminalContextMenu && typeof window.TerminalContextMenu.createContextMenuController === 'function') {
        controllers.contextMenuController = window.TerminalContextMenu.createContextMenuController({
          getUserInput: () => ctx.userInput,
          getChatDisplay: () => ctx.chatDisplay
        });
      } else {
        console.warn('[Terminal] Context menu controller module not loaded.');
      }

      if (window.TerminalStream && typeof window.TerminalStream.createStreamController === 'function') {
        controllers.streamController = window.TerminalStream.createStreamController({
          getElectronAPI: () => window.electronAPI,
          getActiveStream: ctx.getActiveStream,
          setActiveStream: ctx.setActiveStream,
          getUserInput: () => ctx.userInput,
          getChatDisplay: () => ctx.chatDisplay,
          sanitizeQwenSelfDialogue: ctx.sanitizeQwenSelfDialogue,
          finalizeStreamingMessage: ctx.finalizeStreamingMessage,
          addErrorMessage: ctx.addErrorMessage,
          setWaitingState: ctx.setWaitingState,
          appendConversationPair: ctx.appendConversationPair,
          speakAssistantText: ctx.speakAssistantText,
          getSpeechEngine: ctx.getSpeechEngine,
          getSpeechChunkProfile: ctx.getSpeechChunkProfile
        });
      } else {
        console.warn('[Terminal] Stream controller module not loaded.');
      }

      if (window.TerminalChatFlow && typeof window.TerminalChatFlow.createChatFlowController === 'function') {
        controllers.chatFlowController = window.TerminalChatFlow.createChatFlowController({
          getUserInput: () => ctx.userInput,
          addInputRecallEntry: ctx.addInputRecallEntry,
          handleCommand: ctx.handleCommand,
          getActiveStream: ctx.getActiveStream,
          setWaitingState: ctx.setWaitingState,
          addSystemMessage: ctx.addSystemMessage,
          addMessage: ctx.addMessage,
          getSystemPrompt: ctx.getSystemPrompt,
          buildAttachmentContext: ctx.buildAttachmentContext,
          shouldInjectAttachmentContext: ctx.shouldInjectAttachmentContext,
          getConversationHistory: ctx.getConversationHistory,
          appendConversationPair: ctx.appendConversationPair,
          getCurrentModel: ctx.getCurrentModel,
          buildOllamaOptions: ctx.buildOllamaOptions,
          addAssistantShell: ctx.addAssistantShell,
          setActiveStream: ctx.setActiveStream,
          getTerminalPort: ctx.getTerminalPort,
          getElectronAPI: () => window.electronAPI,
          sanitizeQwenSelfDialogue: ctx.sanitizeQwenSelfDialogue,
          addErrorMessage: ctx.addErrorMessage,
          focusInput: () => { if (ctx.userInput) ctx.userInput.focus(); },
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
          setThinkingStatusText: ctx.setThinkingStatusText
        });
      } else {
        console.warn('[Terminal] Chatflow controller module not loaded.');
      }

      return controllers;
    }

    function runPostInit(ctx) {
      ctx.configureMarkdown();
      ctx.installDragAndDropAttach();
      if (ctx.contextMenuController && typeof ctx.contextMenuController.installContextMenu === 'function') {
        ctx.contextMenuController.installContextMenu();
      }

      if (ctx.chatDisplay) {
        ctx.chatDisplay.style.userSelect = 'text';
        ctx.chatDisplay.style.webkitUserSelect = 'text';
      }

      const modelNameEl = document.getElementById('model-name');
      if (modelNameEl) modelNameEl.textContent = ctx.config.modelName;

      ctx.updateGPUIndicator(ctx.config.gpuType);
      ctx.populateModelDropdown(ctx.config.port);

      ctx.sendBtn.addEventListener('click', ctx.handleSendClick);
      if (ctx.stopBtn) {
        ctx.stopBtn.addEventListener('click', ctx.handleStopClick);
        ctx.stopBtn.disabled = true;
        ctx.stopBtn.style.display = 'none';
      }
      if (ctx.attachmentsBtn) {
        ctx.attachmentsBtn.addEventListener('click', ctx.openAttachmentManager);
      }
      ctx.userInput.addEventListener('keydown', ctx.handleInputKeypress);

      if (ctx.streamController && typeof ctx.streamController.installStreamListener === 'function') {
        ctx.streamController.installStreamListener();
      }

      if (ctx.getCurrentModel()) {
        ctx.addSystemMessage('Connected to Ollama with model: ' + ctx.getCurrentModel());
      } else {
        ctx.addSystemMessage('Connected to Ollama - select a model from the dropdown above');
      }
      ctx.addSystemMessage('Using port: ' + ctx.getTerminalPort());
      const sp = ctx.getSystemPrompt();
      if (sp) {
        ctx.addSystemMessage(`📋 System prompt: ${sp.substring(0, 100)}${sp.length > 100 ? '...' : ''}`);
      }
      ctx.addSystemMessage('Type your message and press Enter or click Send.');
      ctx.addSystemMessage('Commands: /help, /clear, /models, /system, /temp, /save, /load, /switch, /show, /port, /attach, /attachments, /detach, /clearattachments');

      ctx.loadSessionMemoryPreferences().then(() => ctx.loadInputRecallHistory());
      setTimeout(() => ctx.verifyGPUUsage(), 3000);
      setInterval(() => ctx.verifyGPUUsage(), 30000);
      ctx.userInput.focus();
    }

    return {
      buildControllers,
      runPostInit
    };
  }

  window.TerminalBootstrap = {
    createBootstrapController
  };
})();
