/**
 * Pseudo Science Fiction Core Collection - License Manager Module
 * 
 * Simple license file management for viewing open source licenses
 * included with the Archive Collection.
 * 
 * Features:
 * - List all license files
 * - Read license file contents
 * - Validate license file existence
 * 
 * @module license-manager
 * @version 1.1.3 - March 5, 2026
 * @license SEE LICENSE.txt
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// License File Operations
// ============================================================================

/**
 * Get list of all license files
 * 
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {Promise<Object>} { success, files, message }
 */
async function getLicenseFiles(fromPath) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const licensesDir = path.join(projectRoot, 'licenses');
    
    // Check if licenses directory exists
    if (!fs.existsSync(licensesDir)) {
      return { success: true, files: [], message: 'No licenses directory found' };
    }
    
    // Read all .txt files in licenses directory
    const files = fs.readdirSync(licensesDir)
      .filter(f => f.endsWith('.txt'))
      .sort();
    
    console.log(`[License Manager] Found ${files.length} license files`);
    
    return { success: true, files };
  } catch (err) {
    console.error('[License Manager] Error reading license files:', err);
    return { success: false, message: err.message, files: [] };
  }
}

/**
 * Get content of a specific license file
 * 
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} filename - License filename (e.g., 'MIT.txt')
 * @returns {Promise<Object>} { success, content, message }
 */
async function getLicenseContent(fromPath, filename) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const licensePath = path.join(projectRoot, 'licenses', filename);
    
    // Validate file exists
    if (!fs.existsSync(licensePath)) {
      return { success: false, message: 'License file not found' };
    }
    
    // Read license content
    const content = fs.readFileSync(licensePath, 'utf-8');
    console.log(`[License Manager] Read license: ${filename}`);
    
    return { success: true, content };
  } catch (err) {
    console.error(`[License Manager] Error reading license ${filename}:`, err);
    return { success: false, message: err.message };
  }
}

/**
 * Check if a license file exists
 * 
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} filename - License filename to check
 * @returns {Promise<boolean>} True if file exists
 */
async function licenseExists(fromPath, filename) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const licensePath = path.join(projectRoot, 'licenses', filename);
    return fs.existsSync(licensePath);
  } catch (err) {
    console.error('[License Manager] Error checking license existence:', err);
    return false;
  }
}

/**
 * Get information about a license file
 * 
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} filename - License filename
 * @returns {Promise<Object>} { success, filename, size, lines, message }
 */
async function getLicenseInfo(fromPath, filename) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const licensePath = path.join(projectRoot, 'licenses', filename);
    
    if (!fs.existsSync(licensePath)) {
      return { success: false, message: 'License file not found' };
    }
    
    const stats = fs.statSync(licensePath);
    const content = fs.readFileSync(licensePath, 'utf-8');
    const lines = content.split('\n').length;
    
    return {
      success: true,
      filename,
      sizeBytes: stats.size,
      sizeKB: (stats.size / 1024).toFixed(2),
      lines,
      modified: stats.mtime
    };
  } catch (err) {
    console.error(`[License Manager] Error getting license info for ${filename}:`, err);
    return { success: false, message: err.message };
  }
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // License file operations
  getLicenseFiles,
  getLicenseContent,
  licenseExists,
  getLicenseInfo
};
