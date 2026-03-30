/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createBinariesController(deps = {}) {
    const closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : (() => {});

    async function checkCompiledBinaries() {
      const statusContainer = document.getElementById('compiled-binaries-status');
      if (!statusContainer) return;

      try {
        console.log('[Compile Project] Checking compiled binary status...');
        if (!window.electronAPI || !window.electronAPI.getCompiledBinaryStatus) {
          statusContainer.innerHTML = '<span style="color: #ff6b6b;">API not available (restart Core-CE)</span>';
          return;
        }

        const result = await window.electronAPI.getCompiledBinaryStatus();
        console.log('[Compile Project] Binary status result:', result);
        if (!result || !result.success) {
          statusContainer.innerHTML = '<span style="color: #888;">Unable to check binary status</span>';
          return;
        }

        const { webui, anythingllm } = result;
        let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';

        if (webui.exists) {
          const modeLabel = webui.mode === 'standalone' ? ' (standalone)' : ' (onefile)';
          html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0,255,136,0.1); border-radius: 5px; border: 1px solid rgba(0,255,136,0.3);">
              <span style="color: #00ff88;">✓ Open WebUI: ${webui.sizeMB} MB${modeLabel}</span>
              <button onclick="deleteCompiledBinary('webui')" class="btn-danger" style="padding: 5px 10px; font-size: 12px;">Delete</button>
            </div>
          `;
        } else {
          html += `
            <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 5px;">
              <span style="color: #888;">○ Open WebUI: Not compiled (will compile on next build)</span>
            </div>
          `;
        }

        if (anythingllm.exists) {
          html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0,255,136,0.1); border-radius: 5px; border: 1px solid rgba(0,255,136,0.3);">
              <span style="color: #00ff88;">✓ AnythingLLM: ${anythingllm.sizeMB} MB</span>
              <button onclick="deleteCompiledBinary('anythingllm')" class="btn-danger" style="padding: 5px 10px; font-size: 12px;">Delete</button>
            </div>
          `;
        } else {
          html += `
            <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 5px;">
              <span style="color: #888;">○ AnythingLLM: Not compiled (will compile on next build)</span>
            </div>
          `;
        }

        if (webui.venvCpuExists) {
          html += `
            <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 5px; margin-top: 5px;">
              <span style="color: #888; font-size: 12px;">ℹ CPU-only venv exists (used for compilation)</span>
            </div>
          `;
        }

        html += '</div>';
        statusContainer.innerHTML = html;
      } catch (err) {
        statusContainer.innerHTML = `<span style="color: #ff6b6b;">Error: ${err.message}</span>`;
      }
    }

    async function deleteCompiledBinary(binaryType) {
      const typeNames = { webui: 'Open WebUI', anythingllm: 'AnythingLLM' };
      const typeName = typeNames[binaryType] || binaryType;
      const modalHtml = `
        <div id="delete-binary-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;">
          <div style="background: #1a1a2e; padding: 30px; border-radius: 15px; border: 2px solid #ff6b6b; max-width: 500px; width: 90%;">
            <h3 style="color: #ff6b6b; margin-top: 0;">⚠️ Delete Compiled Binary</h3>
            <p style="color: #fff; margin-bottom: 15px;">You are about to delete the compiled <strong>${typeName}</strong> binary.</p>
            <div style="background: rgba(255,107,107,0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <p style="color: #ff6b6b; margin: 0 0 10px 0; font-weight: bold;">⚠️ Warning:</p>
              <ul style="color: #ccc; margin: 0; padding-left: 20px;">
                <li>The next "Compile Product" will trigger a full recompilation</li>
                <li>Open WebUI compilation takes <strong>1-4 hours</strong></li>
                <li>The CPU-only venv will be preserved (faster rebuild)</li>
              </ul>
            </div>
            <p style="color: #888; font-size: 13px; margin-bottom: 20px;">This is useful when compilation settings have changed and you need a fresh binary.</p>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button class="btn-secondary" onclick="closeModal('delete-binary-modal')">Cancel</button>
              <button class="btn-danger" onclick="confirmDeleteBinary('${binaryType}')" style="background: rgba(255,107,107,0.3); border-color: #ff6b6b; color: #ff6b6b;">Delete Binary</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function confirmDeleteBinary(binaryType) {
      closeModal('delete-binary-modal');
      try {
        const result = await window.electronAPI.deleteCompiledBinary(binaryType);
        if (result.success) {
          await checkCompiledBinaries();
          const statusDiv = document.getElementById('compiled-binaries-status');
          if (statusDiv) {
            const successMsg = document.createElement('div');
            successMsg.style.cssText = 'color: #00ff88; padding: 10px; margin-top: 10px; background: rgba(0,255,136,0.1); border-radius: 5px;';
            successMsg.textContent = `✓ ${result.message}`;
            statusDiv.appendChild(successMsg);
            setTimeout(() => successMsg.remove(), 5000);
          }
        } else {
          alert('Error deleting binary: ' + result.message);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    return { checkCompiledBinaries, deleteCompiledBinary, confirmDeleteBinary };
  }

  window.CompileProjectBinaries = {
    createBinariesController
  };
})();
