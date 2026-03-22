/**
 * SETTINGS MODAL - Shared state + HuggingFace tab actions
 * Split from the former monolith.
 *
 * @version 1.1.2 - March 5, 2026
 */

// ============================================================================
// STATE
// ============================================================================

let settingsModalState = {
  activeTab: 'huggingface',
  hardwareInfo: null,
  workspaceGitStatus: null,
  workspaceGitLoaded: false,
  scmChangedFilesCollapsed: false,
  scmAllFilesCollapsed: true,
  isDragging: false,
  offsetX: 0,
  offsetY: 0
};
window.settingsModalState = settingsModalState;

// ============================================================================
// HUGGINGFACE TAB FUNCTIONS
// ============================================================================

/**
 * Save HuggingFace token
 */
async function saveHuggingFaceToken() {
  const statusDiv = document.getElementById('settings-save-status');
  const tokenInput = document.getElementById('settings-hf-token');

  if (!tokenInput) return;

  const token = tokenInput.value.trim();

  // Validate token format
  if (token && !token.startsWith('hf_')) {
    statusDiv.className = 'settings-save-status error';
    statusDiv.textContent = 'Invalid token format. Token should start with "hf_"';
    return;
  }

  statusDiv.className = 'settings-save-status';
  statusDiv.textContent = 'Saving...';

  try {
    const current = await window.electronAPI.getSettings();
    const settings = { ...(current || {}), huggingface_token: token };
    const result = await window.electronAPI.saveSettings(settings);

    if (result.success) {
      statusDiv.className = 'settings-save-status success';
      statusDiv.textContent = '✅ Token saved successfully!';

      // Update status indicator
      const tokenStatus = document.getElementById('settings-token-status');
      if (tokenStatus) {
        tokenStatus.innerHTML = token
          ? '<span class="status-configured">✅ Token configured</span>'
          : '<span class="status-not-configured">No token configured</span>';
      }

      // Clear status after delay
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 3000);
    } else {
      statusDiv.className = 'settings-save-status error';
      statusDiv.textContent = 'Error: ' + (result.error || 'Failed to save');
    }
  } catch (err) {
    console.error('[Settings Modal] Save error:', err);
    statusDiv.className = 'settings-save-status error';
    statusDiv.textContent = 'Error: ' + err.message;
  }
}

/**
 * Toggle token input visibility
 */
function toggleTokenVisibility() {
  const input = document.getElementById('settings-hf-token');
  const icon = document.getElementById('token-visibility-icon');

  if (input && icon) {
    if (input.type === 'password') {
      input.type = 'text';
      icon.textContent = '🙈';
    } else {
      input.type = 'password';
      icon.textContent = '👁️';
    }
  }
}

/**
 * Open HuggingFace token page
 */
function openHuggingFaceTokenPage() {
  if (window.electronAPI && window.electronAPI.openExternal) {
    window.electronAPI.openExternal('https://huggingface.co/settings/tokens');
  } else {
    window.open('https://huggingface.co/settings/tokens', '_blank');
  }
}
