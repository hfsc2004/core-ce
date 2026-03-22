/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Compile manager config persistence helpers.
 */
'use strict';

const fs = require('fs');
const path = require('path');

async function listCompileConfigs(fromPath) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const configsDir = path.join(projectRoot, 'compile-configs');
    
    if (!fs.existsSync(configsDir)) {
      return { success: true, configs: [], message: 'No configurations found' };
    }
    
    const files = fs.readdirSync(configsDir).filter(f => f.endsWith('.json'));
    const configs = files.map(f => {
      const configPath = path.join(configsDir, f);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        name: f.replace('.json', ''),
        ...config
      };
    });
    
    return { success: true, configs, message: `Found ${configs.length} configurations` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Save a compile configuration
 * 
 * @param {string} fromPath - Path to calculate from
 * @param {Object} config - Configuration to save
 * @returns {Promise<Object>} { success, message }
 */
async function saveCompileConfig(fromPath, config) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const configsDir = path.join(projectRoot, 'compile-configs');
    
    if (!fs.existsSync(configsDir)) {
      fs.mkdirSync(configsDir, { recursive: true });
    }
    
    const configPath = path.join(configsDir, `${config.name}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    return { success: true, message: `Configuration saved: ${config.name}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Load a compile configuration
 * 
 * @param {string} fromPath - Path to calculate from
 * @param {string} configName - Name of configuration to load
 * @returns {Promise<Object>} { success, config, message }
 */
async function loadCompileConfig(fromPath, configName) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const configPath = path.join(projectRoot, 'compile-configs', `${configName}.json`);
    
    if (!fs.existsSync(configPath)) {
      return { success: false, message: `Configuration not found: ${configName}` };
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { success: true, config, message: `Loaded: ${configName}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Delete a compile configuration
 * 
 * @param {string} fromPath - Path to calculate from
 * @param {string} configName - Name of configuration to delete
 * @returns {Promise<Object>} { success, message }
 */
async function deleteCompileConfig(fromPath, configName) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const configPath = path.join(projectRoot, 'compile-configs', `${configName}.json`);
    
    if (!fs.existsSync(configPath)) {
      return { success: false, message: `Configuration not found: ${configName}` };
    }
    
    fs.unlinkSync(configPath);
    return { success: true, message: `Deleted: ${configName}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  listCompileConfigs,
  saveCompileConfig,
  loadCompileConfig,
  deleteCompileConfig
};
