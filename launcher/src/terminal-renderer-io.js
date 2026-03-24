/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

(function() {
  'use strict';

  function createIoController(ctx = {}) {
    const getCommandController = () => (typeof ctx.getCommandController === 'function' ? ctx.getCommandController() : null);
    const getAttachmentController = () => (typeof ctx.getAttachmentController === 'function' ? ctx.getAttachmentController() : null);
    const getUserInput = () => (typeof ctx.getUserInput === 'function' ? ctx.getUserInput() : null);
    const getVoiceController = () => (typeof ctx.getVoiceController === 'function' ? ctx.getVoiceController() : null);
    const setVoiceController = (value) => { if (typeof ctx.setVoiceController === 'function') ctx.setVoiceController(value); };
    const setVoiceElements = (voiceBtn, voiceModeBtn) => { if (typeof ctx.setVoiceElements === 'function') ctx.setVoiceElements(voiceBtn, voiceModeBtn); };
    const addErrorMessage = (text) => { if (typeof ctx.addErrorMessage === 'function') ctx.addErrorMessage(text); };
    const addSystemMessage = (text) => { if (typeof ctx.addSystemMessage === 'function') ctx.addSystemMessage(text); };

    async function populateModelDropdown(port) {
      const commandController = getCommandController();
      if (!commandController || typeof commandController.populateModelDropdown !== 'function') return;
      await commandController.populateModelDropdown(port);
      const select = document.getElementById('model-select');
      if (select) {
        select.onchange = (event) => {
          if (!commandController || typeof commandController.handleModelChange !== 'function') return;
          commandController.handleModelChange(event);
        };
      }
    }

    async function handleCommand(command) {
      const commandController = getCommandController();
      if (!commandController || typeof commandController.handleCommand !== 'function') return;
      await commandController.handleCommand(command);
    }

    async function attachFile(rawPath) {
      const attachmentController = getAttachmentController();
      if (!attachmentController || typeof attachmentController.attachFile !== 'function') {
        addErrorMessage('Attachment APIs are not available in this build.');
        return;
      }
      await attachmentController.attachFile(rawPath);
    }

    function installDragAndDropAttach() {
      const attachmentController = getAttachmentController();
      if (!attachmentController || typeof attachmentController.installDragAndDropAttach !== 'function') return;
      attachmentController.installDragAndDropAttach();
    }

    async function listAttachments() {
      const attachmentController = getAttachmentController();
      if (!attachmentController || typeof attachmentController.listAttachments !== 'function') return;
      await attachmentController.listAttachments();
    }

    async function detachAttachment(rawId) {
      const attachmentController = getAttachmentController();
      if (!attachmentController || typeof attachmentController.detachAttachment !== 'function') return;
      await attachmentController.detachAttachment(rawId);
    }

    async function clearAttachments() {
      const attachmentController = getAttachmentController();
      if (!attachmentController || typeof attachmentController.clearAttachments !== 'function') return;
      await attachmentController.clearAttachments();
    }

    async function openAttachmentManager() {
      const attachmentController = getAttachmentController();
      if (!attachmentController || typeof attachmentController.openAttachmentManager !== 'function') return;
      await attachmentController.openAttachmentManager();
    }

    async function buildAttachmentContext() {
      const attachmentController = getAttachmentController();
      if (!attachmentController || typeof attachmentController.buildAttachmentContext !== 'function') return '';
      return attachmentController.buildAttachmentContext();
    }

    function formatBytes(bytes) {
      const value = Number(bytes);
      if (!Number.isFinite(value) || value <= 0) return '0 B';
      if (value < 1024) return `${Math.round(value)} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function handleInputKeypress(e) {
      if (e.key === 'ArrowUp') {
        if (ctx.applyInputRecall?.(-1)) e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown') {
        if (ctx.applyInputRecall?.(1)) e.preventDefault();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !ctx.getIsWaitingForResponse?.()) {
        e.preventDefault();
        ctx.sendMessage?.();
      }
    }

    async function handleStopClick() {
      if (!ctx.getIsWaitingForResponse?.() || !ctx.getActiveStream?.()) return;
      ctx.setStreamStopRequested?.(true);
      const active = ctx.getActiveStream?.() || null;
      const ttsStreamId = active?.ttsStreamId ? String(active.ttsStreamId) : '';
      try {
        const vc = getVoiceController();
        if (vc && typeof vc.stopSpeech === 'function') {
          vc.stopSpeech();
        }
        if (active?.abortController && typeof active.abortController.abort === 'function') {
          active.abortController.abort();
        }
        if (window.electronAPI && typeof window.electronAPI.ollamaStopStream === 'function') {
          await window.electronAPI.ollamaStopStream({ port: ctx.getTerminalPort?.() });
        }
        addSystemMessage('⏹️ Generation stopped.');
      } catch (err) {
        addErrorMessage(`Stop failed: ${err.message || String(err)}`);
      } finally {
        if (ttsStreamId) {
          const engine = ctx.ensureSpeechEngine?.();
          if (engine && typeof engine.cancelStream === 'function') {
            engine.cancelStream(ttsStreamId);
          }
        }
        ctx.setActiveStream?.(null);
        ctx.setWaitingState?.(false);
        const input = getUserInput();
        if (input) input.focus();
      }
    }

    async function initializeVoiceToText() {
      if (!window.PsfVoiceToText || typeof window.PsfVoiceToText.createVoiceController !== 'function') return;
      const voiceBtn = document.getElementById('voice-btn');
      const voiceModeBtn = document.getElementById('voice-mode-btn');
      setVoiceElements(voiceBtn, voiceModeBtn);
      const userInput = getUserInput();
      if (!voiceBtn || !userInput) return;
      const controller = window.PsfVoiceToText.createVoiceController({
        surface: 'psf-terminal',
        getElectronAPI: () => window.electronAPI || null,
        getInputElement: () => getUserInput(),
        getButtonElement: () => voiceBtn,
        getModeButtonElement: () => voiceModeBtn,
        onAutoSend: () => {
          if (ctx.getIsWaitingForResponse?.()) return;
          const pending = String(getUserInput()?.value || '').trim();
          if (!pending) return;
          ctx.sendMessage?.();
        },
        onStatus: (text) => addSystemMessage(text),
        onError: (text) => addErrorMessage(text),
        onTranscription: (text) => {
          if (!text) return;
          const vc = getVoiceController();
          const input = getUserInput();
          if (typeof vc?.handleTranscript === 'function') {
            vc.handleTranscript(text);
          } else if (input) {
            input.value = `${String(input.value || '').trim()} ${String(text || '').trim()}`.trim();
          }
        }
      });
      setVoiceController(controller);
      await controller.init();
      ctx.ensureSpeechEngine?.();
      try {
        const cfg = await controller.loadConfig();
        ctx.setLastSpeechCfg?.(cfg);
        await ctx.applySpeechEngineProfile?.(cfg);
      } catch (_) {}
    }

    return {
      populateModelDropdown,
      handleCommand,
      attachFile,
      installDragAndDropAttach,
      listAttachments,
      detachAttachment,
      clearAttachments,
      openAttachmentManager,
      buildAttachmentContext,
      formatBytes,
      handleInputKeypress,
      handleStopClick,
      initializeVoiceToText
    };
  }

  window.TerminalIo = {
    createIoController
  };
})();
