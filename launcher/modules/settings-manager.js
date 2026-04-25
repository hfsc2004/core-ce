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
const HF_ENV_KEYS = ['HUGGINGFACE_TOKEN', 'HF_TOKEN', 'HF_HUB_TOKEN', 'HUGGINGFACE_HUB_TOKEN'];
const PRIMARY_HF_ENV_KEY = 'HUGGINGFACE_TOKEN';

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

function getEnvPath(projectRoot) {
  return path.join(projectRoot, '..', '.env');
}

function parseEnvContent(content) {
  const map = {};
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith('\'') && value.endsWith('\'') && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function encodeEnvValue(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (/^[A-Za-z0-9._~:/@+-]+$/.test(raw)) return raw;
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    api_keys: {
      ...DEFAULT_SETTINGS.api_keys,
      ...((settings && settings.api_keys) || {}),
      openai_compatible: {
        ...DEFAULT_SETTINGS.api_keys.openai_compatible,
        ...(((settings && settings.api_keys) || {}).openai_compatible || {})
      },
      vllm: {
        ...DEFAULT_SETTINGS.api_keys.vllm,
        ...(((settings && settings.api_keys) || {}).vllm || {})
      },
      exllamav2: {
        ...DEFAULT_SETTINGS.api_keys.exllamav2,
        ...(((settings && settings.api_keys) || {}).exllamav2 || {})
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

function loadSettingsFromDisk(projectRoot) {
  const settingsPath = getSettingsPath(projectRoot);
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      logger.debug('[Settings] Loaded settings from:', settingsPath);
      return normalizeSettings(settings);
    }
  } catch (err) {
    logger.error('[Settings] Error loading settings:', err.message);
  }
  logger.debug('[Settings] Using default settings');
  return normalizeSettings({});
}

function stripLegacyHuggingFaceTokenFromSettingsFile(projectRoot) {
  const settingsPath = getSettingsPath(projectRoot);
  try {
    if (!fs.existsSync(settingsPath)) return;
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Object.prototype.hasOwnProperty.call(parsed, 'huggingface_token')) return;
    delete parsed.huggingface_token;
    fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2), 'utf8');
  } catch (err) {
    logger.warn('[Settings] Failed to remove legacy huggingface_token from settings file:', err.message);
  }
}

/**
 * Load settings from disk
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Settings object
 */
function loadSettings(projectRoot) {
  const settings = loadSettingsFromDisk(projectRoot);
  const token = getHuggingFaceToken(projectRoot, settings) || '';
  return { ...settings, huggingface_token: token };
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
    const next = { ...(settings || {}) };
    if (Object.prototype.hasOwnProperty.call(next, 'huggingface_token')) {
      const requestedToken = String(next.huggingface_token || '').trim();
      const currentToken = String(getHuggingFaceToken(projectRoot) || '').trim();
      if (requestedToken !== currentToken) {
        const tokenResult = setHuggingFaceToken(projectRoot, requestedToken);
        if (!tokenResult?.success) {
          return tokenResult;
        }
      }
    }
    delete next.huggingface_token;

    // Ensure models directory exists
    const modelsDir = path.dirname(settingsPath);
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }
    
    // Update timestamps
    next.updated_at = new Date().toISOString();
    if (!next.created_at) {
      next.created_at = next.updated_at;
    }
    
    // Write file
    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), 'utf8');
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
function getHuggingFaceToken(projectRoot, cachedSettings = null) {
  for (const key of HF_ENV_KEYS) {
    const fromProcess = String(process.env[key] || '').trim();
    if (fromProcess) {
      if (key !== PRIMARY_HF_ENV_KEY) {
        process.env[PRIMARY_HF_ENV_KEY] = fromProcess;
      }
      return fromProcess;
    }
  }

  try {
    const envPath = getEnvPath(projectRoot);
    if (fs.existsSync(envPath)) {
      const envMap = parseEnvContent(fs.readFileSync(envPath, 'utf8'));
      for (const key of HF_ENV_KEYS) {
        const fromFile = String(envMap[key] || '').trim();
        if (fromFile) {
          process.env[PRIMARY_HF_ENV_KEY] = fromFile;
          return fromFile;
        }
      }
    }
  } catch (err) {
    logger.warn('[Settings] Failed reading .env for HuggingFace token:', err.message);
  }

  const sourceSettings = cachedSettings || loadSettingsFromDisk(projectRoot);
  const legacyToken = String(sourceSettings.huggingface_token || '').trim();
  if (legacyToken) {
    // One-time migration from settings JSON to hidden .env
    setHuggingFaceToken(projectRoot, legacyToken);
    const migrated = String(process.env[PRIMARY_HF_ENV_KEY] || '').trim();
    if (migrated) return migrated;
  }

  return null;
}

/**
 * Set HuggingFace API token
 * @param {string} projectRoot - Project root directory
 * @param {string} token - HuggingFace token
 * @returns {Object} Result { success: boolean, error?: string }
 */
function setHuggingFaceToken(projectRoot, token) {
  const normalizedToken = String(token || '').trim();
  const envPath = getEnvPath(projectRoot);

  try {
    if (!normalizedToken && !fs.existsSync(envPath)) {
      delete process.env[PRIMARY_HF_ENV_KEY];
      for (const key of HF_ENV_KEYS) {
        if (key !== PRIMARY_HF_ENV_KEY) delete process.env[key];
      }
      stripLegacyHuggingFaceTokenFromSettingsFile(projectRoot);
      return { success: true };
    }

    const lines = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
      : [];
    const nextLines = [];
    let wrotePrimary = false;

    for (const line of lines) {
      const idx = line.indexOf('=');
      const trimmed = line.trim();
      if (idx <= 0 || trimmed.startsWith('#')) {
        nextLines.push(line);
        continue;
      }

      const key = line.slice(0, idx).trim();
      if (!HF_ENV_KEYS.includes(key)) {
        nextLines.push(line);
        continue;
      }

      if (key === PRIMARY_HF_ENV_KEY && normalizedToken && !wrotePrimary) {
        nextLines.push(`${PRIMARY_HF_ENV_KEY}=${encodeEnvValue(normalizedToken)}`);
        wrotePrimary = true;
      }
      // Drop all other HF token aliases from file to avoid duplicate sources.
    }

    if (normalizedToken && !wrotePrimary) {
      if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== '') {
        nextLines.push('');
      }
      nextLines.push(`${PRIMARY_HF_ENV_KEY}=${encodeEnvValue(normalizedToken)}`);
    }

    const content = `${nextLines.join('\n').replace(/\n*$/, '')}\n`;
    fs.writeFileSync(envPath, content, 'utf8');

    if (normalizedToken) {
      process.env[PRIMARY_HF_ENV_KEY] = normalizedToken;
    } else {
      delete process.env[PRIMARY_HF_ENV_KEY];
    }
    for (const key of HF_ENV_KEYS) {
      if (key !== PRIMARY_HF_ENV_KEY) delete process.env[key];
    }
    stripLegacyHuggingFaceTokenFromSettingsFile(projectRoot);

    return { success: true };
  } catch (err) {
    logger.error('[Settings] Error writing HuggingFace token to .env:', err.message);
    return { success: false, error: err.message };
  }
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
