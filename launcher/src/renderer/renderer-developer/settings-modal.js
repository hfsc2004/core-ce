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
  const readValue = (id) => {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  };

  if (!tokenInput) return;

  const token = tokenInput.value.trim();
  const apiKeys = {
    openai_compatible: {
      base_url: readValue('settings-api-openai-base-url'),
      api_key: readValue('settings-api-openai-api-key'),
      model_id: readValue('settings-api-openai-model-id')
    },
    vllm: {
      base_url: readValue('settings-api-vllm-base-url'),
      api_key: readValue('settings-api-vllm-api-key'),
      model_id: readValue('settings-api-vllm-model-id')
    },
    exllamav2: {
      base_url: readValue('settings-api-exllamav2-base-url'),
      api_key: readValue('settings-api-exllamav2-api-key'),
      model_id: readValue('settings-api-exllamav2-model-id')
    }
  };

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
    const settings = { ...(current || {}), huggingface_token: token, api_keys: apiKeys };
    const result = await window.electronAPI.saveSettings(settings);

    if (result.success) {
      statusDiv.className = 'settings-save-status success';
      statusDiv.textContent = 'API keys saved successfully.';

      // Compatibility bridge for Terminal defaults while provider-specific
      // wiring rolls out across all surfaces.
      try {
        const defaults = {
          provider: 'openai-compatible',
          provider_base_url: apiKeys.openai_compatible.base_url,
          provider_api_key: apiKeys.openai_compatible.api_key,
          provider_model_id: apiKeys.openai_compatible.model_id
        };
        localStorage.setItem('psf_terminal_provider_defaults', JSON.stringify(defaults));
      } catch (_) {}

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
      icon.textContent = 'Hide';
    } else {
      input.type = 'password';
      icon.textContent = 'Show';
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
