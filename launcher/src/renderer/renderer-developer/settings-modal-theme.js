/**
 * Settings Modal - Theme tab logic
 * Extracted from settings-modal.js to reduce monolith size.
 *
 * @version 1.1.2 - March 5, 2026
 */

/**
 * Load theme from settings file and update the UI
 */
async function loadThemeFromSettings() {
  try {
    if (window.electronAPI && window.electronAPI.getTheme) {
      const theme = await window.electronAPI.getTheme();
      if (theme && theme.accent) {
        settingsModalState.currentTheme = theme;

        // Update all inputs and displays
        Object.keys(theme).forEach((key) => {
          const input = document.getElementById(`theme-color-${key}`);
          const valueDisplay = document.getElementById(`theme-value-${key}`);
          if (input) input.value = hexFromColorSM(theme[key]);
          if (valueDisplay) valueDisplay.textContent = theme[key];
        });
        // Update preview
        updateThemePreview();

        console.log('[Theme] Loaded theme from settings for modal:', theme.accent);
      }
    }
  } catch (err) {
    console.warn('[Theme] Could not load theme from settings:', err.message);
  } finally {
    refreshCustomThemeList();
  }
}

/**
 * Global theme presets
 */
const GLOBAL_THEMES = {
  purple: { accent: '#8a2be2', name: 'Purple' },
  blue: { accent: '#4682b4', name: 'Steel Blue' },
  teal: { accent: '#20b2aa', name: 'Teal' },
  orange: { accent: '#ff8c00', name: 'Sunset Orange' },
  green: { accent: '#50c878', name: 'Emerald' },
  red: { accent: '#e74c3c', name: 'Ruby Red' },
  cyan: { accent: '#00d4ff', name: 'Cyan' },
  gold: { accent: '#ffd700', name: 'Gold' },
  pink: { accent: '#ff69b4', name: 'Hot Pink' }
};

/**
 * Extract hex color from any color format (for color input compatibility)
 */
function hexFromColorSM(color) {
  if (!color) return '#8a2be2';
  if (color.startsWith('#')) {
    return color.length === 4
      ? '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
      : color.substring(0, 7);
  }
  if (color.startsWith('rgba') || color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match) {
      const r = parseInt(match[0], 10).toString(16).padStart(2, '0');
      const g = parseInt(match[1], 10).toString(16).padStart(2, '0');
      const b = parseInt(match[2], 10).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }
  return '#8a2be2'; // fallback
}

/**
 * Convert hex to rgba
 */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Darken a hex color
 */
function darkenHex(hex, amount = 0.2) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 255 * amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 255 * amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 255 * amount);
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
}

/**
 * Apply a theme preset (fills in color pickers and updates preview)
 */
function applyThemePreset(event, presetKey) {
  const preset = GLOBAL_THEMES[presetKey];
  if (!preset) return;

  const accent = preset.accent;

  // Generate color variants including backgrounds
  const newTheme = {
    accent,
    accentLight: hexToRgba(accent, 0.1),
    accentMedium: hexToRgba(accent, 0.2),
    accentDark: darkenHex(accent, 0.2),
    success: '#00ff88',
    warning: '#ffd400',
    error: '#ff6b6b',
    // Generate dark backgrounds from accent color
    bgPrimary: generateDarkBg(accent, 0.85),    // Very dark version
    bgSecondary: generateDarkBg(accent, 0.80),  // Slightly lighter
    border: generateDarkBg(accent, 0.70),       // Border color
    textPrimary: '#e0e0e0',
    textSecondary: '#aaa',
    textMuted: '#888',
    headerTitle: '#e0e0e0',
    editionTag: '#ff6b6b',
    footerLink: '#ffffff'
  };

  // Update state
  settingsModalState.currentTheme = newTheme;

  // Update all color inputs and value displays
  Object.keys(newTheme).forEach((key) => {
    const input = document.getElementById(`theme-color-${key}`);
    const valueDisplay = document.getElementById(`theme-value-${key}`);
    if (input) input.value = hexFromColorSM(newTheme[key]);
    if (valueDisplay) valueDisplay.textContent = newTheme[key];
  });

  // Update preview
  updateThemePreview();

  // Update button states
  document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
    btn.classList.remove('active');
  });
  if (event && event.target) {
    event.target.closest('.theme-preset-btn')?.classList.add('active');
  }

  // Show status
  const statusDiv = document.getElementById('theme-status');
  if (statusDiv) {
    statusDiv.innerHTML = `<span style="color: ${accent};">Preset "${preset.name}" loaded. Click "Apply & Save" to save changes.</span>`;
  }
}

/**
 * Generate a dark background color from an accent color
 * @param {string} hex - Accent hex color
 * @param {number} darkenAmount - How much to darken (0-1, higher = darker)
 */
function generateDarkBg(hex, darkenAmount = 0.85) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Darken significantly and desaturate slightly for backgrounds
  const factor = 1 - darkenAmount;
  const nr = Math.round(r * factor);
  const ng = Math.round(g * factor);
  const nb = Math.round(b * factor);

  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

/**
 * Update a single theme color (from color picker)
 */
function updateThemeColor(colorKey, value) {
  if (!settingsModalState.currentTheme) {
    settingsModalState.currentTheme = {};
  }

  // Update the color
  settingsModalState.currentTheme[colorKey] = value;

  // Update value display
  const valueDisplay = document.getElementById(`theme-value-${colorKey}`);
  if (valueDisplay) valueDisplay.textContent = value;

  // If changing accent, auto-generate related colors
  if (colorKey === 'accent') {
    const accentLight = hexToRgba(value, 0.1);
    const accentMedium = hexToRgba(value, 0.2);
    const accentDark = darkenHex(value, 0.2);

    settingsModalState.currentTheme.accentLight = accentLight;
    settingsModalState.currentTheme.accentMedium = accentMedium;
    settingsModalState.currentTheme.accentDark = accentDark;

    // Update inputs and displays
    ['accentLight', 'accentMedium', 'accentDark'].forEach((key) => {
      const input = document.getElementById(`theme-color-${key}`);
      const display = document.getElementById(`theme-value-${key}`);
      if (input) input.value = hexFromColorSM(settingsModalState.currentTheme[key]);
      if (display) display.textContent = settingsModalState.currentTheme[key];
    });
  }

  // Update preview
  updateThemePreview();

  // Clear preset selection (since we're now custom)
  document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
    btn.classList.remove('active');
  });
}

/**
 * Update the live preview elements
 */
function updateThemePreview() {
  const theme = settingsModalState.currentTheme;
  if (!theme) return;

  const previewBox = document.getElementById('theme-preview-box');
  const btnSolid = document.getElementById('preview-btn-solid');
  const btnOutline = document.getElementById('preview-btn-outline');
  const badge = document.getElementById('preview-badge');
  const header = document.getElementById('preview-header');

  if (previewBox) {
    previewBox.style.background = theme.bgSecondary || '#16213e';
    previewBox.style.borderColor = theme.border || '#0f3460';
    previewBox.style.color = theme.textPrimary || '#e0e0e0';
  }
  if (btnSolid) {
    btnSolid.style.background = theme.accent;
  }
  if (btnOutline) {
    btnOutline.style.background = theme.accentLight;
    btnOutline.style.borderColor = theme.accent;
    btnOutline.style.color = theme.accent;
  }
  if (badge) {
    badge.style.background = theme.accentMedium;
    badge.style.color = theme.accent;
  }
  if (header) {
    header.style.color = theme.accent;
  }
  const previewTextPrimary = document.getElementById('preview-text-primary');
  const previewTextSecondary = document.getElementById('preview-text-secondary');
  const previewTextMuted = document.getElementById('preview-text-muted');
  if (previewTextPrimary) previewTextPrimary.style.color = theme.textPrimary || '#e0e0e0';
  if (previewTextSecondary) previewTextSecondary.style.color = theme.textSecondary || '#aaa';
  if (previewTextMuted) previewTextMuted.style.color = theme.textMuted || '#888';
}

/**
 * Save theme settings to psf-settings.json (via IPC) and apply to page
 */
async function saveThemeSettings() {
  const theme = settingsModalState.currentTheme;
  if (!theme) return;

  const statusDiv = document.getElementById('theme-status');

  try {
    // Save to psf-settings.json via IPC (primary storage - survives compilation)
    if (window.electronAPI && window.electronAPI.saveTheme) {
      const result = await window.electronAPI.saveTheme(theme);
      if (!result.success) {
        console.error('[Theme] Failed to save theme to settings:', result.error);
      }
    }

    // Also save to localStorage for backward compatibility
    const themes = JSON.parse(localStorage.getItem('psf-themes') || '{}');
    themes.global = theme;
    themes.moe = theme; // Keep MoE in sync
    localStorage.setItem('psf-themes', JSON.stringify(themes));

    // Apply theme to page via CSS variables
    applyThemeToPage(theme);

    // Re-render MoE/IRG screen if present so dynamic inline styles refresh
    if (typeof window.renderModelOrdering === 'function') {
      try { window.renderModelOrdering(); } catch (e) { /* no-op */ }
    }

    // Show success status
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--psf-success, #00ff88);">✓ Theme saved and applied!</span>';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 3000);
    }
  } catch (err) {
    console.error('[Theme] Error saving theme:', err);
    if (statusDiv) {
      statusDiv.innerHTML = `<span style="color: var(--psf-error, #ff6b6b);">Error saving theme: ${err.message}</span>`;
    }
  }
}

/**
 * Apply theme to page via CSS custom properties
 * @param {Object} theme - Theme object with color values
 */
function applyThemeToPage(theme) {
  if (!theme) return;

  const root = document.documentElement;

  // Map theme keys to CSS variable names
  const cssVarMap = {
    accent: '--psf-accent',
    accentLight: '--psf-accent-light',
    accentMedium: '--psf-accent-medium',
    accentDark: '--psf-accent-dark',
    success: '--psf-success',
    warning: '--psf-warning',
    error: '--psf-error',
    bgPrimary: '--psf-bg-primary',
    bgSecondary: '--psf-bg-secondary',
    border: '--psf-border',
    textPrimary: '--psf-text-primary',
    textSecondary: '--psf-text-secondary',
    textMuted: '--psf-text-muted',
    headerTitle: '--psf-header-title',
    editionTag: '--psf-edition-tag',
    footerLink: '--psf-footer-link'
  };

  // Apply each theme color to corresponding CSS variable
  for (const [key, cssVar] of Object.entries(cssVarMap)) {
    if (theme[key]) {
      root.style.setProperty(cssVar, theme[key]);
    }
  }

  // Also update any elements with hardcoded inline styles
  // This handles elements that can't use CSS variables directly
  updateInlineThemedElements(theme);
  applyLogoToPage(theme);

  console.log('[Theme] Applied theme to page:', theme.accent);
}

function applyLogoToPage(theme) {
  if (!theme) return;
  const logoFile = theme.logoFile || 'PSF_Logo_White_256.png';
  const logos = document.querySelectorAll('img.psf-logo, img.logo-img');
  logos.forEach((img) => {
    img.src = `../assets/${logoFile}`;
  });
}

/**
 * Update elements with hardcoded inline styles to match theme
 * @param {Object} theme - Theme object with color values
 */
function updateInlineThemedElements(theme) {
  if (!theme || !theme.accent) return;

  // Update elements with color: #00d4ff inline style
  document.querySelectorAll('[style*="color: #00d4ff"], [style*="color:#00d4ff"]').forEach((el) => {
    el.style.color = theme.accent;
  });

  // Update elements with border colors
  document.querySelectorAll('[style*="border"][style*="#00d4ff"]').forEach((el) => {
    const style = el.getAttribute('style');
    el.setAttribute('style', style.replace(/#00d4ff/gi, theme.accent));
  });

  // Update elements with background rgba(0,212,255,...)
  document.querySelectorAll('[style*="rgba(0,212,255"], [style*="rgba(0, 212, 255"]').forEach((el) => {
    const style = el.getAttribute('style');
    // Replace with theme accent light/medium based on opacity
    const updated = style
      .replace(/rgba\(0,\s*212,\s*255,\s*0\.0?5\)/gi, theme.accentLight)
      .replace(/rgba\(0,\s*212,\s*255,\s*0\.1\)/gi, theme.accentLight)
      .replace(/rgba\(0,\s*212,\s*255,\s*0\.2\)/gi, theme.accentMedium)
      .replace(/rgba\(0,\s*212,\s*255,\s*0\.3\)/gi, theme.accentMedium);
    el.setAttribute('style', updated);
  });

  // Update gradient backgrounds (like progress bars and buttons)
  document.querySelectorAll('[style*="linear-gradient"][style*="#00d4ff"]').forEach((el) => {
    const style = el.getAttribute('style');
    el.setAttribute('style', style.replace(/#00d4ff/gi, theme.accent));
  });
}

/**
 * Load and apply theme on page load
 * Called during application initialization
 */
async function loadAndApplyTheme() {
  try {
    // Try to load from psf-settings.json first (via IPC)
    if (window.electronAPI && window.electronAPI.getTheme) {
      const theme = await window.electronAPI.getTheme();
      if (theme && theme.accent) {
        applyThemeToPage(theme);
        console.log('[Theme] Loaded theme from settings file');
        return;
      }
    }

    // Fallback to localStorage
    const themes = JSON.parse(localStorage.getItem('psf-themes') || '{}');
    if (themes.global) {
      applyThemeToPage(themes.global);
      console.log('[Theme] Loaded theme from localStorage');
    }
  } catch (err) {
    console.warn('[Theme] Could not load theme, using defaults:', err.message);
  }
}

/**
 * Reset theme to defaults
 */
function resetThemeToDefaults() {
  // Use cyan as default (matches CSS defaults)
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

  settingsModalState.currentTheme = { ...defaults };

  // Update all inputs and displays
  Object.keys(defaults).forEach((key) => {
    const input = document.getElementById(`theme-color-${key}`);
    const valueDisplay = document.getElementById(`theme-value-${key}`);
    if (input) input.value = hexFromColorSM(defaults[key]);
    if (valueDisplay) valueDisplay.textContent = defaults[key];
  });

  // Update preview
  updateThemePreview();

  // Clear preset selection
  document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
    btn.classList.remove('active');
  });

  // Show status
  const statusDiv = document.getElementById('theme-status');
  if (statusDiv) {
    statusDiv.innerHTML = '<span style="color: var(--psf-accent, #00d4ff);">Reset to defaults. Click "Apply & Save" to save changes.</span>';
  }
}

// Keep old function name for backward compatibility (if called from elsewhere)
function applyGlobalTheme(event, themeKey) {
  applyThemePreset(event, themeKey);
  // Also auto-save for backward compatibility
  saveThemeSettings();
}
