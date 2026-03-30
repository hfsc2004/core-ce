/**
 * SETTINGS MANAGER
 * Handles application settings persistence
 * @module settings-manager
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Default theme configuration
 * These colors are used if no theme is saved
 */
const DEFAULT_THEME = {
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

const DEFAULT_SETTINGS = {
  huggingface_token: '',
  api_keys: {
    openai_compatible: {
      base_url: '',
      api_key: '',
      model_id: ''
    },
    vllm: {
      base_url: '',
      api_key: '',
      model_id: ''
    },
    exllamav2: {
      base_url: '',
      api_key: '',
      model_id: ''
    }
  },
  theme: { ...DEFAULT_THEME },
  inference_backend: 'ollama',
  service_network_policy: 'privacy',
  relay_ingress_bind: 'localhost',
  voice_to_text: {
    enabled: false,
    sttEnabled: false,
    ttsEnabled: false,
    provider: 'huggingface',
    ttsProvider: 'local-transformers',
    language: 'en-US',
    autoSend: false,
    hf: {
      sttEndpoint: '',
      sttModel: 'openai/whisper-small',
      ttsEndpoint: '',
      ttsModel: 'microsoft/speecht5_tts',
      ttsVoice: ''
    },
    localTransformers: {
      pythonBin: '',
      model: 'facebook/mms-tts-eng',
      device: 'cpu',
      dtype: 'auto',
      maxNewTokens: 180,
      terminalChunkChars: 360,
      terminalTimeoutSec: 180,
      terminalDebugTrace: false,
      speakingRate: 1.0,
      noiseScale: 0.667,
      noiseScaleDuration: 0.8,
      chatterboxCfgWeight: 0.5,
      chatterboxExaggeration: 0.5
    },
    catalogRefs: {
      stt: { collectionId: '', modelId: '' },
      tts: { collectionId: '', modelId: '' },
      localTransformersTts: { collectionId: '', modelId: '' }
    }
  },
  session_memory_enabled: true,
  animations_enabled: true,
  show_main_compliance_proof_badge: true,
  show_about_compliance_proof_badge: true,
  gpuMonitorEnabled: false,
  created_at: null,
  updated_at: null
};

/**
 * Get path to settings file
 * @param {string} projectRoot - Project root directory
 * @returns {string} Path to psf-settings.json
 */
function getSettingsPath(projectRoot) {
  return path.join(projectRoot, '..', 'models', 'psf-settings.json');
}

/**
 * Load settings from disk
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Settings object
 */
function loadSettings(projectRoot) {
  const settingsPath = getSettingsPath(projectRoot);
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      logger.debug('[Settings] Loaded settings from:', settingsPath);
      return {
        ...DEFAULT_SETTINGS,
        ...settings,
        api_keys: {
          ...DEFAULT_SETTINGS.api_keys,
          ...(settings.api_keys || {}),
          openai_compatible: {
            ...DEFAULT_SETTINGS.api_keys.openai_compatible,
            ...((settings.api_keys && settings.api_keys.openai_compatible) || {})
          },
          vllm: {
            ...DEFAULT_SETTINGS.api_keys.vllm,
            ...((settings.api_keys && settings.api_keys.vllm) || {})
          },
          exllamav2: {
            ...DEFAULT_SETTINGS.api_keys.exllamav2,
            ...((settings.api_keys && settings.api_keys.exllamav2) || {})
          }
        },
        theme: { ...DEFAULT_SETTINGS.theme, ...((settings && settings.theme) || {}) },
        voice_to_text: {
          ...DEFAULT_SETTINGS.voice_to_text,
          ...((settings && settings.voice_to_text) || {}),
          hf: {
            ...DEFAULT_SETTINGS.voice_to_text.hf,
            ...(((settings && settings.voice_to_text) || {}).hf || {})
          },
          localTransformers: {
            ...DEFAULT_SETTINGS.voice_to_text.localTransformers,
            ...(((settings && settings.voice_to_text) || {}).localTransformers || {})
          },
          catalogRefs: {
            ...DEFAULT_SETTINGS.voice_to_text.catalogRefs,
            ...(((settings && settings.voice_to_text) || {}).catalogRefs || {})
          }
        }
      };
    }
  } catch (err) {
    logger.error('[Settings] Error loading settings:', err.message);
  }
  logger.debug('[Settings] Using default settings');
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to disk
 * @param {string} projectRoot - Project root directory
 * @param {Object} settings - Settings to save
 * @returns {Object} Result { success: boolean, error?: string }
 */
function saveSettings(projectRoot, settings) {
  const settingsPath = getSettingsPath(projectRoot);
  
  try {
    // Ensure models directory exists
    const modelsDir = path.dirname(settingsPath);
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }
    
    // Update timestamps
    settings.updated_at = new Date().toISOString();
    if (!settings.created_at) {
      settings.created_at = settings.updated_at;
    }
    
    // Write file
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    logger.info('[Settings] Saved settings to:', settingsPath);
    
    return { success: true };
  } catch (err) {
    logger.error('[Settings] Error saving settings:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get HuggingFace API token
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Token or null if not set
 */
function getHuggingFaceToken(projectRoot) {
  const settings = loadSettings(projectRoot);
  const token = settings.huggingface_token || null;
  if (token) {
    logger.debug('[Settings] HuggingFace token found (length:', token.length, ')');
  }
  return token;
}

/**
 * Set HuggingFace API token
 * @param {string} projectRoot - Project root directory
 * @param {string} token - HuggingFace token
 * @returns {Object} Result { success: boolean, error?: string }
 */
function setHuggingFaceToken(projectRoot, token) {
  const settings = loadSettings(projectRoot);
  settings.huggingface_token = token || '';
  return saveSettings(projectRoot, settings);
}

/**
 * Check if HuggingFace token is configured
 * @param {string} projectRoot - Project root directory
 * @returns {boolean} True if token is set
 */
function hasHuggingFaceToken(projectRoot) {
  const token = getHuggingFaceToken(projectRoot);
  return !!(token && token.length > 0);
}

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Get theme from settings
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Theme object
 */
function getTheme(projectRoot) {
  const settings = loadSettings(projectRoot);
  return settings.theme || { ...DEFAULT_THEME };
}

/**
 * Set theme in settings
 * @param {string} projectRoot - Project root directory
 * @param {Object} theme - Theme object
 * @returns {Object} Result { success: boolean, error?: string }
 */
function setTheme(projectRoot, theme) {
  const settings = loadSettings(projectRoot);
  settings.theme = { ...DEFAULT_THEME, ...theme };
  return saveSettings(projectRoot, settings);
}

/**
 * Get GPU monitor enabled state from settings
 * @param {string} projectRoot - Project root directory
 * @returns {boolean} Whether GPU monitor is enabled
 */
function getGpuMonitorEnabled(projectRoot) {
  const settings = loadSettings(projectRoot);
  return settings.gpuMonitorEnabled || false;
}

function getInferenceBackend(projectRoot) {
  const settings = loadSettings(projectRoot);
  const raw = String(settings.inference_backend || 'ollama').trim().toLowerCase();
  return raw === 'llama-cpp' ? 'llama-cpp' : 'ollama';
}

function setInferenceBackend(projectRoot, backend) {
  const settings = loadSettings(projectRoot);
  const normalized = String(backend || '').trim().toLowerCase();
  settings.inference_backend = normalized === 'llama-cpp' ? 'llama-cpp' : 'ollama';
  return saveSettings(projectRoot, settings);
}

function getServiceNetworkPolicy(projectRoot) {
  const settings = loadSettings(projectRoot);
  const raw = String(settings.service_network_policy || 'privacy').trim().toLowerCase();
  if (raw === 'allow' || raw === 'strict-offline') return raw;
  return 'privacy';
}

function setServiceNetworkPolicy(projectRoot, policyMode) {
  const settings = loadSettings(projectRoot);
  const raw = String(policyMode || 'privacy').trim().toLowerCase();
  settings.service_network_policy = (raw === 'allow' || raw === 'strict-offline') ? raw : 'privacy';
  return saveSettings(projectRoot, settings);
}

/**
 * Set GPU monitor enabled state in settings
 * @param {string} projectRoot - Project root directory
 * @param {boolean} enabled - Whether GPU monitor should be enabled
 * @returns {Object} Result { success: boolean, error?: string }
 */
function setGpuMonitorEnabled(projectRoot, enabled) {
  const settings = loadSettings(projectRoot);
  settings.gpuMonitorEnabled = !!enabled;
  return saveSettings(projectRoot, settings);
}

/**
 * Get settings without sensitive data (for compilation)
 * Strips HuggingFace token but keeps theme
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Settings object without sensitive data
 */
function getSettingsForCompilation(projectRoot) {
  const settings = loadSettings(projectRoot);
  return {
    theme: settings.theme || { ...DEFAULT_THEME },
    gpuMonitorEnabled: settings.gpuMonitorEnabled || false,
    created_at: settings.created_at,
    updated_at: settings.updated_at
    // Note: huggingface_token intentionally omitted
  };
}

module.exports = {
  loadSettings,
  getSettings: loadSettings,  // Alias for IPC handler compatibility
  saveSettings,
  getSettingsPath,
  getHuggingFaceToken,
  getHFToken: getHuggingFaceToken,  // Alias for IPC handler compatibility
  setHuggingFaceToken,
  hasHuggingFaceToken,
  getTheme,
  setTheme,
  getGpuMonitorEnabled,
  setGpuMonitorEnabled,
  getInferenceBackend,
  setInferenceBackend,
  getServiceNetworkPolicy,
  setServiceNetworkPolicy,
  getSettingsForCompilation,
  DEFAULT_SETTINGS,
  DEFAULT_THEME
};
