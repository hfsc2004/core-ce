/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Compile manager app copy and obfuscation operations.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getEditionCopyPolicy, verifyEditionPackaging } = require('./compile-manager-edition-policy.js');

let obfuscator = null;
try {
  obfuscator = require('./compile-obfuscator.js');
} catch (err) {
  console.log('[Compile Manager] Obfuscator not available:', err.message);
}

async function copyAppFiles(fromPath, destAppDir, destSrcDir, destAssetsDir, progressCallback = null, options = {}) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
  };

  const { edition, policy } = getEditionCopyPolicy(options.edition || 'standard');
  const strictExclusion = options.strictExclusion !== false;

  sendProgress('Copying app files...', 50, `Edition: ${edition}`);

  for (const relPath of policy.coreFiles || []) {
    const srcPath = path.join(fromPath, relPath);
    const destPath = path.join(destSrcDir, path.basename(relPath));
    if (fs.existsSync(srcPath)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      sendProgress('Copying app files...', 85, `Copied: ${relPath}`);
    } else {
      console.warn(`[Compile Manager] Warning: Source file not found: ${srcPath}`);
    }
  }

  // Copy edition preload and standardize destination name to preload.js
  const preloadSrc = path.join(fromPath, policy.preloadPrimary || 'preload.js');
  const preloadDest = path.join(destAppDir, 'preload.js');
  if (fs.existsSync(preloadSrc)) {
    fs.copyFileSync(preloadSrc, preloadDest);
    sendProgress('Copying app files...', 55, `Copied: ${path.basename(preloadSrc)} -> preload.js`);
  } else {
    const fallbackRel = policy.preloadFallback;
    if (fallbackRel) {
      const fallbackSrc = path.join(fromPath, fallbackRel);
      if (fs.existsSync(fallbackSrc)) {
        fs.copyFileSync(fallbackSrc, preloadDest);
        sendProgress('Copying app files...', 55, `Copied: ${fallbackRel} (fallback)`);
      } else {
        console.warn('[Compile Manager] Warning: No preload file found!');
      }
    }
  }

  // Copy renderer JS files
  const rendererSrcDir = path.join(fromPath, 'src', 'renderer');
  const rendererDestDir = path.join(destSrcDir, 'renderer');
  fs.mkdirSync(rendererDestDir, { recursive: true });

  for (const file of policy.rendererFiles || []) {
    const srcPath = path.join(rendererSrcDir, file);
    const destPath = path.join(rendererDestDir, file);

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      sendProgress('Copying app files...', 90, `Copied renderer: ${file}`);
    } else {
      console.warn(`[Compile Manager] Warning: Renderer file not found: ${srcPath}`);
    }
  }
  
  // Copy assets
  const assetsPath = path.join(fromPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    const assetFiles = fs.readdirSync(assetsPath);
    for (const file of assetFiles) {
      fs.copyFileSync(
        path.join(assetsPath, file),
        path.join(destAssetsDir, file)
      );
    }
    sendProgress('Copying app files...', 92, `Copied ${assetFiles.length} assets`);
  }

  for (const fileSpec of policy.rootFiles || []) {
    const srcPath = path.join(fromPath, fileSpec.src);
    const destPath = path.join(destAppDir, fileSpec.dest || path.basename(fileSpec.src));
    if (fs.existsSync(srcPath)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      sendProgress('Copying app files...', 95, fileSpec.logSuccess || `Copied: ${fileSpec.src}`);
    } else {
      const warning = `[Compile Manager] Warning: ${fileSpec.src} not found`;
      if (fileSpec.required) throw new Error(warning);
      console.warn(warning);
    }
  }

  for (const dirSpec of policy.moduleDirs || []) {
    const srcDir = path.join(fromPath, dirSpec.src);
    const destDir = path.join(destAppDir, dirSpec.dest || dirSpec.src);
    if (!fs.existsSync(srcDir)) {
      const warning = `[Compile Manager] Warning: ${dirSpec.src} not found`;
      if (dirSpec.required) throw new Error(warning);
      console.warn(warning);
      continue;
    }

    fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir);
    let copiedCount = 0;
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry);
      const destPath = path.join(destDir, entry);
      if (dirSpec.filesOnly && !fs.statSync(srcPath).isFile()) {
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
      copiedCount++;
    }
    sendProgress('Copying app files...', 96, `Copied ${dirSpec.src} (${copiedCount} files)`);
  }

  if (strictExclusion) {
    verifyEditionPackaging(destAppDir, { edition }, progressCallback);
  }
}

/**
 * Copy node_modules from Core-CE to Standard Edition output
 * 
 * This bundles the Electron runtime + native dependencies (better-sqlite3, node-pty)
 * directly into the product so no npm install is needed on the user's machine.
 * Air-gapped USB deployment requires all dependencies pre-installed.
 * 
 * @param {string} fromPath - Source path (launcher directory with node_modules)
 * @param {string} destAppDir - Destination app directory
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} { success, message, sizeMB }
 */

async function copyNodeModules(fromPath, destAppDir, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
  };
  
  const srcNodeModules = path.join(fromPath, 'node_modules');
  const destNodeModules = path.join(destAppDir, 'node_modules');
  
  if (!fs.existsSync(srcNodeModules)) {
    console.warn('[Compile Manager] Warning: node_modules not found at source - product will need npm install');
    return { success: false, message: 'Source node_modules not found' };
  }
  
  sendProgress('Bundling Electron runtime...', 48, 'Copying node_modules (this may take a moment)');
  console.log(`[Compile Manager] Copying node_modules from ${srcNodeModules}`);
  
  try {
    // Use system cp -r instead of JS recursive copy.
    // node_modules contains symlinks, .bin stubs, native .node binaries,
    // and Electron's .asar archive handler can interfere with Node's fs module.
    // Shell cp handles all of this reliably.
    const { execSync } = require('child_process');
    
    // Disable Electron's .asar interception during this operation
    const originalNoAsar = process.noAsar;
    process.noAsar = true;
    
    // Remove existing destination to avoid cp -a creating nested dirs
    if (fs.existsSync(destNodeModules)) {
      execSync(process.platform === 'win32' 
        ? `rmdir /S /Q "${destNodeModules}"` 
        : `rm -rf "${destNodeModules}"`, 
        { stdio: 'pipe', timeout: 60000 }
      );
    }
    
    if (process.platform === 'win32') {
      // Windows: xcopy handles symlinks better than robocopy for node_modules
      execSync(`xcopy "${srcNodeModules}" "${destNodeModules}" /E /I /H /Y /Q`, {
        stdio: 'inherit',
        timeout: 600000 // 10 min timeout
      });
    } else {
      // Linux/macOS: cp -a preserves symlinks, permissions, timestamps
      // Use stdio inherit so any errors are visible in the console
      console.log(`[Compile Manager] Running: cp -a "${srcNodeModules}" "${destNodeModules}"`);
      execSync(`cp -a "${srcNodeModules}" "${destNodeModules}" 2>&1`, {
        stdio: 'inherit',
        timeout: 600000 // 10 min timeout
      });
    }
    
    process.noAsar = originalNoAsar;
    
    // Post-copy verification
    const srcCount = fs.readdirSync(srcNodeModules).length;
    const destCount = fs.existsSync(destNodeModules) ? fs.readdirSync(destNodeModules).length : 0;
    console.log(`[Compile Manager] node_modules copy verification: ${srcCount} source entries, ${destCount} dest entries`);
    if (destCount < srcCount) {
      console.warn(`[Compile Manager] WARNING: Only ${destCount}/${srcCount} entries copied!`);
    }
    
    // Verify electron binary exists
    const isWindows = process.platform === 'win32';
    const electronBinary = isWindows
      ? path.join(destNodeModules, 'electron', 'dist', 'electron.exe')
      : path.join(destNodeModules, 'electron', 'dist', 'electron');
    const electronExists = fs.existsSync(electronBinary);
    
    if (electronExists) {
      sendProgress('Electron runtime bundled', 49, 'Electron binary verified');
      console.log(`[Compile Manager] node_modules copied, electron binary: OK`);
    } else {
      sendProgress('node_modules copied', 49, 'WARNING: electron binary not found');
      console.warn(`[Compile Manager] WARNING: electron binary not found at ${electronBinary}`);
    }
    
    return { success: true, electronExists, message: 'Copied node_modules' };
  } catch (err) {
    console.error('[Compile Manager] Error copying node_modules:', err);
    sendProgress('node_modules copy failed', 49, err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================================
// JavaScript Obfuscation (Standard Edition Protection)
// ============================================================================

/**
 * Obfuscate JavaScript files in the compiled Standard Edition app directory
 * Protects proprietary code from reverse engineering
 * 
 * @param {string} appDir - Path to app directory containing JS files
 * @param {string} preset - Obfuscation preset ('none', 'light', 'medium', 'heavy')
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} { success, filesProcessed, message }
 */

async function obfuscateAppFiles(appDir, preset = 'medium', progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
  };
  
  // Skip if preset is 'none' or obfuscator not available
  if (preset === 'none') {
    sendProgress('Obfuscation skipped', 96, 'Preset: none');
    console.log('[Compile Manager] Obfuscation skipped (preset: none)');
    return { success: true, skipped: true, message: 'Obfuscation disabled' };
  }
  
  if (!obfuscator) {
    sendProgress('Obfuscation skipped', 96, 'Obfuscator module not available');
    console.log('[Compile Manager] Obfuscation skipped (module not available)');
    return { success: true, skipped: true, message: 'Obfuscator not available' };
  }
  
  sendProgress('Obfuscating code...', 96, `Preset: ${preset}`);
  console.log(`[Compile Manager] Obfuscating Standard Edition with preset: ${preset}`);
  
  try {
    const result = await obfuscator.obfuscateStandardEdition(appDir, preset, (p) => {
      // Scale progress from 96-99
      const scaledProgress = 96 + (p.progress / 100) * 3;
      sendProgress(`Obfuscating: ${p.status}`, scaledProgress, p.log);
    });
    
    if (result.success) {
      sendProgress('Obfuscation complete', 99, `Protected ${result.filesProcessed} files`);
      console.log(`[Compile Manager] Obfuscation complete: ${result.filesProcessed} files protected`);
    } else {
      console.error('[Compile Manager] Obfuscation had errors:', result.errors);
    }
    
    return result;
  } catch (err) {
    console.error('[Compile Manager] Obfuscation failed:', err);
    sendProgress('Obfuscation failed', 99, err.message);
    return { success: false, message: err.message };
  }
}

// ============================================================================
// Settings Copying (Theme Preservation)
// ============================================================================

/**
 * Copy settings to destination, preserving theme but stripping sensitive data
 * 
 * @param {string} fromPath - Source path (launcher directory)
 * @param {string} destModelsDir - Destination models directory
 * @param {Function} progressCallback - Progress callback
 */

module.exports = {
  copyAppFiles,
  copyNodeModules,
  obfuscateAppFiles
};
