/**
 *
 * @version 1.1.3 - March 5, 2026
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

    async function handleAttachPlusClick() {
      const api = window.electronAPI || null;
      if (!api || typeof api.selectImportFile !== 'function') {
        addErrorMessage('File picker is not available in this build.');
        return;
      }
      try {
        const result = await api.selectImportFile({
          mode: 'attachment',
          title: 'Attach Image or Text File'
        });
        if (!result || result.canceled || result.success === false) return;
        const filePath = String(result.filePath || '').trim();
        if (!filePath) return;
        const attachmentController = getAttachmentController();
        if (attachmentController && typeof attachmentController.attachFile === 'function') {
          await attachmentController.attachFile(filePath, { sessionOnly: true });
        } else {
          await attachFile(filePath);
        }
        const input = getUserInput();
        if (input) input.focus();
      } catch (err) {
        addErrorMessage(`Attach failed: ${err.message || String(err)}`);
      }
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

    function hasKnownAttachments() {
      const attachmentController = getAttachmentController();
      if (!attachmentController || typeof attachmentController.hasKnownAttachments !== 'function') return false;
      return attachmentController.hasKnownAttachments() === true;
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

    function moveCaretToInputEnd(input) {
      if (!input) return;
      input.focus();
      const end = String(input.value || '').length;
      try {
        input.setSelectionRange(end, end);
      } catch (_) {
        // Some input types do not support selection ranges.
      }
    }

    function isEditablePasteTarget(target) {
      if (!target || target === document.body || target === document.documentElement) return false;
      const tag = String(target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      return target.isContentEditable === true || Boolean(target.closest?.('[contenteditable="true"]'));
    }

    function handleInputPaste(event) {
      const input = getUserInput();
      if (!input) return;
      if (event?.target === input) {
        setTimeout(() => moveCaretToInputEnd(input), 0);
        return;
      }
      if (isEditablePasteTarget(event?.target)) return;

      const text = String(event?.clipboardData?.getData?.('text') || '');
      if (!text) {
        setTimeout(() => moveCaretToInputEnd(input), 0);
        return;
      }
      event.preventDefault();
      input.value = `${String(input.value || '')}${text}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      moveCaretToInputEnd(input);
      setTimeout(() => moveCaretToInputEnd(input), 0);
    }

    async function handleStopClick() {
      if (!ctx.getIsWaitingForResponse?.()) return;
      ctx.setStreamStopRequested?.(true);
      const active = ctx.getActiveStream?.() || null;
      const activeRlmSessionId = String(ctx.getActiveRlmSessionId?.() || '').trim();
      const ttsStreamId = active?.ttsStreamId ? String(active.ttsStreamId) : '';
      try {
        const vc = getVoiceController();
        if (vc && typeof vc.stopSpeech === 'function') {
          vc.stopSpeech();
        }
        if (active?.abortController && typeof active.abortController.abort === 'function') {
          active.abortController.abort();
        }
        if (activeRlmSessionId && window.electronAPI && typeof window.electronAPI.rlmStopSession === 'function') {
          await window.electronAPI.rlmStopSession(activeRlmSessionId, 'user-stop');
          ctx.setActiveRlmSessionId?.('');
        } else if (window.electronAPI && typeof window.electronAPI.ollamaStopStream === 'function') {
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
        ctx.setActiveRlmSessionId?.('');
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
      handleAttachPlusClick,
      installDragAndDropAttach,
      listAttachments,
      detachAttachment,
      clearAttachments,
      openAttachmentManager,
      buildAttachmentContext,
      hasKnownAttachments,
      formatBytes,
      handleInputKeypress,
      handleInputPaste,
      handleStopClick,
      initializeVoiceToText
    };
  }

  window.TerminalIo = {
    createIoController
  };
})();
