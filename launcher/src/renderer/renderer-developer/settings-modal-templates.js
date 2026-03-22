/**
 * Settings Modal - HTML/template generators
 * Extracted from settings-modal.js to reduce monolith size.
 *
 * @version 1.1.2 - March 5, 2026
 */

function getSettingsModalHTML(settings) {
  const hasToken = settings.huggingface_token && settings.huggingface_token.length > 0;
  
  return `
    <div id="settings-modal-overlay" class="settings-modal-overlay" onclick="SettingsModal.close(event)">
      <div id="settings-modal" class="settings-modal" onclick="event.stopPropagation()">
        <div id="settings-modal-header" class="settings-modal-header">
          <h2>⚙️ Settings</h2>
          <button class="settings-modal-close" onclick="SettingsModal.close()">&times;</button>
        </div>
        
        <!-- Tab Navigation -->
        <div class="settings-tabs">
          <button class="settings-tab active" data-tab="huggingface" onclick="SettingsModal.switchTab('huggingface')">
            🤗 HuggingFace API
          </button>
          <button class="settings-tab" data-tab="speech" onclick="SettingsModal.switchTab('speech')">
            🎙️ Speech
          </button>
          <button class="settings-tab" data-tab="hardware" onclick="SettingsModal.switchTab('hardware')">
            🎛️ Hardware
          </button>
          <button class="settings-tab" data-tab="system" onclick="SettingsModal.switchTab('system')">
            📋 System Info
          </button>
          <button class="settings-tab" data-tab="mods" onclick="SettingsModal.switchTab('mods')">
            🧩 Mods
          </button>
          <button class="settings-tab" data-tab="about" onclick="SettingsModal.switchTab('about')">
            ℹ️ About
          </button>
        </div>
        
        <div class="settings-modal-content">
          <!-- HuggingFace Tab -->
          <div id="settings-tab-huggingface" class="settings-tab-content active">
            ${getHuggingFaceTabHTML(settings, hasToken)}
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

function getHuggingFaceTabHTML(settings, hasToken) {
  return `
    <div class="settings-section">
      <h3>HuggingFace API Token</h3>
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
          <span id="token-visibility-icon">👁️</span>
        </button>
      </div>
      
      <div id="settings-token-status" class="settings-status">
        ${hasToken ? '<span class="status-configured">✅ Token configured</span>' : '<span class="status-not-configured">No token configured</span>'}
      </div>
      
      <button class="btn-primary" style="margin-top: 15px;" onclick="SettingsModal.saveToken()">
        Save Token
      </button>
    </div>
  `;
}

function getThemeTabHTML() {
  return window.SettingsModalTemplatesTheme?.getThemeTabHTML
    ? window.SettingsModalTemplatesTheme.getThemeTabHTML()
    : "";
}
