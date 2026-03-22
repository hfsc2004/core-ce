/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * ============================================================================
 * MOE CONFIGURATION MANAGER
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const constants = require('./moe-config-constants');
const { validateConfig } = require('./moe-config-validation');
const {
  ensureItemDefaults,
  createEmptyConfig,
  createStarterPipeline
} = require('./moe-config-templates');

const {
  CONFIG_FILENAME,
  LEGACY_CONFIG_FILENAME,
  PROFILES_DIRNAME,
  LEGACY_PROFILES_DIRNAME,
  DEFAULT_PROFILE_NAME,
  CURRENT_SCHEMA_VERSION,
  VALID_ITEM_TYPES,
  VALID_ROUTING_MODES,
  VALID_CHANNEL_DIRECTIONS,
  VALID_CHANNEL_FLOW_CONDITIONS,
  VALID_CHANNEL_FAILURE_POLICIES,
  VALID_GATEWAY_POSITIONS
} = constants;

function saveConfig(pipelineConfig, appPath, options = {}) {
  try {
    const profileName = typeof options === 'string'
      ? normalizeProfileName(options)
      : normalizeProfileName(options?.profileName);

    const validation = validateConfig(pipelineConfig);
    if (!validation.valid) {
      return {
        success: false,
        message: `Validation failed: ${validation.errors.join(', ')}`
      };
    }

    const configToSave = {
      ...pipelineConfig,
      version: CURRENT_SCHEMA_VERSION,
      lastModified: new Date().toISOString()
    };

    const configPath = getProfilePath(appPath, profileName);
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8');

    console.log(`[MoE Config] 💾 Saved to: ${configPath}`);

    return {
      success: true,
      profileName,
      path: configPath,
      itemCount: pipelineConfig.items?.length || 0
    };
  } catch (err) {
    console.error('[MoE Config] Save error:', err);
    return {
      success: false,
      message: `Save failed: ${err.message}`
    };
  }
}

function loadConfig(appPath, options = {}) {
  try {
    const profileName = typeof options === 'string'
      ? normalizeProfileName(options)
      : normalizeProfileName(options?.profileName);
    const requestedPath = getProfilePath(appPath, profileName);
    const legacyRequestedPath = getLegacyProfilePath(appPath, profileName);
    const primaryPath = profileName === DEFAULT_PROFILE_NAME
      ? getConfigPath(appPath)
      : requestedPath;
    const fallbackPath = profileName === DEFAULT_PROFILE_NAME
      ? getLegacyConfigPath(appPath)
      : legacyRequestedPath;
    const configPath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;

    if (!fs.existsSync(configPath)) {
      console.log('[MoE Config] No saved configuration found');
      return null;
    }

    const data = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(data);

    const migrated = migrateConfig(config);
    const validation = validateConfig(migrated);
    if (!validation.valid) {
      console.warn('[MoE Config] Loaded config has validation issues:', validation.errors);
    }

    console.log(`[MoE Config] 📂 Loaded ${migrated.items?.length || 0} items`);

    return migrated;
  } catch (err) {
    console.error('[MoE Config] Load error:', err);
    return null;
  }
}

function getConfigPath(appPath) {
  return path.join(appPath, '..', CONFIG_FILENAME);
}

function getLegacyConfigPath(appPath) {
  return path.join(appPath, '..', LEGACY_CONFIG_FILENAME);
}

function getProfilesDir(appPath) {
  return path.join(appPath, '..', PROFILES_DIRNAME);
}

function getLegacyProfilesDir(appPath) {
  return path.join(appPath, '..', LEGACY_PROFILES_DIRNAME);
}

function normalizeProfileName(profileName) {
  const raw = String(profileName || '').trim();
  if (!raw) return DEFAULT_PROFILE_NAME;
  return raw
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || DEFAULT_PROFILE_NAME;
}

function getProfilePath(appPath, profileName = DEFAULT_PROFILE_NAME) {
  return path.join(getProfilesDir(appPath), `${normalizeProfileName(profileName)}.json`);
}

function getLegacyProfilePath(appPath, profileName = DEFAULT_PROFILE_NAME) {
  return path.join(getLegacyProfilesDir(appPath), `${normalizeProfileName(profileName)}.json`);
}

function configExists(appPath) {
  return fs.existsSync(getConfigPath(appPath)) || fs.existsSync(getLegacyConfigPath(appPath));
}

function listConfigs(appPath) {
  const out = [];
  const seen = new Set();
  const pushProfile = (profileName, configPath) => {
    const name = normalizeProfileName(profileName);
    if (seen.has(name)) return;
    seen.add(name);
    const meta = readProfileMetadata(configPath);
    out.push({
      profileName: name,
      path: configPath,
      isDefault: name === DEFAULT_PROFILE_NAME,
      itemCount: meta.itemCount,
      lastModified: meta.lastModified
    });
  };

  try {
    const currentDefaultPath = getConfigPath(appPath);
    if (fs.existsSync(currentDefaultPath)) {
      pushProfile(DEFAULT_PROFILE_NAME, currentDefaultPath);
    }

    const legacyPath = getLegacyConfigPath(appPath);
    if (fs.existsSync(legacyPath)) {
      pushProfile(DEFAULT_PROFILE_NAME, legacyPath);
    }

    const profilesDir = getProfilesDir(appPath);
    const profileDirs = [profilesDir, getLegacyProfilesDir(appPath)];
    for (const profileDir of profileDirs) {
      if (!fs.existsSync(profileDir)) continue;
      const entries = fs.readdirSync(profileDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith('.json')) continue;
        const profileName = entry.name.replace(/\.json$/i, '');
        pushProfile(profileName, path.join(profileDir, entry.name));
      }
    }
  } catch (err) {
    console.warn('[MoE Config] listConfigs warning:', err.message);
  }

  return out.sort((a, b) => a.profileName.localeCompare(b.profileName));
}

function readProfileMetadata(configPath) {
  try {
    const stat = fs.statSync(configPath);
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const itemCount = Array.isArray(data?.items) ? data.items.length : 0;
    const lastModified = String(data?.lastModified || '').trim() || stat.mtime.toISOString();
    return { itemCount, lastModified };
  } catch {
    return { itemCount: null, lastModified: null };
  }
}

function deleteConfig(appPath, options = {}) {
  try {
    const profileName = typeof options === 'string'
      ? normalizeProfileName(options)
      : normalizeProfileName(options?.profileName);
    const targets = [getProfilePath(appPath, profileName), getLegacyProfilePath(appPath, profileName)];
    if (profileName === DEFAULT_PROFILE_NAME) {
      targets.push(getConfigPath(appPath), getLegacyConfigPath(appPath));
    }

    let removedAny = false;
    for (const configPath of targets) {
      if (!fs.existsSync(configPath)) continue;
      fs.unlinkSync(configPath);
      removedAny = true;
    }
    if (removedAny) {
      console.log(`[MoE Config] 🗑️ Configuration deleted (${profileName})`);
    }
    return removedAny;
  } catch (err) {
    console.error('[MoE Config] Delete error:', err);
    return false;
  }
}

function migrateConfig(config) {
  if (!config) return config;

  if (Array.isArray(config.items)) {
    config.items = config.items.map(item => ensureItemDefaults(item));
  }

  config.version = CURRENT_SCHEMA_VERSION;
  return config;
}

module.exports = {
  saveConfig,
  loadConfig,
  listConfigs,
  getConfigPath,
  getLegacyConfigPath,
  getProfilesDir,
  getLegacyProfilesDir,
  getProfilePath,
  getLegacyProfilePath,
  normalizeProfileName,
  configExists,
  deleteConfig,
  validateConfig,
  migrateConfig,
  createEmptyConfig,
  createStarterPipeline,
  CONFIG_FILENAME,
  PROFILES_DIRNAME,
  DEFAULT_PROFILE_NAME,
  CURRENT_SCHEMA_VERSION,
  VALID_ITEM_TYPES,
  VALID_ROUTING_MODES,
  VALID_CHANNEL_DIRECTIONS,
  VALID_CHANNEL_FLOW_CONDITIONS,
  VALID_CHANNEL_FAILURE_POLICIES,
  VALID_GATEWAY_POSITIONS
};
