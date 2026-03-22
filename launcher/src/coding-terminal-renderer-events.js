/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Events Module
 */

(function() {
  'use strict';

  function createEventsModule(ctx) {
    const { state, elements, api } = ctx;

    function attachEventListeners() {
      elements.sendBtn.addEventListener('click', api.handleSend);
      elements.stopBtn?.addEventListener('click', api.handleStop);
      elements.steerBtn?.addEventListener('click', () => api.handleSteer('chat'));
      elements.btnStopTop?.addEventListener('click', api.handleStop);
      elements.userInput.addEventListener('keydown', (e) => {
        if (api.handlePromptRecallKeydown(e, elements.userInput, api.handleSend)) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          api.handleSend();
        }
      });

      document.querySelectorAll('.ct-tab').forEach((tab) => {
        tab.addEventListener('click', () => api.switchView(tab.dataset.panel));
      });

      elements.btnRag?.addEventListener('click', api.handleHeaderRagClick);
      elements.btnGit?.addEventListener('click', api.handleHeaderGitClick);
      elements.btnSettingsDrawerHandle?.addEventListener('click', api.handleContextRailToggle);
      elements.btnSettingsRailRag?.addEventListener('click', () => api.handleContextRailSelect('rag'));
      elements.btnSettingsRailGit?.addEventListener('click', () => api.handleContextRailSelect('git'));
      elements.btnSettingsRailPlan?.addEventListener('click', () => api.handleContextRailSelect('plan'));
      elements.btnSettingsRailTrace?.addEventListener('click', () => api.handleContextRailSelect('trace'));
      elements.btnSessionNew?.addEventListener('click', api.handleSessionNew);
      elements.btnSessionSave?.addEventListener('click', api.handleSessionSave);
      elements.btnSessionLoad?.addEventListener('click', api.handleSessionLoad);
      elements.btnSessionDelete?.addEventListener('click', api.handleSessionDelete);
      elements.btnProjectRootTop?.addEventListener('click', api.handleSelectProjectRoot);
      elements.btnRagTop?.addEventListener('click', api.handleSelectRagBucketFromHeader);
      elements.btnRlmFolderTop?.addEventListener('click', api.openRlmAttachmentManager);
      elements.modelSelect?.addEventListener('change', api.handleModelSelection);
      elements.routerModelSelect?.addEventListener('change', api.handleRouterModelSelection);
      elements.chatModeSelect?.addEventListener('change', api.handleChatModeSelection);
      elements.btnModelRefresh?.addEventListener('click', async () => {
        await api.loadModelSelector();
        await api.loadRouterModelSelector();
      });
      elements.btnRefreshRag?.addEventListener('click', api.refreshRagSources);
      elements.btnIndexRag?.addEventListener('click', api.handleIndexProject);
      elements.btnRagClear?.addEventListener('click', api.handleClearRagSources);
      elements.btnRagBucketNew?.addEventListener('click', api.handleCreateRagBucket);
      elements.btnRagBucketDelete?.addEventListener('click', api.handleDeleteRagBucket);
      elements.ragBucketSelect?.addEventListener('change', api.handleSelectRagBucket);
      elements.btnRefreshGit?.addEventListener('click', api.refreshGitStatus);
      elements.btnRefreshPlanRun?.addEventListener('click', api.refreshPlanRuns);
      elements.btnRefreshTrace?.addEventListener('click', api.refreshModelTrace);
      elements.btnPromptGuide?.addEventListener('click', api.showPromptGuideModal);
      elements.btnGitHelp?.addEventListener('click', api.showGitHelpModal);
      elements.btnGitHelpClose?.addEventListener('click', api.hideGitHelpModal);
      elements.btnPromptGuideClose?.addEventListener('click', api.hidePromptGuideModal);
      elements.gitHelpModal?.addEventListener('click', (e) => {
        if (e.target === elements.gitHelpModal) api.hideGitHelpModal();
      });
      elements.promptGuideModal?.addEventListener('click', (e) => {
        if (e.target === elements.promptGuideModal) api.hidePromptGuideModal();
      });
      elements.gitControls?.querySelectorAll('[data-git-action]')?.forEach((btn) => {
        btn.addEventListener('click', () => api.executeGitAction(btn.dataset.gitAction));
      });
      elements.btnOpenFile?.addEventListener('click', api.openSelectedEditorFile);
      elements.btnSave?.addEventListener('click', api.saveEditorFile);
      elements.btnRun?.addEventListener('click', api.handleEditorRun);
      elements.editorSendBtn?.addEventListener('click', api.handleEditorChatSend);
      elements.editorStopBtn?.addEventListener('click', api.handleStop);
      elements.editorSteerBtn?.addEventListener('click', () => api.handleSteer('editor'));
      elements.editorFileSelect?.addEventListener('change', api.openSelectedEditorFile);
      elements.editorChatInput?.addEventListener('keydown', (e) => {
        if (api.handlePromptRecallKeydown(e, elements.editorChatInput, api.handleEditorChatSend)) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          api.handleEditorChatSend();
        }
      });
      elements.editorInput?.addEventListener('input', () => {
        if (!state.editorCurrentFile) return;
        state.editorDirty = true;
        api.updateEditorHeader();
      });
      elements.ragSources?.addEventListener('click', api.handleRagSourceClick);

      document.addEventListener('contextmenu', api.handleContextMenu);
    }

    return {
      attachEventListeners
    };
  }

  window.CodingTerminalRendererEvents = {
    createEventsModule
  };
})();
