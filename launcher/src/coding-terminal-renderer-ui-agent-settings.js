/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer UI Agent Settings
 */

(function() {
  'use strict';

  function buildNumberField(id, label) {
    return `
      <label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--ct-text-secondary);">
        <span>${label}</span>
        <input id="${id}" type="number" style="background:var(--ct-bg-tertiary); color:var(--ct-text-primary); border:1px solid var(--ct-border); border-radius:6px; padding:6px;" />
      </label>
    `;
  }

  function createAgentSettingsUi(ctx) {
    const { api } = ctx;

    function openAgentSettingsModal() {
      const overlay = document.createElement('div');
      overlay.className = 'ct-modal';
      overlay.innerHTML = `
      <div class="ct-modal-card" style="max-width: 980px; width: min(96vw, 980px);">
        <div class="ct-modal-header">
          <h3>Agent Settings</h3>
          <button class="ct-btn ct-btn-tiny" id="ct-agent-settings-close">Close</button>
        </div>
        <div class="ct-modal-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <section style="border:1px solid var(--ct-border); border-radius:8px; padding:10px; background:var(--ct-bg-secondary);">
              <h4 style="margin:0 0 8px 0; color:var(--ct-accent);">Coder Agent</h4>
              <label style="display:block; font-size:12px; color:var(--ct-text-secondary); margin-bottom:4px;">System Prompt</label>
              <textarea id="ct-agent-coder-system-prompt" rows="7" style="width:100%; background:var(--ct-bg-tertiary); color:var(--ct-text-primary); border:1px solid var(--ct-border); border-radius:6px; padding:8px;"></textarea>
              <div style="display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:8px; margin-top:10px;">
                ${buildNumberField('ct-agent-coder-temperature', 'Temperature')}
                ${buildNumberField('ct-agent-coder-top-p', 'Top P')}
                ${buildNumberField('ct-agent-coder-top-k', 'Top K')}
                ${buildNumberField('ct-agent-coder-repeat-penalty', 'Repeat Penalty')}
                ${buildNumberField('ct-agent-coder-num-predict', 'Num Predict')}
                ${buildNumberField('ct-agent-coder-num-ctx', 'Num Ctx')}
                ${buildNumberField('ct-agent-coder-seed', 'Seed')}
              </div>
            </section>
            <section style="border:1px solid var(--ct-border); border-radius:8px; padding:10px; background:var(--ct-bg-secondary);">
              <h4 style="margin:0 0 8px 0; color:var(--ct-accent);">Router Agent</h4>
              <label style="display:block; font-size:12px; color:var(--ct-text-secondary); margin-bottom:4px;">System Prompt</label>
              <textarea id="ct-agent-router-system-prompt" rows="7" style="width:100%; background:var(--ct-bg-tertiary); color:var(--ct-text-primary); border:1px solid var(--ct-border); border-radius:6px; padding:8px;"></textarea>
              <div style="display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:8px; margin-top:10px;">
                ${buildNumberField('ct-agent-router-temperature', 'Temperature')}
                ${buildNumberField('ct-agent-router-top-p', 'Top P')}
                ${buildNumberField('ct-agent-router-top-k', 'Top K')}
                ${buildNumberField('ct-agent-router-repeat-penalty', 'Repeat Penalty')}
                ${buildNumberField('ct-agent-router-num-predict', 'Num Predict')}
                ${buildNumberField('ct-agent-router-num-ctx', 'Num Ctx')}
                ${buildNumberField('ct-agent-router-seed', 'Seed')}
              </div>
            </section>
          </div>
          <section style="margin-top:12px; border:1px solid var(--ct-border); border-radius:8px; padding:10px; background:var(--ct-bg-secondary);">
            <h4 style="margin:0 0 8px 0; color:var(--ct-accent);">Rewrite Profile</h4>
            <div style="display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:8px;">
              ${buildNumberField('ct-agent-rewrite-temperature', 'Temperature')}
              ${buildNumberField('ct-agent-rewrite-top-p', 'Top P')}
              ${buildNumberField('ct-agent-rewrite-top-k', 'Top K')}
              ${buildNumberField('ct-agent-rewrite-repeat-penalty', 'Repeat Penalty')}
              ${buildNumberField('ct-agent-rewrite-num-predict', 'Num Predict')}
            </div>
          </section>
          <section style="margin-top:12px; border:1px solid var(--ct-border); border-radius:8px; padding:10px; background:var(--ct-bg-secondary);">
            <h4 style="margin:0 0 8px 0; color:var(--ct-accent);">Timeouts</h4>
            <div style="display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px;">
              ${buildNumberField('ct-agent-router-timeout-ms', 'Router Timeout (ms)')}
              ${buildNumberField('ct-agent-dispatcher-timeout-ms', 'Dispatcher Timeout (ms)')}
              ${buildNumberField('ct-agent-first-response-timeout-ms', 'First Response Timeout (ms)')}
              ${buildNumberField('ct-agent-response-timeout-ms', 'Response Timeout (ms)')}
            </div>
          </section>
          <div style="margin-top:12px; display:flex; gap:8px; justify-content:flex-end;">
            <button class="ct-btn ct-btn-small" id="ct-agent-settings-reset">Reset Defaults</button>
            <button class="ct-btn ct-btn-primary" id="ct-agent-settings-save">Save</button>
          </div>
          <div id="ct-agent-settings-status" style="margin-top:8px; font-size:12px; color:var(--ct-text-secondary);"></div>
        </div>
      </div>
      `;
      document.body.appendChild(overlay);

      const close = () => overlay.remove();
      overlay.querySelector('#ct-agent-settings-close')?.addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      const defaults = {
        coderTemperature: 0.2,
        coderTopP: 0.9,
        coderTopK: 40,
        coderRepeatPenalty: 1.1,
        coderNumPredict: 4096,
        coderNumCtx: 8192,
        coderSeed: null,
        routerTemperature: 0.0,
        routerTopP: 0.9,
        routerTopK: 40,
        routerRepeatPenalty: 1.1,
        routerNumPredict: 256,
        routerNumCtx: 4096,
        routerSeed: null,
        rewriteTemperature: 0.1,
        rewriteTopP: 0.85,
        rewriteTopK: 40,
        rewriteRepeatPenalty: 1.1,
        rewriteNumPredict: 4096,
        routerTimeoutMs: 8000,
        dispatcherTimeoutMs: 8000,
        firstResponseTimeoutMs: 120000,
        responseTimeoutMs: 45000,
        coderSystemPrompt: '',
        routerSystemPrompt: ''
      };

      const map = {
        coderSystemPrompt: 'ct-agent-coder-system-prompt',
        routerSystemPrompt: 'ct-agent-router-system-prompt',
        coderTemperature: 'ct-agent-coder-temperature',
        coderTopP: 'ct-agent-coder-top-p',
        coderTopK: 'ct-agent-coder-top-k',
        coderRepeatPenalty: 'ct-agent-coder-repeat-penalty',
        coderNumPredict: 'ct-agent-coder-num-predict',
        coderNumCtx: 'ct-agent-coder-num-ctx',
        coderSeed: 'ct-agent-coder-seed',
        routerTemperature: 'ct-agent-router-temperature',
        routerTopP: 'ct-agent-router-top-p',
        routerTopK: 'ct-agent-router-top-k',
        routerRepeatPenalty: 'ct-agent-router-repeat-penalty',
        routerNumPredict: 'ct-agent-router-num-predict',
        routerNumCtx: 'ct-agent-router-num-ctx',
        routerSeed: 'ct-agent-router-seed',
        rewriteTemperature: 'ct-agent-rewrite-temperature',
        rewriteTopP: 'ct-agent-rewrite-top-p',
        rewriteTopK: 'ct-agent-rewrite-top-k',
        rewriteRepeatPenalty: 'ct-agent-rewrite-repeat-penalty',
        rewriteNumPredict: 'ct-agent-rewrite-num-predict',
        routerTimeoutMs: 'ct-agent-router-timeout-ms',
        dispatcherTimeoutMs: 'ct-agent-dispatcher-timeout-ms',
        firstResponseTimeoutMs: 'ct-agent-first-response-timeout-ms',
        responseTimeoutMs: 'ct-agent-response-timeout-ms'
      };

      const setValue = (id, value) => {
        const el = overlay.querySelector(`#${id}`);
        if (!el) return;
        el.value = value === null || value === undefined ? '' : String(value);
      };
      const readValue = (id) => String(overlay.querySelector(`#${id}`)?.value || '').trim();
      const readNumber = (id, fallback = null) => {
        const raw = readValue(id);
        if (!raw) return fallback;
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
      };

      const statusEl = overlay.querySelector('#ct-agent-settings-status');
      const setStatus = (text, color = 'var(--ct-text-secondary)') => {
        if (!statusEl) return;
        statusEl.style.color = color;
        statusEl.textContent = String(text || '');
      };

      const loadFromConfig = async () => {
        try {
          const cfg = await window.electronAPI?.getCodingConfig?.();
          const source = { ...defaults, ...(cfg || {}) };
          Object.entries(map).forEach(([key, id]) => setValue(id, source[key]));
          setStatus('Loaded current settings.');
        } catch (err) {
          setStatus(`Load failed: ${err?.message || err}`, 'var(--ct-error)');
        }
      };

      const saveToConfig = async () => {
        const updates = {
          coderSystemPrompt: readValue(map.coderSystemPrompt),
          routerSystemPrompt: readValue(map.routerSystemPrompt),
          coderTemperature: readNumber(map.coderTemperature, defaults.coderTemperature),
          coderTopP: readNumber(map.coderTopP, defaults.coderTopP),
          coderTopK: readNumber(map.coderTopK, defaults.coderTopK),
          coderRepeatPenalty: readNumber(map.coderRepeatPenalty, defaults.coderRepeatPenalty),
          coderNumPredict: readNumber(map.coderNumPredict, defaults.coderNumPredict),
          coderNumCtx: readNumber(map.coderNumCtx, defaults.coderNumCtx),
          coderSeed: readNumber(map.coderSeed, null),
          routerTemperature: readNumber(map.routerTemperature, defaults.routerTemperature),
          routerTopP: readNumber(map.routerTopP, defaults.routerTopP),
          routerTopK: readNumber(map.routerTopK, defaults.routerTopK),
          routerRepeatPenalty: readNumber(map.routerRepeatPenalty, defaults.routerRepeatPenalty),
          routerNumPredict: readNumber(map.routerNumPredict, defaults.routerNumPredict),
          routerNumCtx: readNumber(map.routerNumCtx, defaults.routerNumCtx),
          routerSeed: readNumber(map.routerSeed, null),
          rewriteTemperature: readNumber(map.rewriteTemperature, defaults.rewriteTemperature),
          rewriteTopP: readNumber(map.rewriteTopP, defaults.rewriteTopP),
          rewriteTopK: readNumber(map.rewriteTopK, defaults.rewriteTopK),
          rewriteRepeatPenalty: readNumber(map.rewriteRepeatPenalty, defaults.rewriteRepeatPenalty),
          rewriteNumPredict: readNumber(map.rewriteNumPredict, defaults.rewriteNumPredict),
          routerTimeoutMs: readNumber(map.routerTimeoutMs, defaults.routerTimeoutMs),
          dispatcherTimeoutMs: readNumber(map.dispatcherTimeoutMs, defaults.dispatcherTimeoutMs),
          firstResponseTimeoutMs: readNumber(map.firstResponseTimeoutMs, defaults.firstResponseTimeoutMs),
          responseTimeoutMs: readNumber(map.responseTimeoutMs, defaults.responseTimeoutMs)
        };
        try {
          await window.electronAPI?.updateCodingConfig?.(updates);
          api.addSystemMessage?.('Agent settings saved. New values apply on next turn.');
          setStatus('Saved.', 'var(--ct-success)');
        } catch (err) {
          setStatus(`Save failed: ${err?.message || err}`, 'var(--ct-error)');
        }
      };

      overlay.querySelector('#ct-agent-settings-save')?.addEventListener('click', saveToConfig);
      overlay.querySelector('#ct-agent-settings-reset')?.addEventListener('click', async () => {
        Object.entries(defaults).forEach(([key, value]) => {
          const id = map[key];
          if (id) setValue(id, value);
        });
        await saveToConfig();
      });

      loadFromConfig();
    }

    return { openAgentSettingsModal };
  }

  window.CodingTerminalRendererUiAgentSettings = {
    createAgentSettingsUi
  };
})();
