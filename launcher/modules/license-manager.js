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

function normalizeLicenseName(filename) {
  return path.basename(String(filename || '').trim());
}

function resolveLicensePath(projectRoot, filename) {
  const normalized = normalizeLicenseName(filename);
  if (!normalized) return null;

  const licensesDir = path.join(projectRoot, 'licenses');
  const candidates = [];

  // Primary locations
  candidates.push(path.join(licensesDir, normalized));
  candidates.push(path.join(projectRoot, normalized));

  // Compatibility: allow callers that still pass *.txt when repo ships LICENSE/NOTICE.
  if (/\.txt$/i.test(normalized)) {
    const withoutTxt = normalized.replace(/\.txt$/i, '');
    candidates.push(path.join(licensesDir, withoutTxt));
    candidates.push(path.join(projectRoot, withoutTxt));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

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

    const discovered = new Set();

    // Read all .txt files in licenses directory when present.
    if (fs.existsSync(licensesDir)) {
      fs.readdirSync(licensesDir)
        .filter((f) => f.endsWith('.txt'))
        .forEach((f) => discovered.add(f));
    }

    // Backward-compatible root-level license files.
    ['LICENSE', 'NOTICE'].forEach((name) => {
      const full = path.join(projectRoot, name);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        discovered.add(name);
      }
    });

    const files = Array.from(discovered).sort();
    
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
    const licensePath = resolveLicensePath(projectRoot, filename);
    
    // Validate file exists
    if (!licensePath) {
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
    return Boolean(resolveLicensePath(projectRoot, filename));
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
    const licensePath = resolveLicensePath(projectRoot, filename);
    
    if (!licensePath) {
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
