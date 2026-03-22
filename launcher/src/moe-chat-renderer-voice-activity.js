/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

window.createMoeChatVoiceActivityOps = function createMoeChatVoiceActivityOps(ctx = {}) {
  let activityTicker = null;
  let activityStartedAtMs = 0;

  function ensureActivityIndicator() {
    const elements = ctx.getElements?.() || {};
    let node = document.getElementById('moe-chat-activity-indicator');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'moe-chat-activity-indicator';
    node.className = 'typing-indicator';
    node.style.display = 'none';
    node.innerHTML = `
      <div class="typing-dots"><span></span><span></span><span></span></div>
      <span id="moe-chat-activity-text">Working...</span>
    `;
    elements.messages?.appendChild(node);
    return node;
  }

  function startActivityIndicator(label = 'Working...') {
    const elements = ctx.getElements?.() || {};
    const node = ensureActivityIndicator();
    const textNode = document.getElementById('moe-chat-activity-text');
    activityStartedAtMs = Date.now();
    if (textNode) textNode.textContent = `${label} (0s)`;
    node.style.display = 'flex';
    if (elements.messages) elements.messages.scrollTop = elements.messages.scrollHeight;
    if (activityTicker) clearInterval(activityTicker);
    activityTicker = setInterval(() => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - activityStartedAtMs) / 1000));
      const dots = '.'.repeat((elapsedSec % 3) + 1);
      if (textNode) textNode.textContent = `${label} (${elapsedSec}s)`;
      if (elements.messages) elements.messages.scrollTop = elements.messages.scrollHeight;
      if (ctx.isProcessing?.()) {
        ctx.setStatus?.('processing', `Processing${dots} ${elapsedSec}s`);
      }
    }, 1000);
  }

  function stopActivityIndicator() {
    if (activityTicker) {
      clearInterval(activityTicker);
      activityTicker = null;
    }
    const node = document.getElementById('moe-chat-activity-indicator');
    if (node) node.style.display = 'none';
  }

  async function initializeVoiceToText() {
    const elements = ctx.getElements?.() || {};
    if (!window.PsfVoiceToText || typeof window.PsfVoiceToText.createVoiceController !== 'function') return null;
    if (!elements.voiceBtn || !elements.input) return null;
    const voiceController = window.PsfVoiceToText.createVoiceController({
      surface: 'psf-relay-pipeline-chat',
      getElectronAPI: () => window.electronAPI || null,
      getInputElement: () => elements.input,
      getButtonElement: () => elements.voiceBtn,
      getModeButtonElement: () => elements.voiceModeBtn,
      onAutoSend: () => {
        if (ctx.isProcessing?.()) return;
        const pending = String(elements.input?.value || '').trim();
        if (!pending) return;
        ctx.sendMessage?.();
      },
      onStatus: (text) => ctx.addSystemMessage?.(text),
      onError: (text) => ctx.addSystemMessage?.(`Voice: ${text}`),
      onTranscription: (text) => voiceController?.handleTranscript?.(text)
    });
    await voiceController.init();

    let speechEngine = null;
    if (window.PsfSpeechEngine && typeof window.PsfSpeechEngine.createSpeechEngine === 'function') {
      speechEngine = window.PsfSpeechEngine.createSpeechEngine({
        runSpeak: (chunk) => voiceController?.speak?.(chunk),
        runSynthesize: (chunk) => voiceController?.synthesize?.(chunk),
        runPlayAudio: (audioJob) => voiceController?.playAudio?.(audioJob?.audioBase64 || '', audioJob?.mimeType || 'audio/wav'),
        interruptPlayback: () => voiceController?.stopSpeech?.(),
        isDebugEnabled: () => false
      });
    }

    return { voiceController, speechEngine };
  }

  return {
    startActivityIndicator,
    stopActivityIndicator,
    initializeVoiceToText
  };
};
