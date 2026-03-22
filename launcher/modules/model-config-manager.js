/**
 * MODEL CONFIG MANAGER
 * Backend module for Modelfile storage and Ollama registry integration
 * @module model-config-manager
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

const fs = require('fs');
const path = require('path');
const ollamaRegistry = require('./ollama-registry');

/**
 * Get the config directory for a collection
 * @param {string} appDir - Application directory
 * @param {string} collection - Collection ID
 * @returns {string} Config directory path
 */
function getConfigDir(appDir, collection) {
  const configDir = path.join(appDir, '..', 'models', collection, 'configs');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return configDir;
}

/**
 * Get the Modelfile path for a model
 * @param {string} appDir - Application directory
 * @param {string} collection - Collection ID
 * @param {string} modelId - Model ID
 * @returns {string} Modelfile path
 */
function getModelfilePath(appDir, collection, modelId) {
  const configDir = getConfigDir(appDir, collection);
  return path.join(configDir, `${modelId}.Modelfile`);
}

/**
 * Get the cached config path for a model
 * @param {string} appDir - Application directory
 * @param {string} collection - Collection ID
 * @param {string} modelId - Model ID
 * @returns {string} Cached config path
 */
function getCachedConfigPath(appDir, collection, modelId) {
  const configDir = getConfigDir(appDir, collection);
  return path.join(configDir, `${modelId}.ollama-config.json`);
}

/**
 * Load a saved Modelfile
 * @param {string} appDir - Application directory
 * @param {string} collection - Collection ID
 * @param {string} modelId - Model ID
 * @returns {Object} Result with modelfile content and cached config
 */
function loadModelfile(appDir, collection, modelId) {
  try {
    const modelfilePath = getModelfilePath(appDir, collection, modelId);
    const cachedConfigPath = getCachedConfigPath(appDir, collection, modelId);
    
    let modelfile = null;
    let cachedConfig = null;
    
    if (fs.existsSync(modelfilePath)) {
      modelfile = fs.readFileSync(modelfilePath, 'utf8');
      console.log(`[Model Config] Loaded Modelfile: ${modelfilePath}`);
    }
    
    if (fs.existsSync(cachedConfigPath)) {
      cachedConfig = JSON.parse(fs.readFileSync(cachedConfigPath, 'utf8'));
    }
    
    return {
      success: true,
      modelfile: modelfile,
      cachedConfig: cachedConfig
    };
  } catch (err) {
    console.error('[Model Config] Error loading Modelfile:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Save a Modelfile
 * @param {string} appDir - Application directory
 * @param {string} collection - Collection ID
 * @param {string} modelId - Model ID
 * @param {string} modelfileContent - Modelfile content
 * @param {Object} cachedConfig - Optional cached Ollama config
 * @returns {Object} Result
 */
function saveModelfile(appDir, collection, modelId, modelfileContent, cachedConfig = null) {
  try {
    const modelfilePath = getModelfilePath(appDir, collection, modelId);
    const cachedConfigPath = getCachedConfigPath(appDir, collection, modelId);
    
    // Ensure directory exists
    const configDir = path.dirname(modelfilePath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Save Modelfile
    fs.writeFileSync(modelfilePath, modelfileContent, 'utf8');
    console.log(`[Model Config] Saved Modelfile: ${modelfilePath}`);
    
    // Save cached config if provided
    if (cachedConfig) {
      fs.writeFileSync(cachedConfigPath, JSON.stringify(cachedConfig, null, 2), 'utf8');
      console.log(`[Model Config] Saved cached config: ${cachedConfigPath}`);
    }
    
    return { success: true, path: modelfilePath };
  } catch (err) {
    console.error('[Model Config] Error saving Modelfile:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Fetch config from Ollama registry
 * @param {string} appDir - Application directory
 * @param {string} ollamaModel - Ollama model name (e.g., 'llama3.2:8b-instruct-q4_K_M')
 * @param {string} collection - Collection ID
 * @param {string} modelId - Model ID
 * @returns {Promise<Object>} Result with config
 */
async function fetchOllamaConfig(appDir, ollamaModel, collection, modelId) {
  try {
    console.log(`[Model Config] Fetching config for: ${ollamaModel}`);
    
    const config = await ollamaRegistry.fetchModelConfig(ollamaModel);
    
    // Save to cache
    const cachedConfigPath = getCachedConfigPath(appDir, collection, modelId);
    const configDir = path.dirname(cachedConfigPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(cachedConfigPath, JSON.stringify(config, null, 2), 'utf8');
    
    console.log(`[Model Config] Cached config for ${ollamaModel}`);
    
    return {
      success: true,
      config: config
    };
  } catch (err) {
    console.error('[Model Config] Error fetching Ollama config:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Parse system prompt from a Modelfile
 * @param {string} modelfileContent - Modelfile content
 * @returns {string|null} System prompt or null
 */
function parseSystemPrompt(modelfileContent) {
  if (!modelfileContent) return null;
  
  // Match SYSTEM """...""" format
  const tripleQuoteMatch = modelfileContent.match(/SYSTEM\s+"""([\s\S]*?)"""/i);
  if (tripleQuoteMatch) {
    return tripleQuoteMatch[1].trim();
  }
  
  // Match SYSTEM "..." format (single line)
  const singleQuoteMatch = modelfileContent.match(/SYSTEM\s+"([^"]+)"/i);
  if (singleQuoteMatch) {
    return singleQuoteMatch[1].trim();
  }
  
  return null;
}

/**
 * Get the system prompt for a model (from saved Modelfile)
 * @param {string} appDir - Application directory
 * @param {string} collection - Collection ID
 * @param {string} modelId - Model ID
 * @returns {string|null} System prompt or null
 */
function getSystemPrompt(appDir, collection, modelId) {
  try {
    const result = loadModelfile(appDir, collection, modelId);
    if (result.success && result.modelfile) {
      return parseSystemPrompt(result.modelfile);
    }
    return null;
  } catch (err) {
    console.error('[Model Config] Error getting system prompt:', err.message);
    return null;
  }
}

/**
 * Parse all parameters from a Modelfile
 * @param {string} modelfileContent - Modelfile content
 * @returns {Object} Parameters object
 */
function parseModelfileParams(modelfileContent) {
  if (!modelfileContent) return {};
  
  const params = {};
  const lines = modelfileContent.split('\n');
  
  for (const line of lines) {
    const paramMatch = line.match(/^PARAMETER\s+(\w+)\s+(.+)$/i);
    if (paramMatch) {
      const key = paramMatch[1].toLowerCase();
      let value = paramMatch[2].trim().replace(/^["']|["']$/g, '');
      
      // Try to parse as number
      if (!isNaN(value)) {
        value = parseFloat(value);
      }
      
      // Handle arrays (like stop sequences)
      if (params[key] !== undefined) {
        if (!Array.isArray(params[key])) {
          params[key] = [params[key]];
        }
        params[key].push(value);
      } else {
        params[key] = value;
      }
    }
  }
  
  return params;
}

/**
 * Get full model config for launching
 * @param {string} appDir - Application directory
 * @param {string} collection - Collection ID
 * @param {string} modelId - Model ID
 * @returns {Object} Config with system prompt and parameters
 */
function getModelConfig(appDir, collection, modelId) {
  try {
    const result = loadModelfile(appDir, collection, modelId);
    
    if (result.success && result.modelfile) {
      return {
        success: true,
        systemPrompt: parseSystemPrompt(result.modelfile),
        params: parseModelfileParams(result.modelfile),
        modelfile: result.modelfile
      };
    }
    
    return { success: false, message: 'No Modelfile found' };
  } catch (err) {
    console.error('[Model Config] Error getting model config:', err.message);
    return { success: false, message: err.message };
  }
}

module.exports = {
  loadModelfile,
  saveModelfile,
  fetchOllamaConfig,
  getSystemPrompt,
  getModelConfig,
  parseSystemPrompt,
  parseModelfileParams,
  getModelfilePath,
  getConfigDir
};
