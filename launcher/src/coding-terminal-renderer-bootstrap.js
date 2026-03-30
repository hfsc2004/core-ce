/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Bootstrap Module
 */

(function() {
  'use strict';

  function createBootstrapModule(ctx) {
    const { state, featureModules, getElements, setElements, api } = ctx;

    function cacheElements() {
      setElements({
        chatView: document.getElementById('view-chat'),
        editorView: document.getElementById('view-editor'),

        chatDisplay: document.getElementById('chat-display'),
        userInput: document.getElementById('user-input'),
        voiceBtn: document.getElementById('voice-btn'),
        sendBtn: document.getElementById('send-btn'),
        stopBtn: document.getElementById('stop-btn'),
        steerBtn: document.getElementById('steer-btn'),

        editorFileSelect: document.getElementById('editor-file-select'),
        editorInput: document.getElementById('editor-input'),
        editorFilename: document.getElementById('editor-filename'),
        btnOpenFile: document.getElementById('btn-open-file'),
        btnSave: document.getElementById('btn-save'),
        btnRun: document.getElementById('btn-run'),
        editorChatInput: document.getElementById('editor-chat-input'),
        editorSendBtn: document.getElementById('editor-send-btn'),
        editorStopBtn: document.getElementById('editor-stop-btn'),
        editorSteerBtn: document.getElementById('editor-steer-btn'),

        sectionRag: document.getElementById('section-rag'),
        sectionGit: document.getElementById('section-git'),
        panelContext: document.getElementById('panel-context'),
        ragSources: document.getElementById('rag-sources'),
        ragIndexInfo: document.getElementById('rag-index-info'),
        ragBucketSelect: document.getElementById('rag-bucket-select'),
        gitStatus: document.getElementById('git-status'),

        statusRag: document.getElementById('status-rag'),
        statusGit: document.getElementById('status-git'),
        statusModel: document.getElementById('status-model'),
        statusCopyright: document.getElementById('status-copyright'),

        modelSelect: document.getElementById('model-select'),
        routerModelSelect: document.getElementById('router-model-select'),
        chatModeSelect: document.getElementById('chat-mode-select'),
        btnCliAgentInline: document.getElementById('btn-cli-agent-inline'),
        btnCliPolicyInline: document.getElementById('btn-cli-policy-inline'),
        btnCliBudgetInline: document.getElementById('btn-cli-budget-inline'),

        btnRag: document.getElementById('btn-rag'),
        btnGit: document.getElementById('btn-git'),
        btnSettings: document.getElementById('btn-settings'),
        btnSettingsDrawerHandle: document.getElementById('btn-settings-drawer-handle'),
        btnSessionNew: document.getElementById('btn-session-new'),
        btnSessionSave: document.getElementById('btn-session-save'),
        btnSessionLoad: document.getElementById('btn-session-load'),
        btnSessionDelete: document.getElementById('btn-session-delete'),
        btnProjectRootTop: document.getElementById('btn-project-root-top'),
        btnRagTop: document.getElementById('btn-rag-top'),
        btnRlmFolderTop: document.getElementById('btn-rlm-folder-top'),
        btnStopTop: document.getElementById('btn-stop-top'),
        btnModelRefresh: document.getElementById('btn-model-refresh'),
        btnRagClear: document.getElementById('btn-rag-clear'),
        btnRefreshRag: document.getElementById('btn-refresh-rag'),
        btnRefreshGit: document.getElementById('btn-refresh-git'),
        btnPromptGuide: document.getElementById('btn-prompt-guide'),
        btnGitHelp: document.getElementById('btn-git-help'),
        btnIndexRag: document.getElementById('btn-index-rag'),
        btnRagBucketNew: document.getElementById('btn-rag-bucket-new'),
        btnRagBucketDelete: document.getElementById('btn-rag-bucket-delete'),
        btnRefreshPlanRun: document.getElementById('btn-refresh-plan-run'),
        btnRefreshCliLoop: document.getElementById('btn-refresh-cli-loop'),
        btnRefreshTrace: document.getElementById('btn-refresh-trace'),
        btnSettingsRailRag: document.getElementById('btn-settings-rail-rag'),
        btnSettingsRailGit: document.getElementById('btn-settings-rail-git'),
        btnSettingsRailPlan: document.getElementById('btn-settings-rail-plan'),
        btnSettingsRailTrace: document.getElementById('btn-settings-rail-trace'),

        gitControls: document.getElementById('git-controls'),
        gitStatusWrap: document.getElementById('git-status-wrap'),
        gitOutput: document.getElementById('git-output'),
        gitHelpModal: document.getElementById('git-help-modal'),
        btnGitHelpClose: document.getElementById('btn-git-help-close'),
        promptGuideModal: document.getElementById('prompt-guide-modal'),
        promptGuideBody: document.getElementById('prompt-guide-body'),
        btnPromptGuideClose: document.getElementById('btn-prompt-guide-close'),
        routerDebugPanel: document.getElementById('router-debug-panel'),
        routerDebugList: document.getElementById('router-debug-list'),
        planRunContent: document.getElementById('plan-run-content'),
        cliLoopContent: document.getElementById('cli-loop-content'),
        modelTraceContent: document.getElementById('model-trace-content')
      });
    }

    function initializeFeatureModules() {
      const elements = getElements();
      if (window.CodingTerminalRendererText?.createTextModule) {
        featureModules.text = window.CodingTerminalRendererText.createTextModule({ state, elements });
      }
      if (window.CodingTerminalRendererShell?.createShellModule) {
        featureModules.shell = window.CodingTerminalRendererShell.createShellModule({
          state,
          elements,
          api: {
            escapeHtml: api.escapeHtml,
            addSystemMessage: api.addSystemMessage
          }
        });
      }
      if (window.CodingTerminalRendererChat?.createChatModule) {
        featureModules.chat = window.CodingTerminalRendererChat.createChatModule({
          state,
          elements,
          api: {
            parseMarkdown: api.parseMarkdown,
            highlightCodeBlocks: api.highlightCodeBlocks,
            updateStatus: api.updateStatus,
            updateRagSources: api.updateRagSources,
            updateRagProgressUi: api.updateRagProgressUi,
            addRouterDebugEntry: api.addRouterDebugEntry,
            onUserPrompt: api.addPromptRecallEntry,
            pushModelTrace: api.pushModelTrace,
            setActiveModelTrace: api.setActiveModelTrace,
            clearActiveModelTrace: api.clearActiveModelTrace
          }
        });
      }
      if (window.CodingTerminalRendererRag?.createRagModule) {
        featureModules.rag = window.CodingTerminalRendererRag.createRagModule({
          state,
          elements,
          api: {
            addSystemMessage: api.addSystemMessage,
            updateStatus: api.updateStatus,
            refreshEditorFiles: api.refreshEditorFiles,
            refreshGitStatus: api.refreshGitStatus,
            updateRagButtons: api.updateRagButtons,
            updateRagIndexInfo: api.updateRagIndexInfo,
            confirmAction: api.confirmAction,
            promptText: api.promptText,
            escapeHtml: api.escapeHtml,
            normalizeBucketIdForUi: api.normalizeBucketIdForUi
          }
        });
      }
      if (window.CodingTerminalRendererGit?.createGitModule) {
        featureModules.git = window.CodingTerminalRendererGit.createGitModule({
          state,
          elements,
          api: {
            updateStatus: api.updateStatus,
            escapeHtml: api.escapeHtml
          }
        });
      }
      if (window.CodingTerminalRendererGitActions?.createGitActionsModule) {
        featureModules.gitActions = window.CodingTerminalRendererGitActions.createGitActionsModule({
          state,
          elements,
          api: {
            addSystemMessage: api.addSystemMessage,
            escapeHtml: api.escapeHtml,
            highlightCodeBlocks: api.highlightCodeBlocks,
            promptText: api.promptText,
            confirmAction: api.confirmAction,
            refreshGitStatus: api.refreshGitStatus
          }
        });
      }
      if (window.CodingTerminalRendererEvents?.createEventsModule) {
        featureModules.events = window.CodingTerminalRendererEvents.createEventsModule({
          state,
          elements,
          api: {
            handleSend: api.handleSend,
            handleStop: api.handleStop,
            handleSteer: api.handleSteer,
            handlePromptRecallKeydown: api.handlePromptRecallKeydown,
            handleVoiceToggle: api.handleVoiceToggle,
            switchView: api.switchView,
            handleHeaderRagClick: api.handleHeaderRagClick,
            handleHeaderGitClick: api.handleHeaderGitClick,
            handleHeaderSettingsClick: api.handleHeaderSettingsClick,
            handleContextRailToggle: api.handleContextRailToggle,
            handleContextRailSelect: api.handleContextRailSelect,
            handleSessionNew: api.handleSessionNew,
            handleSessionSave: api.handleSessionSave,
            handleSessionLoad: api.handleSessionLoad,
            handleSessionDelete: api.handleSessionDelete,
            handleSelectProjectRoot: api.handleSelectProjectRoot,
            handleSelectRagBucketFromHeader: api.handleSelectRagBucketFromHeader,
            openRlmAttachmentManager: api.openRlmAttachmentManager,
            handleModelSelection: api.handleModelSelection,
            handleRouterModelSelection: api.handleRouterModelSelection,
            handleChatModeSelection: api.handleChatModeSelection,
            handleCliAgentToggle: api.handleCliAgentToggle,
            handleCliAgentPolicyCycle: api.handleCliAgentPolicyCycle,
            handleCliAgentStepBudgetCycle: api.handleCliAgentStepBudgetCycle,
            loadModelSelector: api.loadModelSelector,
            loadRouterModelSelector: api.loadRouterModelSelector,
            refreshRagSources: api.refreshRagSources,
            handleIndexProject: api.handleIndexProject,
            handleClearRagSources: api.handleClearRagSources,
            handleCreateRagBucket: api.handleCreateRagBucket,
            handleDeleteRagBucket: api.handleDeleteRagBucket,
            handleSelectRagBucket: api.handleSelectRagBucket,
            refreshGitStatus: api.refreshGitStatus,
            refreshPlanRuns: api.refreshPlanRuns,
            refreshCliLoop: api.refreshCliLoop,
            refreshModelTrace: api.refreshModelTrace,
            showPromptGuideModal: api.showPromptGuideModal,
            showGitHelpModal: api.showGitHelpModal,
            hideGitHelpModal: api.hideGitHelpModal,
            hidePromptGuideModal: api.hidePromptGuideModal,
            executeGitAction: api.executeGitAction,
            openSelectedEditorFile: api.openSelectedEditorFile,
            saveEditorFile: api.saveEditorFile,
            handleEditorRun: api.handleEditorRun,
            handleEditorChatSend: api.handleEditorChatSend,
            updateEditorHeader: api.updateEditorHeader,
            handleRagSourceClick: api.handleRagSourceClick,
            handleContextMenu: api.handleContextMenu
          }
        });
      }
      if (window.CodingTerminalRendererRuntime?.createRuntimeModule) {
        featureModules.runtime = window.CodingTerminalRendererRuntime.createRuntimeModule({
          state,
          elements,
          api: {
            updateStatus: api.updateStatus,
            addSystemMessage: api.addSystemMessage
          }
        });
      }
      if (window.CodingTerminalRendererTrace?.createTraceModule) {
        featureModules.trace = window.CodingTerminalRendererTrace.createTraceModule({
          state,
          elements,
          api: {
            addSystemMessage: api.addSystemMessage
          }
        });
      }
      if (window.CodingTerminalRendererEditor?.createEditorModule) {
        featureModules.editor = window.CodingTerminalRendererEditor.createEditorModule({
          state,
          elements,
          api: {
            escapeHtml: api.escapeHtml,
            addSystemMessage: api.addSystemMessage,
            refreshGitStatus: api.refreshGitStatus,
            addPromptRecallEntry: api.addPromptRecallEntry,
            addMessage: api.addMessage,
            sendMessage: api.sendMessage
          }
        });
      }
      if (window.CodingTerminalRendererProject?.createProjectModule) {
        featureModules.project = window.CodingTerminalRendererProject.createProjectModule({
          state,
          elements,
          api: {
            addSystemMessage: api.addSystemMessage,
            escapeHtml: api.escapeHtml,
            refreshEditorFiles: api.refreshEditorFiles,
            refreshRagBuckets: api.refreshRagBuckets,
            refreshRagSources: api.refreshRagSources,
            refreshGitStatus: api.refreshGitStatus
          }
        });
      }
      if (window.CodingTerminalRendererUi?.createUiModule) {
        featureModules.ui = window.CodingTerminalRendererUi.createUiModule({
          state,
          elements,
          api: {
            escapeHtml: api.escapeHtml,
            toTitleCaseDiffMode: api.toTitleCaseDiffMode,
            refreshEditorFiles: api.refreshEditorFiles,
            handleInferenceBackendCycle: api.handleInferenceBackendCycle,
            handleRouterToggle: api.handleRouterToggle,
            handleRouterGpuToggle: api.handleRouterGpuToggle,
            handleRagToggle: api.handleRagToggle,
            handleRouterDebugToggle: api.handleRouterDebugToggle,
            handleThinkingToggle: api.handleThinkingToggle,
            handleAutoScrollToggle: api.handleAutoScrollToggle,
            handleRagDebugToggle: api.handleRagDebugToggle,
            handleDeterministicToggle: api.handleDeterministicToggle,
            handleCliAgentToggle: api.handleCliAgentToggle,
            handleCliAgentPolicyCycle: api.handleCliAgentPolicyCycle,
            handleCliAgentStepBudgetCycle: api.handleCliAgentStepBudgetCycle,
            handleTestModeToggle: api.handleTestModeToggle,
            handleRlmToggle: api.handleRlmToggle,
            handleRlmProfileCycle: api.handleRlmProfileCycle,
            handleRlmSharedAttachmentsToggle: api.handleRlmSharedAttachmentsToggle,
            handleRlmAdvancedBudgetsToggle: api.handleRlmAdvancedBudgetsToggle,
            handleRlmBudgetEdit: api.handleRlmBudgetEdit,
            handleDiffLegendToggle: api.handleDiffLegendToggle,
            handleDiffDisplayModeCycle: api.handleDiffDisplayModeCycle
          }
        });
      }
    }

    async function initializeProjectContext() {
      try {
        if (window.electronAPI?.getCodingProject) {
          const projectPath = await window.electronAPI.getCodingProject();
          if (projectPath) {
            state.projectPath = projectPath;
            api.updateProjectRootButton();
            api.addSystemMessage(`Project context: ${projectPath}`);
            await api.refreshRagBuckets();
            await api.refreshEditorFiles();
          }
        }
        if (window.electronAPI?.onCodingTerminalProjectSet) {
          window.electronAPI.onCodingTerminalProjectSet(async (projectPath) => {
            state.projectPath = projectPath;
            api.updateProjectRootButton();
            api.addSystemMessage(`Project context updated: ${projectPath}`);
            await api.refreshEditorFiles();
            await api.refreshRagBuckets();
            await api.refreshRagSources();
            await api.refreshGitStatus();
          });
        }
      } catch (err) {
        console.warn('[CodingTerminal] Project context init failed:', err.message);
      }
    }

    return {
      cacheElements,
      initializeFeatureModules,
      initializeProjectContext
    };
  }

  window.CodingTerminalRendererBootstrap = {
    createBootstrapModule
  };
})();
