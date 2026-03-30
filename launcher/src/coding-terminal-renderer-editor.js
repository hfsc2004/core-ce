/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Editor Module
 */

(function() {
  'use strict';

  function createEditorModule(ctx) {
    const { state, elements, api } = ctx;

    async function refreshEditorFiles() {
      if (!elements.editorFileSelect) return;
      if (!state.projectPath) {
        elements.editorFileSelect.innerHTML = '<option value="">Attach a project first</option>';
        if (!state.editorCurrentFile && elements.editorFilename) {
          elements.editorFilename.textContent = 'No file open';
        }
        return;
      }
      if (!window.electronAPI?.codingEditorListFiles) {
        elements.editorFileSelect.innerHTML = '<option value="">Editor API unavailable</option>';
        return;
      }

      try {
        const result = await window.electronAPI.codingEditorListFiles({ maxFiles: 3000, maxDepth: 16 });
        if (!result?.success) {
          elements.editorFileSelect.innerHTML = `<option value="">${api.escapeHtml(result?.error || 'Unable to list files')}</option>`;
          return;
        }
        state.editorFiles = Array.isArray(result.files) ? result.files : [];
        renderEditorFileOptions();
      } catch (err) {
        console.error('[CodingTerminal] Editor file list error:', err);
        elements.editorFileSelect.innerHTML = '<option value="">Editor file list error</option>';
      }
    }

    function renderEditorFileOptions() {
      if (!elements.editorFileSelect) return;
      const files = state.editorFiles || [];
      if (files.length === 0) {
        elements.editorFileSelect.innerHTML = '<option value="">No files found</option>';
        return;
      }

      const current = state.editorCurrentFile || '';
      const options = ['<option value="">Select file…</option>']
        .concat(files.map((f) => `<option value="${api.escapeHtml(f)}">${api.escapeHtml(f)}</option>`));
      elements.editorFileSelect.innerHTML = options.join('');
      if (current && files.includes(current)) {
        elements.editorFileSelect.value = current;
      }
    }

    async function openSelectedEditorFile() {
      if (!elements.editorFileSelect) return;
      const selected = elements.editorFileSelect.value;
      if (!selected) return;
      if (state.editorDirty && state.editorCurrentFile && state.editorCurrentFile !== selected) {
        api.addSystemMessage('Editor has unsaved changes. Save before opening another file.');
        elements.editorFileSelect.value = state.editorCurrentFile || '';
        return;
      }
      await openEditorFile(selected);
    }

    async function openEditorFile(relativePath) {
      if (!window.electronAPI?.codingEditorReadFile) {
        api.addSystemMessage('Editor read API unavailable.');
        return;
      }
      try {
        const result = await window.electronAPI.codingEditorReadFile(relativePath);
        if (!result?.success || !result.file) {
          api.addSystemMessage(`Open file failed: ${result?.error || 'Unknown error'}`);
          return;
        }
        state.editorCurrentFile = result.file.relativePath || relativePath;
        state.editorDirty = false;
        if (elements.editorInput) {
          elements.editorInput.value = result.file.content || '';
        }
        updateEditorHeader();
        if (elements.editorFileSelect) {
          elements.editorFileSelect.value = state.editorCurrentFile;
        }
        api.addSystemMessage(`Editor opened: ${state.editorCurrentFile}`);
      } catch (err) {
        console.error('[CodingTerminal] Editor open error:', err);
        api.addSystemMessage(`Editor open error: ${err.message}`);
      }
    }

    async function saveEditorFile() {
      if (!state.editorCurrentFile) {
        api.addSystemMessage('No file is open in Editor.');
        return;
      }
      if (!window.electronAPI?.codingEditorSaveFile) {
        api.addSystemMessage('Editor save API unavailable.');
        return;
      }
      try {
        const content = elements.editorInput ? elements.editorInput.value : '';
        const result = await window.electronAPI.codingEditorSaveFile({
          relativePath: state.editorCurrentFile,
          content
        });
        if (!result?.success) {
          api.addSystemMessage(`Save failed: ${result?.error || 'Unknown error'}`);
          return;
        }
        state.editorDirty = false;
        updateEditorHeader();
        api.addSystemMessage(`Saved: ${state.editorCurrentFile}`);
        await api.refreshGitStatus();
      } catch (err) {
        console.error('[CodingTerminal] Editor save error:', err);
        api.addSystemMessage(`Save error: ${err.message}`);
      }
    }

    function handleEditorRun() {
      if (!state.editorCurrentFile) {
        api.addSystemMessage('No file open to run.');
        return;
      }
      api.addSystemMessage(`Run is not wired yet for ${state.editorCurrentFile}.`);
    }

    function handleEditorChatSend() {
      const input = elements.editorChatInput;
      if (!input) return;
      const message = input.value.trim();
      if (!message) return;
      if (state.streaming) {
        api.handleSteer?.('editor');
        return;
      }
      input.value = '';
      api.addPromptRecallEntry(message);
      api.addMessage('user', message);
      api.sendMessage(message);
    }

    function updateEditorHeader() {
      if (!elements.editorFilename) return;
      if (!state.editorCurrentFile) {
        elements.editorFilename.textContent = 'No file open';
        return;
      }
      elements.editorFilename.textContent = state.editorDirty
        ? `${state.editorCurrentFile} *`
        : state.editorCurrentFile;
    }

    return {
      refreshEditorFiles,
      renderEditorFileOptions,
      openSelectedEditorFile,
      openEditorFile,
      saveEditorFile,
      handleEditorRun,
      handleEditorChatSend,
      updateEditorHeader
    };
  }

  window.CodingTerminalRendererEditor = {
    createEditorModule
  };
})();
