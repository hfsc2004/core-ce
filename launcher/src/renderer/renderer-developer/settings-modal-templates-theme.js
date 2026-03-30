/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';
function getThemeTabHTML() {
  // Load current theme from localStorage (sync fallback)
  // The actual theme may be loaded async from settings file on app startup
  const themes = JSON.parse(localStorage.getItem('psf-themes') || '{}');
  const savedTheme = themes['global'] || themes['moe'] || {};
  
  // Default colors - matches CSS :root defaults (cyan theme)
  const defaults = {
    accent: '#00d4ff',
    accentLight: 'rgba(0,212,255,0.1)',
    accentMedium: 'rgba(0,212,255,0.2)',
    accentDark: '#0099cc',
    success: '#00ff88',
    warning: '#ffd400',
    error: '#ff6b6b',
    bgPrimary: '#1a1a2e',
    bgSecondary: '#16213e',
    border: '#0f3460',
    textPrimary: '#e0e0e0',
    textSecondary: '#aaa',
    textMuted: '#888',
    headerTitle: '#e0e0e0',
    editionTag: '#ff6b6b',
    footerLink: '#ffffff',
    logoFile: 'PSF_Logo_White_256.png'
  };
  
  // Merge saved with defaults
  const currentTheme = { ...defaults, ...savedTheme };
  
  // Store in state for access by other functions
  settingsModalState.currentTheme = currentTheme;
  
  return `
    <div class="settings-section">
      <h3>Application Theme</h3>
      <p class="settings-description">
        Customize colors for the application interface. Theme is saved to settings and will be included when compiling products.
      </p>
      
      <!-- Presets -->
      <h4 style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">Quick Presets</h4>
      <div class="theme-presets-grid">
        <button class="theme-preset-btn" onclick="SettingsModal.applyThemePreset(event, 'purple')">
          <span class="theme-swatch" style="background: #8a2be2;"></span>
          <span class="theme-preset-name">Purple</span>
        </button>
        <button class="theme-preset-btn" onclick="SettingsModal.applyThemePreset(event, 'blue')">
          <span class="theme-swatch" style="background: #4682b4;"></span>
          <span class="theme-preset-name">Steel Blue</span>
        </button>
        <button class="theme-preset-btn" onclick="SettingsModal.applyThemePreset(event, 'teal')">
          <span class="theme-swatch" style="background: #20b2aa;"></span>
          <span class="theme-preset-name">Teal</span>
        </button>
        <button class="theme-preset-btn" onclick="SettingsModal.applyThemePreset(event, 'orange')">
          <span class="theme-swatch" style="background: #ff8c00;"></span>
          <span class="theme-preset-name">Sunset Orange</span>
        </button>
        <button class="theme-preset-btn" onclick="SettingsModal.applyThemePreset(event, 'green')">
          <span class="theme-swatch" style="background: #50c878;"></span>
          <span class="theme-preset-name">Emerald</span>
        </button>
        <button class="theme-preset-btn" onclick="SettingsModal.applyThemePreset(event, 'red')">
          <span class="theme-swatch" style="background: #e74c3c;"></span>
          <span class="theme-preset-name">Ruby Red</span>
        </button>
        <button class="theme-preset-btn" onclick="SettingsModal.applyThemePreset(event, 'cyan')">
          <span class="theme-swatch" style="background: #00d4ff;"></span>
          <span class="theme-preset-name">Cyan</span>
        </button>
        <button class="theme-preset-btn" onclick="SettingsModal.applyThemePreset(event, 'gold')">
          <span class="theme-swatch" style="background: #ffd700;"></span>
          <span class="theme-preset-name">Gold</span>
        </button>
        <button class="theme-preset-btn" onclick="SettingsModal.applyThemePreset(event, 'pink')">
          <span class="theme-swatch" style="background: #ff69b4;"></span>
          <span class="theme-preset-name">Hot Pink</span>
        </button>
      </div><!-- Custom Colors -->
      <h4 style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px 0; padding-top: 15px; border-top: 1px solid #333;">Custom Colors</h4>
      
      <div class="color-picker-grid">
        <!-- Accent Color -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-accent" value="${hexFromColorSM(currentTheme.accent)}" onchange="SettingsModal.updateThemeColor('accent', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Accent Color</div>
            <div class="color-picker-desc">Headers, buttons, highlights</div>
          </div>
          <span class="color-picker-value" id="theme-value-accent">${currentTheme.accent}</span>
        </div>
        
        <!-- Accent Light -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-accentLight" value="${hexFromColorSM(currentTheme.accentLight)}" onchange="SettingsModal.updateThemeColor('accentLight', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Accent Light</div>
            <div class="color-picker-desc">Backgrounds, hover states</div>
          </div>
          <span class="color-picker-value" id="theme-value-accentLight">${currentTheme.accentLight}</span>
        </div>
        
        <!-- Accent Medium -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-accentMedium" value="${hexFromColorSM(currentTheme.accentMedium)}" onchange="SettingsModal.updateThemeColor('accentMedium', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Accent Medium</div>
            <div class="color-picker-desc">Button backgrounds, badges</div>
          </div>
          <span class="color-picker-value" id="theme-value-accentMedium">${currentTheme.accentMedium}</span>
        </div>
        
        <!-- Accent Dark -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-accentDark" value="${hexFromColorSM(currentTheme.accentDark)}" onchange="SettingsModal.updateThemeColor('accentDark', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Accent Dark</div>
            <div class="color-picker-desc">Gradients, borders</div>
          </div>
          <span class="color-picker-value" id="theme-value-accentDark">${currentTheme.accentDark}</span>
        </div>
        
        <!-- Success -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-success" value="${hexFromColorSM(currentTheme.success)}" onchange="SettingsModal.updateThemeColor('success', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Success Color</div>
            <div class="color-picker-desc">Ready states, confirmations</div>
          </div>
          <span class="color-picker-value" id="theme-value-success">${currentTheme.success}</span>
        </div>
        
        <!-- Warning -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-warning" value="${hexFromColorSM(currentTheme.warning)}" onchange="SettingsModal.updateThemeColor('warning', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Warning Color</div>
            <div class="color-picker-desc">Processing, caution</div>
          </div>
          <span class="color-picker-value" id="theme-value-warning">${currentTheme.warning}</span>
        </div>
        
        <!-- Error -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-error" value="${hexFromColorSM(currentTheme.error)}" onchange="SettingsModal.updateThemeColor('error', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Error Color</div>
            <div class="color-picker-desc">Errors, delete actions</div>
          </div>
          <span class="color-picker-value" id="theme-value-error">${currentTheme.error}</span>
        </div>
      </div>
      
      <!-- Background & Border Colors -->
      <h4 style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px 0; padding-top: 15px; border-top: 1px solid #333;">Background & Borders</h4>
      
      <div class="color-picker-grid">
        <!-- Primary Background -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-bgPrimary" value="${hexFromColorSM(currentTheme.bgPrimary)}" onchange="SettingsModal.updateThemeColor('bgPrimary', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Primary Background</div>
            <div class="color-picker-desc">Main app background</div>
          </div>
          <span class="color-picker-value" id="theme-value-bgPrimary">${currentTheme.bgPrimary}</span>
        </div>
        
        <!-- Secondary Background -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-bgSecondary" value="${hexFromColorSM(currentTheme.bgSecondary)}" onchange="SettingsModal.updateThemeColor('bgSecondary', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Secondary Background</div>
            <div class="color-picker-desc">Cards, panels, modals</div>
          </div>
          <span class="color-picker-value" id="theme-value-bgSecondary">${currentTheme.bgSecondary}</span>
        </div>
        
        <!-- Border Color -->
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-border" value="${hexFromColorSM(currentTheme.border)}" onchange="SettingsModal.updateThemeColor('border', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Border Color</div>
            <div class="color-picker-desc">Card borders, dividers</div>
          </div>
          <span class="color-picker-value" id="theme-value-border">${currentTheme.border}</span>
        </div>
      </div>

      <!-- Text Colors -->
      <h4 style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px 0; padding-top: 15px; border-top: 1px solid #333;">Text Colors</h4>

      <div class="color-picker-grid">
        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-textPrimary" value="${hexFromColorSM(currentTheme.textPrimary)}" onchange="SettingsModal.updateThemeColor('textPrimary', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Primary Text</div>
            <div class="color-picker-desc">Main readable content</div>
          </div>
          <span class="color-picker-value" id="theme-value-textPrimary">${currentTheme.textPrimary}</span>
        </div>

        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-textSecondary" value="${hexFromColorSM(currentTheme.textSecondary)}" onchange="SettingsModal.updateThemeColor('textSecondary', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Secondary Text</div>
            <div class="color-picker-desc">Labels and helper text</div>
          </div>
          <span class="color-picker-value" id="theme-value-textSecondary">${currentTheme.textSecondary}</span>
        </div>

        <div class="color-picker-row">
          <div class="color-picker-input">
            <input type="color" id="theme-color-textMuted" value="${hexFromColorSM(currentTheme.textMuted)}" onchange="SettingsModal.updateThemeColor('textMuted', this.value)">
          </div>
          <div class="color-picker-info">
            <div class="color-picker-label">Muted Text</div>
            <div class="color-picker-desc">Footers and low-emphasis text</div>
          </div>
          <span class="color-picker-value" id="theme-value-textMuted">${currentTheme.textMuted}</span>
        </div>
      </div>
      
      <!-- Live Preview -->
      <h4 style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px 0;">Live Preview</h4>
      <div class="theme-preview-box" id="theme-preview-box" style="background: ${currentTheme.bgSecondary}; border: 2px solid ${currentTheme.border}; color: ${currentTheme.textPrimary}; padding: 15px; border-radius: 8px;">
        <button class="preview-btn-solid" id="preview-btn-solid" style="background: ${currentTheme.accent}; border: none; color: #fff; padding: 8px 16px; border-radius: 6px; margin-right: 10px;">
          Button
        </button>
        <button class="preview-btn-outline" id="preview-btn-outline" style="background: ${currentTheme.accentLight}; border: 2px solid ${currentTheme.accent}; color: ${currentTheme.accent}; padding: 8px 16px; border-radius: 6px; margin-right: 10px;">
          Outline
        </button>
        <span id="preview-badge" style="background: ${currentTheme.accentMedium}; color: ${currentTheme.accent}; padding: 4px 12px; border-radius: 12px; font-size: 12px; margin-right: 10px;">
          Badge
        </span>
        <span id="preview-header" style="color: ${currentTheme.accent}; font-weight: bold;">
          Header Text
        </span>
        <div id="preview-text-primary" style="margin-top: 12px; color: ${currentTheme.textPrimary};">Primary text sample for readability.</div>
        <div id="preview-text-secondary" style="margin-top: 4px; color: ${currentTheme.textSecondary};">Secondary text sample for labels and guidance.</div>
        <div id="preview-text-muted" style="margin-top: 4px; color: ${currentTheme.textMuted}; font-size: 12px;">Muted text sample for low-priority metadata.</div>
      </div>

      <!-- Custom Theme Profiles -->
      <h4 style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px 0; padding-top: 15px; border-top: 1px solid #333;">Custom Theme Profiles</h4>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input
          type="text"
          id="theme-custom-name"
          placeholder="Profile name"
          style="flex: 1 1 220px; min-width: 180px; background: #0d1117; border: 1px solid #2f3b47; color: #e0e0e0; padding: 8px 10px; border-radius: 6px;"
        />
        <button class="btn-secondary" onclick="SettingsModal.saveThemeCustom()">
          Save Custom
        </button>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap;">
        <select
          id="theme-custom-select"
          style="flex: 1 1 280px; min-width: 220px; background: #0d1117; border: 1px solid #2f3b47; color: #e0e0e0; padding: 8px 10px; border-radius: 6px;"
        >
          <option value="">Select saved custom theme...</option>
        </select>
        <button class="btn-secondary" onclick="SettingsModal.loadThemeCustom()">
          Load Custom
        </button>
        <button class="btn-secondary" style="border-color: #8b2d2d; color: #ff8a8a;" onclick="SettingsModal.deleteThemeCustom()">
          Delete
        </button>
      </div>
      
      <!-- Action Buttons -->
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button class="btn-primary" onclick="SettingsModal.saveThemeSettings()">
          💾 Apply & Save
        </button>
        <button class="btn-secondary" onclick="SettingsModal.resetThemeToDefaults()">
          Reset to Defaults
        </button>
      </div>
      
      <div id="theme-status" style="margin-top: 15px; color: #888; font-size: 13px;"></div>
    </div>
  `;
}

  window.SettingsModalTemplatesTheme = { getThemeTabHTML };
})();
