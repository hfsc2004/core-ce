/**
 * Settings Modal - HTML/template generators
 * Extracted from settings-modal.js to reduce monolith size.
 *
 * @version 1.1.2 - March 5, 2026
 */

function getSettingsModalHTML(settings) {
  const hasToken = settings.huggingface_token && settings.huggingface_token.length > 0;
  const apiKeys = (settings && typeof settings.api_keys === 'object' && settings.api_keys)
    ? settings.api_keys
    : {};
  const openAiCompat = (apiKeys && typeof apiKeys.openai_compatible === 'object' && apiKeys.openai_compatible)
    ? apiKeys.openai_compatible
    : {};
  const vllm = (apiKeys && typeof apiKeys.vllm === 'object' && apiKeys.vllm)
    ? apiKeys.vllm
    : {};
  const exllamav2 = (apiKeys && typeof apiKeys.exllamav2 === 'object' && apiKeys.exllamav2)
    ? apiKeys.exllamav2
    : {};
  
  return `
    <div id="settings-modal-overlay" class="settings-modal-overlay" onclick="SettingsModal.close(event)">
      <div id="settings-modal" class="settings-modal" onclick="event.stopPropagation()">
        <div id="settings-modal-header" class="settings-modal-header">
          <h2>Settings</h2>
          <button class="settings-modal-close" onclick="SettingsModal.close()">&times;</button>
        </div>
        
        <!-- Tab Navigation -->
        <div class="settings-tabs">
          <button class="settings-tab active" data-tab="huggingface" onclick="SettingsModal.switchTab('huggingface')">
            <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-3px; margin-right:8px;">
              <circle cx="8" cy="8" r="6"></circle>
              <path d="M5.3 8h5.4M8 5.3V10.7"></path>
            </svg>
            API Keys
          </button>
          <button class="settings-tab" data-tab="speech" onclick="SettingsModal.switchTab('speech')">
            <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-3px; margin-right:8px;">
              <rect x="6.1" y="2.5" width="3.8" height="7.2" rx="1.8"></rect>
              <path d="M3.8 7.8a4.2 4.2 0 0 0 8.4 0M8 12v2M5.5 14h5"></path>
            </svg>
            Speech
          </button>
          <button class="settings-tab" data-tab="hardware" onclick="SettingsModal.switchTab('hardware')">
            <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-3px; margin-right:8px;">
              <path d="M8 1.8v2.1M8 12.1v2.1M1.8 8h2.1M12.1 8h2.1M3.4 3.4l1.5 1.5M11.1 11.1l1.5 1.5M12.6 3.4l-1.5 1.5M4.9 11.1l-1.5 1.5"></path>
              <circle cx="8" cy="8" r="2.6"></circle>
            </svg>
            Hardware
          </button>
          <button class="settings-tab" data-tab="system" onclick="SettingsModal.switchTab('system')">
            <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-3px; margin-right:8px;">
              <rect x="2.3" y="2.5" width="11.4" height="11" rx="1.5"></rect>
              <path d="M5 6h6M5 8.5h6M5 11h4"></path>
            </svg>
            System Info
          </button>
          <button class="settings-tab" data-tab="mods" onclick="SettingsModal.switchTab('mods')">
            <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-3px; margin-right:8px;">
              <path d="M8 2.2l5 2.9v5.8l-5 2.9-5-2.9V5.1l5-2.9z"></path>
              <path d="M8 2.2v5.8M13 5.1L8 8 3 5.1"></path>
            </svg>
            Mods
          </button>
          <button class="settings-tab" data-tab="about" onclick="SettingsModal.switchTab('about')">
            <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-3px; margin-right:8px;">
              <circle cx="8" cy="8" r="6"></circle>
              <path d="M8 7v4M8 4.8h.01"></path>
            </svg>
            About
          </button>
        </div>
        
        <div class="settings-modal-content">
          <!-- HuggingFace Tab -->
          <div id="settings-tab-huggingface" class="settings-tab-content active">
            ${getHuggingFaceTabHTML(settings, hasToken, openAiCompat, vllm, exllamav2)}
          </div>
          
          <!-- Theme Tab -->
          <div id="settings-tab-speech" class="settings-tab-content">
            ${getSpeechTabHTML()}
          </div>

          <!-- Hardware Tab -->
          <div id="settings-tab-hardware" class="settings-tab-content">
            ${getHardwareTabHTML()}
          </div>

          <!-- System Info Tab -->
          <div id="settings-tab-system" class="settings-tab-content">
            ${getSystemInfoTabHTML()}
          </div>

          <!-- Mods Tab -->
          <div id="settings-tab-mods" class="settings-tab-content">
            ${getModsTabHTML()}
          </div>
          
          <!-- About Tab -->
          <div id="settings-tab-about" class="settings-tab-content">
            ${getAboutTabHTML()}
          </div>
        </div>
        
        <div class="settings-modal-footer">
          <div id="settings-save-status" class="settings-save-status"></div>
          <button class="btn-secondary" onclick="SettingsModal.close()">Close</button>
        </div>
      </div>
    </div>`;
}

// ============================================================================
// TAB CONTENT GENERATORS
// ============================================================================

function getHuggingFaceTabHTML(settings, hasToken, openAiCompat = {}, vllm = {}, exllamav2 = {}) {
  return `
    <div class="settings-section">
      <h3>API Keys</h3>
      <h4 style="margin: 0 0 10px 0; color: #ddd;">🤗 Hugging Face</h4>
      <p class="settings-description">
        Required for accessing gated models like Gemma, Llama, etc.
        <a href="#" onclick="SettingsModal.openTokenPage(); return false;" class="settings-link">
          Get your token here
        </a>
      </p>
      
      <div class="settings-input-group">
        <input type="password" 
               id="settings-hf-token" 
               class="settings-input" 
               placeholder="hf_xxxxxxxxxxxxxxxxxxxx"
               value="${hasToken ? settings.huggingface_token : ''}"
               autocomplete="off">
        <button type="button" 
                class="settings-toggle-btn" 
                onclick="SettingsModal.toggleTokenVisibility()"
                title="Show/Hide token">
          <span id="token-visibility-icon">Show</span>
        </button>
      </div>
      
      <div id="settings-token-status" class="settings-status">
        ${hasToken ? '<span class="status-configured">✅ Token configured</span>' : '<span class="status-not-configured">No token configured</span>'}
      </div>
      
      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.1);">
        <h4 style="margin: 0 0 10px 0; color: #ddd;">OpenAI-Compatible</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="color:#aaa; font-size:12px;">Base URL</label>
            <input id="settings-api-openai-base-url" class="settings-input" placeholder="http://127.0.0.1:8000" value="${String(openAiCompat.base_url || '')}" />
          </div>
          <div>
            <label style="color:#aaa; font-size:12px;">Model ID</label>
            <input id="settings-api-openai-model-id" class="settings-input" placeholder="gpt-oss-20b" value="${String(openAiCompat.model_id || '')}" />
          </div>
        </div>
        <div style="margin-top: 10px;">
          <label style="color:#aaa; font-size:12px;">API Key</label>
          <input id="settings-api-openai-api-key" class="settings-input" type="password" placeholder="optional" value="${String(openAiCompat.api_key || '')}" autocomplete="off" />
        </div>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.1);">
        <h4 style="margin: 0 0 10px 0; color: #ddd;">vLLM</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="color:#aaa; font-size:12px;">Base URL</label>
            <input id="settings-api-vllm-base-url" class="settings-input" placeholder="http://127.0.0.1:8000" value="${String(vllm.base_url || '')}" />
          </div>
          <div>
            <label style="color:#aaa; font-size:12px;">Model ID</label>
            <input id="settings-api-vllm-model-id" class="settings-input" placeholder="Qwen/Qwen3-4B-Instruct" value="${String(vllm.model_id || '')}" />
          </div>
        </div>
        <div style="margin-top: 10px;">
          <label style="color:#aaa; font-size:12px;">API Key</label>
          <input id="settings-api-vllm-api-key" class="settings-input" type="password" placeholder="optional" value="${String(vllm.api_key || '')}" autocomplete="off" />
        </div>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.1);">
        <h4 style="margin: 0 0 10px 0; color: #ddd;">ExLlamaV2</h4>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="color:#aaa; font-size:12px;">Base URL</label>
            <input id="settings-api-exllamav2-base-url" class="settings-input" placeholder="http://127.0.0.1:8001" value="${String(exllamav2.base_url || '')}" />
          </div>
          <div>
            <label style="color:#aaa; font-size:12px;">Model ID</label>
            <input id="settings-api-exllamav2-model-id" class="settings-input" placeholder="optional" value="${String(exllamav2.model_id || '')}" />
          </div>
        </div>
        <div style="margin-top: 10px;">
          <label style="color:#aaa; font-size:12px;">API Key</label>
          <input id="settings-api-exllamav2-api-key" class="settings-input" type="password" placeholder="optional" value="${String(exllamav2.api_key || '')}" autocomplete="off" />
        </div>
      </div>

      <button class="btn-primary" style="margin-top: 15px;" onclick="SettingsModal.saveToken()">
        Save API Keys
      </button>
    </div>
  `;
}

function getThemeTabHTML() {
  return window.SettingsModalTemplatesTheme?.getThemeTabHTML
    ? window.SettingsModalTemplatesTheme.getThemeTabHTML()
    : "";
}
