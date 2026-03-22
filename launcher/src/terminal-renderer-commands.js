/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createCommandController(deps) {
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const getConfig = typeof deps?.getConfig === 'function' ? deps.getConfig : () => ({});
    const getCurrentModel = typeof deps?.getCurrentModel === 'function' ? deps.getCurrentModel : () => null;
    const setCurrentModel = typeof deps?.setCurrentModel === 'function' ? deps.setCurrentModel : (() => {});
    const getTerminalPort = typeof deps?.getTerminalPort === 'function' ? deps.getTerminalPort : () => 0;
    const getTemperature = typeof deps?.getTemperature === 'function' ? deps.getTemperature : () => 0.7;
    const setTemperatureValue = typeof deps?.setTemperatureValue === 'function' ? deps.setTemperatureValue : (() => {});
    const getTopP = typeof deps?.getTopP === 'function' ? deps.getTopP : () => null;
    const setTopP = typeof deps?.setTopP === 'function' ? deps.setTopP : (() => {});
    const getTopK = typeof deps?.getTopK === 'function' ? deps.getTopK : () => null;
    const setTopK = typeof deps?.setTopK === 'function' ? deps.setTopK : (() => {});
    const getNumCtx = typeof deps?.getNumCtx === 'function' ? deps.getNumCtx : () => null;
    const setNumCtx = typeof deps?.setNumCtx === 'function' ? deps.setNumCtx : (() => {});
    const getNumPredict = typeof deps?.getNumPredict === 'function' ? deps.getNumPredict : () => null;
    const getRepeatPenalty = typeof deps?.getRepeatPenalty === 'function' ? deps.getRepeatPenalty : () => null;
    const setRepeatPenalty = typeof deps?.setRepeatPenalty === 'function' ? deps.setRepeatPenalty : (() => {});
    const getSeed = typeof deps?.getSeed === 'function' ? deps.getSeed : () => null;
    const getStopSequences = typeof deps?.getStopSequences === 'function' ? deps.getStopSequences : () => null;
    const persistTerminalModelConfig = typeof deps?.persistTerminalModelConfig === 'function'
      ? deps.persistTerminalModelConfig
      : (() => {});
    const getSystemPrompt = typeof deps?.getSystemPrompt === 'function' ? deps.getSystemPrompt : () => null;
    const setSystemPromptValue = typeof deps?.setSystemPromptValue === 'function' ? deps.setSystemPromptValue : (() => {});
    const getRlmAssisted = typeof deps?.getRlmAssisted === 'function' ? deps.getRlmAssisted : () => false;
    const setRlmAssisted = typeof deps?.setRlmAssisted === 'function' ? deps.setRlmAssisted : (() => {});
    const getRlmVerboseTrace = typeof deps?.getRlmVerboseTrace === 'function' ? deps.getRlmVerboseTrace : () => false;
    const setRlmVerboseTrace = typeof deps?.setRlmVerboseTrace === 'function' ? deps.setRlmVerboseTrace : (() => {});
    const getRlmQuality = typeof deps?.getRlmQuality === 'function' ? deps.getRlmQuality : () => 'balanced';
    const setRlmQuality = typeof deps?.setRlmQuality === 'function' ? deps.setRlmQuality : (() => {});
    const getRlmProfile = typeof deps?.getRlmProfile === 'function' ? deps.getRlmProfile : () => 'balanced';
    const setRlmProfile = typeof deps?.setRlmProfile === 'function' ? deps.setRlmProfile : (() => {});
    const getRlmProvider = typeof deps?.getRlmProvider === 'function' ? deps.getRlmProvider : () => 'legacy';
    const setRlmProvider = typeof deps?.setRlmProvider === 'function' ? deps.setRlmProvider : (() => {});
    const getRlmAdvancedBudgets = typeof deps?.getRlmAdvancedBudgets === 'function' ? deps.getRlmAdvancedBudgets : () => false;
    const setRlmAdvancedBudgets = typeof deps?.setRlmAdvancedBudgets === 'function' ? deps.setRlmAdvancedBudgets : (() => {});
    const getRlmIncludeSharedAttachments = typeof deps?.getRlmIncludeSharedAttachments === 'function'
      ? deps.getRlmIncludeSharedAttachments
      : () => false;
    const setRlmIncludeSharedAttachments = typeof deps?.setRlmIncludeSharedAttachments === 'function'
      ? deps.setRlmIncludeSharedAttachments
      : (() => {});
    const getRlmBudgets = typeof deps?.getRlmBudgets === 'function' ? deps.getRlmBudgets : () => ({
      maxToolCalls: 40,
      maxRecursionDepth: 3,
      maxChunksProcessed: 48,
      maxRuntimeMs: 45000,
      maxEvidenceHits: 28
    });
    const setRlmBudgets = typeof deps?.setRlmBudgets === 'function' ? deps.setRlmBudgets : (() => {});
    const getLlmAssistedFileNaming = typeof deps?.getLlmAssistedFileNaming === 'function'
      ? deps.getLlmAssistedFileNaming
      : () => true;
    const setLlmAssistedFileNaming = typeof deps?.setLlmAssistedFileNaming === 'function'
      ? deps.setLlmAssistedFileNaming
      : (() => {});
    const getConversationHistoryLength = typeof deps?.getConversationHistoryLength === 'function' ? deps.getConversationHistoryLength : () => 0;
    const clearConversationHistory = typeof deps?.clearConversationHistory === 'function' ? deps.clearConversationHistory : (() => {});
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});
    const recordSessionMemory = typeof deps?.recordSessionMemory === 'function' ? deps.recordSessionMemory : (() => {});
    const clearConversation = typeof deps?.clearConversation === 'function' ? deps.clearConversation : (() => {});
    const handleStopClick = typeof deps?.handleStopClick === 'function' ? deps.handleStopClick : (async () => {});
    const attachFile = typeof deps?.attachFile === 'function' ? deps.attachFile : (async () => {});
    const listAttachments = typeof deps?.listAttachments === 'function' ? deps.listAttachments : (async () => {});
    const detachAttachment = typeof deps?.detachAttachment === 'function' ? deps.detachAttachment : (async () => {});
    const clearAttachments = typeof deps?.clearAttachments === 'function' ? deps.clearAttachments : (async () => {});
    const saveConversation = typeof deps?.saveConversation === 'function' ? deps.saveConversation : (() => {});
    const loadConversation = typeof deps?.loadConversation === 'function' ? deps.loadConversation : (() => {});
    const rlmHelpersFactory = window.TerminalCommandsRlm && typeof window.TerminalCommandsRlm.createRlmCommandHelpers === 'function'
      ? window.TerminalCommandsRlm.createRlmCommandHelpers
      : null;

    const rlmHelpers = rlmHelpersFactory
      ? rlmHelpersFactory({
          getRlmProfile,
          setRlmProfile,
          getRlmProvider,
          setRlmProvider,
          getRlmQuality,
          setRlmQuality,
          getRlmAssisted,
          setRlmAssisted,
          getRlmVerboseTrace,
          setRlmVerboseTrace,
          getRlmIncludeSharedAttachments,
          setRlmIncludeSharedAttachments,
          getRlmAdvancedBudgets,
          setRlmAdvancedBudgets,
          getRlmBudgets,
          setRlmBudgets,
          addSystemMessage,
          addErrorMessage
        })
      : null;
    const normalizeProfile = rlmHelpers ? rlmHelpers.normalizeProfile : ((value) => String(value || '').trim().toLowerCase() || 'balanced');
    const applyRlmProfile = rlmHelpers ? rlmHelpers.applyRlmProfile : (() => {});
    const updateAdvancedBudgetVisibility = rlmHelpers ? rlmHelpers.updateAdvancedBudgetVisibility : (() => {});
    const modelHelpersFactory = window.TerminalCommandsModels && typeof window.TerminalCommandsModels.createModelCommandHelpers === 'function'
      ? window.TerminalCommandsModels.createModelCommandHelpers
      : null;
    const modelHelpers = modelHelpersFactory
      ? modelHelpersFactory({
          getElectronAPI,
          getTerminalPort,
          getCurrentModel,
          setCurrentModel,
          addSystemMessage,
          addErrorMessage,
          clearConversationHistory,
          formatBytes: deps?.formatBytes
        })
      : null;
    const voiceHelpersFactory = window.TerminalCommandsVoice && typeof window.TerminalCommandsVoice.createVoiceCommandHelper === 'function'
      ? window.TerminalCommandsVoice.createVoiceCommandHelper
      : null;
    const voiceHelpers = voiceHelpersFactory
      ? voiceHelpersFactory({
          getElectronAPI,
          addSystemMessage,
          addErrorMessage
        })
      : null;

    function updateConfigPanelBounds() {
      const panel = document.getElementById('config-panel');
      if (!panel) return;
      const maxHeight = Math.max(220, window.innerHeight - 90);
      panel.style.maxHeight = `${maxHeight}px`;
      panel.style.overflowY = 'auto';
    }

    function toggleConfig() {
      const panel = document.getElementById('config-panel');
      if (!panel) return;

      if (panel.style.display === 'none') {
        updateConfigPanelBounds();
        const tempInput = document.getElementById('cfg-temperature');
        const topPInput = document.getElementById('cfg-top-p');
        const topKInput = document.getElementById('cfg-top-k');
        const numCtxInput = document.getElementById('cfg-num-ctx');
        const repeatInput = document.getElementById('cfg-repeat-penalty');
        const systemInput = document.getElementById('cfg-system-prompt');
        const rlmInput = document.getElementById('cfg-rlm-assisted');
        const rlmVerboseInput = document.getElementById('cfg-rlm-verbose');
        const rlmProfileInput = document.getElementById('cfg-rlm-profile');
        const rlmAdvancedInput = document.getElementById('cfg-rlm-advanced');
        const rlmQualityInput = document.getElementById('cfg-rlm-quality');
        const rlmIncludeSharedInput = document.getElementById('cfg-rlm-include-shared');
        const rlmMaxToolCallsInput = document.getElementById('cfg-rlm-max-tool-calls');
        const rlmMaxRecDepthInput = document.getElementById('cfg-rlm-max-recursion-depth');
        const rlmMaxChunksInput = document.getElementById('cfg-rlm-max-chunks');
        const rlmMaxRuntimeInput = document.getElementById('cfg-rlm-max-runtime-ms');
        const rlmMaxEvidenceInput = document.getElementById('cfg-rlm-max-evidence-hits');
        const llmNamingInput = document.getElementById('cfg-export-llm-naming');
        const budgets = getRlmBudgets() || {};

        if (tempInput) tempInput.value = getTemperature() || 0.7;
        if (topPInput) topPInput.value = getTopP() || 0.9;
        if (topKInput) topKInput.value = getTopK() || 40;
        if (numCtxInput) numCtxInput.value = getNumCtx() || 4096;
        if (repeatInput) repeatInput.value = getRepeatPenalty() || 1.1;
        if (systemInput) systemInput.value = getSystemPrompt() || '';
        if (rlmInput) rlmInput.checked = getRlmAssisted() === true;
        if (rlmVerboseInput) rlmVerboseInput.checked = getRlmVerboseTrace() === true;
        if (rlmProfileInput) rlmProfileInput.value = normalizeProfile(getRlmProfile());
        if (rlmAdvancedInput) rlmAdvancedInput.checked = getRlmAdvancedBudgets() === true;
        if (rlmQualityInput) rlmQualityInput.value = String(getRlmQuality() || 'balanced');
        if (rlmIncludeSharedInput) rlmIncludeSharedInput.checked = getRlmIncludeSharedAttachments() === true;
        if (rlmMaxToolCallsInput) rlmMaxToolCallsInput.value = Number(budgets.maxToolCalls || 40);
        if (rlmMaxRecDepthInput) rlmMaxRecDepthInput.value = Number(budgets.maxRecursionDepth || 3);
        if (rlmMaxChunksInput) rlmMaxChunksInput.value = Number(budgets.maxChunksProcessed || 48);
        if (rlmMaxRuntimeInput) rlmMaxRuntimeInput.value = Number(budgets.maxRuntimeMs || 45000);
        if (rlmMaxEvidenceInput) rlmMaxEvidenceInput.value = Number(budgets.maxEvidenceHits || 28);
        if (llmNamingInput) llmNamingInput.checked = getLlmAssistedFileNaming() === true;
        updateAdvancedBudgetVisibility();
        if (rlmAdvancedInput) {
          rlmAdvancedInput.onchange = () => {
            setRlmAdvancedBudgets(rlmAdvancedInput.checked === true);
            updateAdvancedBudgetVisibility();
          };
        }

        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    }

    window.addEventListener('resize', () => {
      const panel = document.getElementById('config-panel');
      if (!panel || panel.style.display === 'none') return;
      updateConfigPanelBounds();
    });

    function applyConfig() {
      const tempInput = document.getElementById('cfg-temperature');
      const topPInput = document.getElementById('cfg-top-p');
      const topKInput = document.getElementById('cfg-top-k');
      const numCtxInput = document.getElementById('cfg-num-ctx');
      const repeatInput = document.getElementById('cfg-repeat-penalty');
      const systemInput = document.getElementById('cfg-system-prompt');
      const rlmInput = document.getElementById('cfg-rlm-assisted');
      const rlmVerboseInput = document.getElementById('cfg-rlm-verbose');
      const rlmProfileInput = document.getElementById('cfg-rlm-profile');
      const rlmAdvancedInput = document.getElementById('cfg-rlm-advanced');
      const rlmQualityInput = document.getElementById('cfg-rlm-quality');
      const rlmIncludeSharedInput = document.getElementById('cfg-rlm-include-shared');
      const rlmMaxToolCallsInput = document.getElementById('cfg-rlm-max-tool-calls');
      const rlmMaxRecDepthInput = document.getElementById('cfg-rlm-max-recursion-depth');
      const rlmMaxChunksInput = document.getElementById('cfg-rlm-max-chunks');
      const rlmMaxRuntimeInput = document.getElementById('cfg-rlm-max-runtime-ms');
      const rlmMaxEvidenceInput = document.getElementById('cfg-rlm-max-evidence-hits');
      const llmNamingInput = document.getElementById('cfg-export-llm-naming');

      if (tempInput) setTemperatureValue(parseFloat(tempInput.value) || 0.7);
      if (topPInput) setTopP(parseFloat(topPInput.value) || null);
      if (topKInput) setTopK(parseInt(topKInput.value, 10) || null);
      if (numCtxInput) setNumCtx(parseInt(numCtxInput.value, 10) || null);
      if (repeatInput) setRepeatPenalty(parseFloat(repeatInput.value) || null);
      if (systemInput) setSystemPromptValue(systemInput.value || null);
      if (rlmInput) setRlmAssisted(rlmInput.checked === true);
      if (rlmVerboseInput) setRlmVerboseTrace(rlmVerboseInput.checked === true);
      if (rlmAdvancedInput) setRlmAdvancedBudgets(rlmAdvancedInput.checked === true);
      const selectedProfile = rlmProfileInput ? normalizeProfile(rlmProfileInput.value) : normalizeProfile(getRlmProfile());
      if (selectedProfile !== 'custom') {
        applyRlmProfile(selectedProfile, false);
      }
      if (rlmQualityInput) setRlmQuality(rlmQualityInput.value || 'balanced');
      if (rlmIncludeSharedInput) setRlmIncludeSharedAttachments(rlmIncludeSharedInput.checked === true);
      setRlmBudgets({
        maxToolCalls: rlmMaxToolCallsInput ? parseInt(rlmMaxToolCallsInput.value, 10) : undefined,
        maxRecursionDepth: rlmMaxRecDepthInput ? parseInt(rlmMaxRecDepthInput.value, 10) : undefined,
        maxChunksProcessed: rlmMaxChunksInput ? parseInt(rlmMaxChunksInput.value, 10) : undefined,
        maxRuntimeMs: rlmMaxRuntimeInput ? parseInt(rlmMaxRuntimeInput.value, 10) : undefined,
        maxEvidenceHits: rlmMaxEvidenceInput ? parseInt(rlmMaxEvidenceInput.value, 10) : undefined
      });
      if (selectedProfile === 'custom') {
        setRlmProfile('custom');
      }
      if (llmNamingInput) setLlmAssistedFileNaming(llmNamingInput.checked === true);
      persistTerminalModelConfig();

      const budgets = getRlmBudgets() || {};
      addSystemMessage(`⚙️ Configuration applied: temp=${getTemperature()}, top_p=${getTopP()}, top_k=${getTopK()}, ctx=${getNumCtx()}, rlm=${getRlmAssisted() ? 'on' : 'off'}, rlm_profile=${normalizeProfile(getRlmProfile())}, rlm_quality=${getRlmQuality()}, rlm_verbose=${getRlmVerboseTrace() ? 'on' : 'off'}, rlm_shared_attachments=${getRlmIncludeSharedAttachments() ? 'on' : 'off'}, rlm_advanced_budgets=${getRlmAdvancedBudgets() ? 'on' : 'off'}, llm_assisted_file_naming=${getLlmAssistedFileNaming() ? 'on' : 'off'}, rlm_budget={tools:${budgets.maxToolCalls},depth:${budgets.maxRecursionDepth},chunks:${budgets.maxChunksProcessed},runtime_ms:${budgets.maxRuntimeMs},evidence:${budgets.maxEvidenceHits}}`);
      toggleConfig();
    }

    function handleModelChange(event) {
      return modelHelpers?.handleModelChange?.(event);
    }

    async function listModels() {
      return modelHelpers?.listModels?.();
    }

    async function populateModelDropdown(port) {
      return modelHelpers?.populateModelDropdown?.(port);
    }

    function showHelp() {
      addSystemMessage('Available commands:');
      addSystemMessage('  /help - Show this help message');
      addSystemMessage('  /clear - Clear conversation history');
      addSystemMessage('  /models - List available Ollama models');
      addSystemMessage('  /system <prompt> - Set system prompt');
      addSystemMessage('  /temp <0.0-2.0> - Set temperature (default 0.7)');
      addSystemMessage('  /show - Show current settings');
      addSystemMessage('  /stop - Stop current generation');
      addSystemMessage('  /switch <model> - Switch to different model');
      addSystemMessage('  /save <n> - Save conversation');
      addSystemMessage('  /load <n> - Load conversation');
      addSystemMessage('  /port - Show current Ollama port');
      addSystemMessage('  /attach <file-path> - Attach local file to this terminal session');
      addSystemMessage('  /attachments - List attached files');
      addSystemMessage('  /detach <attachment-id> - Remove one attachment');
      addSystemMessage('  /clearattachments - Remove all attachments for this terminal');
      addSystemMessage('  /rlm [on|off|status|provider legacy|provider engine|profile fast|profile balanced|profile deep|profile industrial-safe|profile custom|verbose on|verbose off|quality fast|quality balanced|quality deep|shared on|shared off|budget <name> <value>] - RLM settings');
      addSystemMessage('  /voice [status|on|off|stt-on|stt-off|tts-on|tts-off] - Voice controls');
    }

    function setSystemPrompt(prompt) {
      if (prompt) {
        setSystemPromptValue(prompt);
        persistTerminalModelConfig();
        addSystemMessage(`✅ System prompt set: "${prompt}"`);
      } else {
        setSystemPromptValue(null);
        persistTerminalModelConfig();
        addSystemMessage('✅ System prompt cleared');
      }
    }

    function setTemperature(tempStr) {
      const temp = parseFloat(tempStr);
      if (!isNaN(temp) && temp >= 0 && temp <= 2) {
        setTemperatureValue(temp);
        persistTerminalModelConfig();
        addSystemMessage(`✅ Temperature set to ${temp}`);
      } else {
        addErrorMessage('Temperature must be between 0.0 and 2.0');
      }
    }

    function showSettings() {
      const cfg = getConfig() || {};
      const current = getCurrentModel();
      const sys = getSystemPrompt();
      addSystemMessage('Current settings:');
      addSystemMessage(`  Model: ${current}`);
      addSystemMessage(`  Port: ${getTerminalPort()}`);
      addSystemMessage(`  Temperature: ${getTemperature()}`);
      if (getTopP() !== null) addSystemMessage(`  Top-P: ${getTopP()}`);
      if (getTopK() !== null) addSystemMessage(`  Top-K: ${getTopK()}`);
      if (getNumCtx() !== null) addSystemMessage(`  Context Length: ${getNumCtx()}`);
      if (getNumPredict() !== null) addSystemMessage(`  Max Tokens: ${getNumPredict()}`);
      if (getRepeatPenalty() !== null) addSystemMessage(`  Repeat Penalty: ${getRepeatPenalty()}`);
      if (getSeed() !== null) addSystemMessage(`  Seed: ${getSeed()}`);
      if (getStopSequences() !== null) addSystemMessage(`  Stop Sequences: ${JSON.stringify(getStopSequences())}`);
      addSystemMessage(`  System prompt: ${sys ? sys.substring(0, 50) + (sys.length > 50 ? '...' : '') : '(none)'}`);
      addSystemMessage(`  RLM Assisted: ${getRlmAssisted() ? 'ON' : 'OFF'}`);
      addSystemMessage(`  RLM Provider: ${String(getRlmProvider() || 'legacy')}`);
      addSystemMessage(`  RLM Profile: ${normalizeProfile(getRlmProfile())}`);
      addSystemMessage(`  RLM Quality: ${String(getRlmQuality() || 'balanced')}`);
      addSystemMessage(`  RLM Verbose Trace: ${getRlmVerboseTrace() ? 'ON' : 'OFF'}`);
      addSystemMessage(`  RLM Include Shared Attachments: ${getRlmIncludeSharedAttachments() ? 'ON' : 'OFF'}`);
      addSystemMessage(`  RLM Advanced Budgets: ${getRlmAdvancedBudgets() ? 'ON' : 'OFF'}`);
      const budgets = getRlmBudgets() || {};
      addSystemMessage(`  RLM Budget max_tool_calls: ${budgets.maxToolCalls}`);
      addSystemMessage(`  RLM Budget max_recursion_depth: ${budgets.maxRecursionDepth}`);
      addSystemMessage(`  RLM Budget max_chunks_processed: ${budgets.maxChunksProcessed}`);
      addSystemMessage(`  RLM Budget max_runtime_ms: ${budgets.maxRuntimeMs}`);
      addSystemMessage(`  RLM Budget max_evidence_hits: ${budgets.maxEvidenceHits}`);
      addSystemMessage(`  LLM-assisted file naming: ${getLlmAssistedFileNaming() ? 'ON' : 'OFF'}`);
      addSystemMessage(`  Messages in history: ${getConversationHistoryLength()}`);
      addSystemMessage(`  GPU Type: ${cfg.gpuType}`);
    }

    function switchModel(modelName) {
      return modelHelpers?.switchModel?.(modelName);
    }

    async function handleCommand(command) {
      const parts = command.trim().split(' ');
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');
      recordSessionMemory({
        role: 'user',
        channel: 'command',
        content: command
      });

      switch (cmd) {
        case '/help':
          showHelp();
          break;
        case '/clear':
          clearConversation();
          break;
        case '/models':
          await listModels();
          break;
        case '/system':
          setSystemPrompt(args);
          break;
        case '/temp':
          setTemperature(args);
          break;
        case '/show':
          showSettings();
          break;
        case '/stop':
          await handleStopClick();
          break;
        case '/switch':
          switchModel(args);
          break;
        case '/save':
          saveConversation(args);
          break;
        case '/load':
          await loadConversation(args);
          break;
        case '/port':
          addSystemMessage(`Connected to Ollama on port ${getTerminalPort()}`);
          break;
        case '/attach':
          await attachFile(args);
          break;
        case '/attachments':
          await listAttachments();
          break;
        case '/detach':
          await detachAttachment(args);
          break;
        case '/clearattachments':
          await clearAttachments();
          break;
        case '/rlm': {
          const mode = String(args || '').trim().toLowerCase();
          if (rlmHelpers && typeof rlmHelpers.handleRlmCommand === 'function') {
            rlmHelpers.handleRlmCommand(mode);
          } else {
            addErrorMessage('RLM helpers unavailable in this build.');
          }
          break;
        }
        case '/voice':
          if (voiceHelpers && typeof voiceHelpers.handleVoiceCommand === 'function') await voiceHelpers.handleVoiceCommand(args);
          else addErrorMessage('Voice command helpers unavailable in this build.');
          break;
        default:
          addErrorMessage(`Unknown command: ${command}`);
          addSystemMessage('Type /help for available commands');
      }
    }

    return {
      handleModelChange,
      toggleConfig,
      applyConfig,
      listModels,
      populateModelDropdown,
      handleCommand,
      showHelp,
      setSystemPrompt,
      setTemperature,
      showSettings,
      switchModel
    };
  }

  window.TerminalCommands = {
    createCommandController
  };
})();
