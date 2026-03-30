/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Chat Message Helpers
 */

(function() {
  'use strict';

  function createChatMessageHelpers(ctx) {
    const { state, elements, api, diffHelpers, scrollToBottom, recordConversationEntry } = ctx;

    function applyDiffDisplayMode(content) {
      if (diffHelpers?.applyDiffDisplayMode) {
        return diffHelpers.applyDiffDisplayMode(content, state);
      }
      return String(content || '');
    }

    function addMessage(role, content) {
      const roleKey = String(role || '').toLowerCase();
      const msgDiv = document.createElement('div');
      msgDiv.className = `ct-message ${role}`;

      const roleDiv = document.createElement('div');
      roleDiv.className = 'ct-message-role';
      roleDiv.textContent = role === 'user' ? 'You' :
                            role === 'assistant' ? 'Assistant' : 'System';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'ct-message-content';
      if (roleKey === 'assistant') {
        contentDiv.innerHTML = api.parseMarkdown(content);
        api.highlightCodeBlocks(contentDiv, content);
      } else {
        contentDiv.textContent = content;
      }

      msgDiv.appendChild(roleDiv);
      msgDiv.appendChild(contentDiv);
      elements.chatDisplay.appendChild(msgDiv);
      scrollToBottom();
      recordConversationEntry({
        role: roleKey || 'system',
        content: String(content || ''),
        ts: Date.now()
      });
      return msgDiv;
    }

    function addSystemMessage(content) {
      addMessage('system', content);
    }

    function addAssistantShell() {
      const id = 'msg_' + Date.now();
      const msgDiv = document.createElement('div');
      msgDiv.className = 'ct-message assistant';
      msgDiv.id = id;

      const roleDiv = document.createElement('div');
      roleDiv.className = 'ct-message-role';
      roleDiv.textContent = 'Assistant';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'ct-message-content';
      contentDiv.innerHTML = '<span class="ct-typing">⋯</span>';

      const thinkingDiv = document.createElement('div');
      thinkingDiv.className = 'ct-message-thinking hidden';

      msgDiv.appendChild(roleDiv);
      msgDiv.appendChild(thinkingDiv);
      msgDiv.appendChild(contentDiv);
      elements.chatDisplay.appendChild(msgDiv);

      scrollToBottom();
      return id;
    }

    function setAssistantShellRole(id, modelName) {
      const msgDiv = document.getElementById(id);
      if (!msgDiv) return;
      const roleDiv = msgDiv.querySelector('.ct-message-role');
      if (!roleDiv) return;
      const label = String(modelName || '').trim();
      roleDiv.textContent = label ? `Assistant (${label})` : 'Assistant';
    }

    function finalizeMessage(id, content) {
      const msgDiv = document.getElementById(id);
      if (!msgDiv) return;
      const contentDiv = msgDiv.querySelector('.ct-message-content');
      if (!contentDiv) return;
      const renderedContent = applyDiffDisplayMode(content);
      contentDiv.innerHTML = api.parseMarkdown(renderedContent);
      api.highlightCodeBlocks(contentDiv, content);
      scrollToBottom();
      recordConversationEntry({
        role: 'assistant',
        content: String(content || ''),
        ts: Date.now()
      });
    }

    function updateAssistantShell(id, content) {
      const msgDiv = document.getElementById(id);
      if (!msgDiv) return;
      const contentDiv = msgDiv.querySelector('.ct-message-content');
      if (!contentDiv) return;
      const renderedContent = applyDiffDisplayMode(content);
      contentDiv.innerHTML = api.parseMarkdown(renderedContent);
      api.highlightCodeBlocks(contentDiv, content);
      scrollToBottom();
    }

    function updateAssistantThinking(id, content) {
      const msgDiv = document.getElementById(id);
      if (!msgDiv) return;
      const thinkingDiv = msgDiv.querySelector('.ct-message-thinking');
      if (!thinkingDiv) return;

      if (!content || !content.trim() || !state.showThinking) {
        thinkingDiv.classList.add('hidden');
        if (!content || !content.trim()) {
          thinkingDiv.textContent = '';
        }
        return;
      }

      thinkingDiv.classList.remove('hidden');
      thinkingDiv.textContent = content;
      scrollToBottom();
    }

    function refreshThinkingVisibility() {
      const thinkingBlocks = document.querySelectorAll('.ct-message-thinking');
      thinkingBlocks.forEach((el) => {
        const hasText = !!(el.textContent || '').trim();
        if (state.showThinking && hasText) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      });
    }

    function applyThinkingToggleUi() {
      if (elements.btnThinkingToggle) {
        elements.btnThinkingToggle.textContent = `Thinking: ${state.showThinking ? 'On' : 'Off'}`;
      }
    }

    function applyAutoScrollToggleUi() {
      if (elements.btnAutoScrollToggle) {
        elements.btnAutoScrollToggle.textContent = `Auto-scroll: ${state.autoScroll ? 'On' : 'Off'}`;
      }
    }

    function formatStartupPhase(phase) {
      const p = String(phase || '').toLowerCase();
      if (p === 'start') return 'Starting llama.cpp session';
      if (p === 'config') return 'Checking model configuration';
      if (p === 'reuse') return 'Using active llama.cpp session';
      if (p === 'ready') return 'llama.cpp ready';
      return 'Model startup in progress';
    }

    return {
      addMessage,
      addSystemMessage,
      addAssistantShell,
      setAssistantShellRole,
      finalizeMessage,
      updateAssistantShell,
      updateAssistantThinking,
      refreshThinkingVisibility,
      applyThinkingToggleUi,
      applyAutoScrollToggleUi,
      formatStartupPhase
    };
  }

  window.CodingTerminalRendererChatMessages = {
    createChatMessageHelpers
  };
})();
