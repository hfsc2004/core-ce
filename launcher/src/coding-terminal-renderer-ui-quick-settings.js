/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer UI Quick Settings
 */

(function() {
  'use strict';

  function createQuickSettingsUi(ctx) {
    const { state, elements, api, openAgentSettingsModal } = ctx;

    function openQuickSettingsModal() {
      const existing = document.getElementById('ct-settings-drawer-wrap');
      if (existing) {
        closeDrawer(existing);
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'ct-settings-drawer-wrap';
      overlay.id = 'ct-settings-drawer-wrap';
      overlay.innerHTML = `
      <button class="ct-settings-drawer-backdrop" id="ct-settings-backdrop" aria-label="Close settings"></button>
      <aside class="ct-settings-drawer" role="dialog" aria-modal="true" aria-label="Quick Settings">
        <div class="ct-modal-header">
          <h3>Quick Settings</h3>
          <button class="ct-btn ct-btn-tiny" id="ct-settings-close">Close</button>
        </div>
        <div class="ct-modal-body">
          <div class="ct-settings-list">
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-backend"></button><span class="ct-settings-item">Backend</span><span class="ct-settings-desc">Inference backend for coder model execution. (Recommended llama.cpp)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-router"></button><span class="ct-settings-item">Router</span><span class="ct-settings-desc">Translates user prompts/queries into coder contracts before dispatch. (Recommended On)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-router-gpu"></button><span class="ct-settings-item">Router GPU</span><span class="ct-settings-desc">Runs llama.cpp router on GPU when enabled, otherwise CPU-only. (Recommended On)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rag"></button><span class="ct-settings-item">RAG</span><span class="ct-settings-desc">Retrieves indexed project context for prompts when relevant. (Recommended On)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-router-debug"></button><span class="ct-settings-item">Router Debug</span><span class="ct-settings-desc">Shows router parse and rewrite traces in chat. (Recommended Off)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-thinking"></button><span class="ct-settings-item">Thinking</span><span class="ct-settings-desc">Shows model reasoning tokens when available. (Recommended On)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-autoscroll"></button><span class="ct-settings-item">Auto-scroll</span><span class="ct-settings-desc">Keeps chat pinned to newest output while streaming. (Recommended Off)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rag-debug"></button><span class="ct-settings-item">RAG Debug</span><span class="ct-settings-desc">Logs retrieval internals for troubleshooting. (Recommended Off)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-deterministic"></button><span class="ct-settings-item">Deterministic</span><span class="ct-settings-desc">Enables deterministic inspect shortcuts and exact replacement-apply for explicit replace prompts. (Recommended Off)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-cli-agent"></button><span class="ct-settings-item">CLI Agent</span><span class="ct-settings-desc">Allow model turns to emit CLI_TOOL_JSON actions that run deterministic tools. (Recommended Off)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-cli-policy"></button><span class="ct-settings-item">CLI Policy</span><span class="ct-settings-desc">Execution policy for CLI Agent actions. (workspace-write or read-only)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-cli-budget"></button><span class="ct-settings-item">CLI Step Budget</span><span class="ct-settings-desc">Max CLI tool actions per turn before cut-off. (1-8)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-test-mode"></button><span class="ct-settings-item">Test Mode</span><span class="ct-settings-desc">Disables routing shortcuts to isolate pipeline behavior. (Recommended Off)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rlm"></button><span class="ct-settings-item">RLM Assisted</span><span class="ct-settings-desc">Use shared deterministic planner/tools for attachment/document intents. (Recommended On)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rlm-profile"></button><span class="ct-settings-item">RLM Profile</span><span class="ct-settings-desc">Preset behavior for speed/coverage/safety. (Fast, Balanced, Deep, Industrial Safe)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rlm-shared"></button><span class="ct-settings-item">RLM Shared Attachments</span><span class="ct-settings-desc">Also include shared cross-terminal attachment pool for RLM read/search/summarize. (Recommended Off)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rlm-advanced"></button><span class="ct-settings-item">RLM Advanced Budgets</span><span class="ct-settings-desc">Show/hide raw budget controls for power users.</span></div>
            <div class="ct-settings-row ct-settings-rlm-adv"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rlm-budget-tools"></button><span class="ct-settings-item">RLM Max Tool Calls</span><span class="ct-settings-desc">Hard cap for deterministic+planner tool invocations per turn.</span></div>
            <div class="ct-settings-row ct-settings-rlm-adv"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rlm-budget-depth"></button><span class="ct-settings-item">RLM Max Recursion Depth</span><span class="ct-settings-desc">Hard cap for recursive map-reduce depth.</span></div>
            <div class="ct-settings-row ct-settings-rlm-adv"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rlm-budget-chunks"></button><span class="ct-settings-item">RLM Max Chunks</span><span class="ct-settings-desc">Hard cap for chunks processed per turn.</span></div>
            <div class="ct-settings-row ct-settings-rlm-adv"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rlm-budget-runtime"></button><span class="ct-settings-item">RLM Max Runtime (ms)</span><span class="ct-settings-desc">Per-turn budget; long passes stop when this limit is reached.</span></div>
            <div class="ct-settings-row ct-settings-rlm-adv"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-rlm-budget-evidence"></button><span class="ct-settings-item">RLM Max Evidence Hits</span><span class="ct-settings-desc">Caps evidence lines gathered from deterministic search.</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-diff-legend"></button><span class="ct-settings-item">Diff Legend</span><span class="ct-settings-desc">Shows explanations for diff symbols in patch views. (Recommended Off)</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-diff-display"></button><span class="ct-settings-item">Diff Display</span><span class="ct-settings-desc">Controls how patch output is shown in chat.</span></div>
            <div class="ct-settings-row"><button class="ct-btn ct-btn-small ct-settings-state-btn" id="ct-settings-agent-config">Open</button><span class="ct-settings-item">Agent Settings</span><span class="ct-settings-desc">Edit system prompts and model parameters for coder/router agents.</span></div>
            <div class="ct-settings-row ct-settings-subrow"><span></span><span class="ct-settings-item">Raw</span><span class="ct-settings-desc">Shows full patch exactly as returned or synthesized.</span></div>
            <div class="ct-settings-row ct-settings-subrow"><span></span><span class="ct-settings-item">Simplified</span><span class="ct-settings-desc">Hides patch syntax and shows a plain changed-lines summary.</span></div>
            <div class="ct-settings-row ct-settings-subrow"><span></span><span class="ct-settings-item">Hidden</span><span class="ct-settings-desc">Hides patch body and shows a short status line instead.</span></div>
          </div>
          <p class="ct-settings-mode-row">Mode: <strong>${state.chatMode}</strong> - forces dispatch intent (auto, inspect, or generate).</p>
        </div>
      </aside>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('open'));
      document.body.classList.add('ct-settings-drawer-open');

      const close = () => closeDrawer(overlay);
      const setBtn = (id, value) => { const el = overlay.querySelector(`#${id}`); if (el) el.textContent = value; };
      const refreshStates = () => {
        setBtn('ct-settings-backend', state.inferenceBackend === 'llama-cpp' ? 'llama.cpp' : 'ollama');
        setBtn('ct-settings-router', state.routerMode === 'on' ? 'On' : 'Off');
        setBtn('ct-settings-router-gpu', state.routerUseGpu ? 'On' : 'Off');
        setBtn('ct-settings-rag', state.ragEnabled ? 'On' : 'Off');
        const routerDebugVisible = !!elements.routerDebugPanel && !elements.routerDebugPanel.classList.contains('hidden');
        setBtn('ct-settings-router-debug', routerDebugVisible ? 'On' : 'Off');
        setBtn('ct-settings-thinking', state.showThinking ? 'On' : 'Off');
        setBtn('ct-settings-autoscroll', state.autoScroll ? 'On' : 'Off');
        setBtn('ct-settings-rag-debug', state.ragDebug ? 'On' : 'Off');
        setBtn('ct-settings-deterministic', state.deterministicFileRead ? 'On' : 'Off');
        setBtn('ct-settings-cli-agent', state.cliAgentEnabled ? 'On' : 'Off');
        setBtn('ct-settings-cli-policy', String(state.cliAgentPolicy || 'workspace-write'));
        setBtn('ct-settings-cli-budget', String(Number(state.cliAgentStepBudget || 2)));
        setBtn('ct-settings-test-mode', state.testMode ? 'On' : 'Off');
        setBtn('ct-settings-rlm', state.rlmAssisted ? 'On' : 'Off');
        setBtn('ct-settings-rlm-profile', String(state.rlmProfile || 'balanced'));
        setBtn('ct-settings-rlm-shared', state.rlmIncludeSharedAttachments ? 'On' : 'Off');
        setBtn('ct-settings-rlm-advanced', state.rlmAdvancedBudgets ? 'On' : 'Off');
        setBtn('ct-settings-rlm-budget-tools', String(Number(state?.rlmBudgets?.maxToolCalls || 40)));
        setBtn('ct-settings-rlm-budget-depth', String(Number(state?.rlmBudgets?.maxRecursionDepth || 3)));
        setBtn('ct-settings-rlm-budget-chunks', String(Number(state?.rlmBudgets?.maxChunksProcessed || 48)));
        setBtn('ct-settings-rlm-budget-runtime', String(Number(state?.rlmBudgets?.maxRuntimeMs || 45000)));
        setBtn('ct-settings-rlm-budget-evidence', String(Number(state?.rlmBudgets?.maxEvidenceHits || 28)));
        setBtn('ct-settings-diff-legend', state.diffLegendEnabled ? 'On' : 'Off');
        setBtn('ct-settings-diff-display', api.toTitleCaseDiffMode(state.diffDisplayMode));
        overlay.querySelectorAll('.ct-settings-rlm-adv').forEach((row) => { row.style.display = state.rlmAdvancedBudgets ? '' : 'none'; });
      };

      const bind = (id, fn) => overlay.querySelector(`#${id}`)?.addEventListener('click', fn);
      bind('ct-settings-close', close);
      bind('ct-settings-backdrop', close);

      bind('ct-settings-backend', async () => { await api.handleInferenceBackendCycle(); refreshStates(); });
      bind('ct-settings-router', async () => { await api.handleRouterToggle(); refreshStates(); });
      bind('ct-settings-router-gpu', async () => { await api.handleRouterGpuToggle(); refreshStates(); });
      bind('ct-settings-rag', async () => { await api.handleRagToggle(); refreshStates(); });
      bind('ct-settings-router-debug', () => { api.handleRouterDebugToggle(); refreshStates(); });
      bind('ct-settings-thinking', () => { api.handleThinkingToggle(); refreshStates(); });
      bind('ct-settings-autoscroll', () => { api.handleAutoScrollToggle(); refreshStates(); });
      bind('ct-settings-rag-debug', async () => { await api.handleRagDebugToggle(); refreshStates(); });
      bind('ct-settings-deterministic', async () => { await api.handleDeterministicToggle(); refreshStates(); });
      bind('ct-settings-cli-agent', async () => { await api.handleCliAgentToggle(); refreshStates(); });
      bind('ct-settings-cli-policy', async () => { await api.handleCliAgentPolicyCycle(); refreshStates(); });
      bind('ct-settings-cli-budget', async () => { await api.handleCliAgentStepBudgetCycle(); refreshStates(); });
      bind('ct-settings-test-mode', async () => { await api.handleTestModeToggle(); refreshStates(); });
      bind('ct-settings-rlm', () => { api.handleRlmToggle(); refreshStates(); });
      bind('ct-settings-rlm-profile', () => { api.handleRlmProfileCycle(); refreshStates(); });
      bind('ct-settings-rlm-shared', () => { api.handleRlmSharedAttachmentsToggle(); refreshStates(); });
      bind('ct-settings-rlm-advanced', () => { api.handleRlmAdvancedBudgetsToggle(); refreshStates(); });
      bind('ct-settings-rlm-budget-tools', async () => { await api.handleRlmBudgetEdit('maxToolCalls'); refreshStates(); });
      bind('ct-settings-rlm-budget-depth', async () => { await api.handleRlmBudgetEdit('maxRecursionDepth'); refreshStates(); });
      bind('ct-settings-rlm-budget-chunks', async () => { await api.handleRlmBudgetEdit('maxChunksProcessed'); refreshStates(); });
      bind('ct-settings-rlm-budget-runtime', async () => { await api.handleRlmBudgetEdit('maxRuntimeMs'); refreshStates(); });
      bind('ct-settings-rlm-budget-evidence', async () => { await api.handleRlmBudgetEdit('maxEvidenceHits'); refreshStates(); });
      bind('ct-settings-diff-legend', async () => { await api.handleDiffLegendToggle(); refreshStates(); });
      bind('ct-settings-diff-display', async () => { await api.handleDiffDisplayModeCycle(); refreshStates(); });
      bind('ct-settings-agent-config', () => { openAgentSettingsModal(); });

      refreshStates();
    }

    function closeDrawer(overlay) {
      if (!overlay) return;
      overlay.classList.remove('open');
      document.body.classList.remove('ct-settings-drawer-open');
      window.setTimeout(() => {
        if (overlay.isConnected) overlay.remove();
      }, 200);
    }

    return { openQuickSettingsModal };
  }

  window.CodingTerminalRendererUiQuickSettings = {
    createQuickSettingsUi
  };
})();
