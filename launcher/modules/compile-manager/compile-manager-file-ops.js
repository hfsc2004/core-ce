/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Compile manager file/settings/license/ollama copy operations.
 */
'use strict';

const fs = require('fs');
const path = require('path');

async function copySettingsForCompilation(fromPath, destModelsDir, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
  };
  
  sendProgress('Copying settings...', 93, 'Preserving theme configuration...');
  
  const projectRoot = path.join(fromPath, '..');
  const settingsPath = path.join(projectRoot, 'models', 'psf-settings.json');
  const destSettingsPath = path.join(destModelsDir, 'psf-settings.json');
  
  try {
    if (fs.existsSync(settingsPath)) {
      // Load existing settings
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      
      // Create sanitized settings (keep theme, strip sensitive data)
      const sanitizedSettings = {
        theme: settings.theme || {
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
          textMuted: '#888'
        },
        created_at: settings.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
        // NOTE: huggingface_token is intentionally NOT copied for security
      };
      
      // Ensure destination directory exists
      fs.mkdirSync(path.dirname(destSettingsPath), { recursive: true });
      
      // Write sanitized settings
      fs.writeFileSync(destSettingsPath, JSON.stringify(sanitizedSettings, null, 2), 'utf-8');
      
      sendProgress('Settings copied', 94, `Theme preserved: ${sanitizedSettings.theme.accent}`);
      console.log('[Compile Manager] Copied settings with theme:', sanitizedSettings.theme.accent);
      
      return { success: true, theme: sanitizedSettings.theme };
    } else {
      sendProgress('Settings copied', 94, 'No settings file found, using defaults');
      console.log('[Compile Manager] No settings file found, skipping');
      return { success: true, theme: null };
    }
  } catch (err) {
    console.error('[Compile Manager] Error copying settings:', err);
    sendProgress('Settings copy failed', 94, err.message);
    return { success: false, error: err.message };
  }
}

async function copyLicenses(fromPath, destLicensesDir, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
  };
  
  sendProgress('Copying licenses...', 70, 'Copying license files...');
  
  const projectRoot = path.join(fromPath, '..');
  const licensesPath = path.join(projectRoot, 'licenses');
  
  if (fs.existsSync(licensesPath)) {
    const licenseFiles = fs.readdirSync(licensesPath);
    for (const file of licenseFiles) {
      fs.copyFileSync(
        path.join(licensesPath, file),
        path.join(destLicensesDir, file)
      );
    }
    sendProgress('Licenses copied', 75, `Copied ${licenseFiles.length} license files`);
  }
}

function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // Handle symlinks - recreate them at destination
    if (entry.isSymbolicLink()) {
      try {
        const linkTarget = fs.readlinkSync(srcPath);
        // Remove existing file/link at destination if exists
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        fs.symlinkSync(linkTarget, destPath);
      } catch (err) {
        console.log(`[Copy] Warning: Could not copy symlink ${entry.name}: ${err.message}`);
      }
    } else if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      // Preserve executable permissions on Unix
      try {
        const stats = fs.statSync(srcPath);
        fs.chmodSync(destPath, stats.mode);
      } catch (err) {
        // Ignore permission errors on Windows
      }
    }
    // Skip other types (sockets, devices, etc.)
  }
}

async function copyOllamaBinaries(fromPath, targetPlatform, destBinariesDir, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
  };
  
  sendProgress('Copying Ollama binaries...', 76, `Platform: ${targetPlatform}`);
  
  // Yield to allow UI to update
  await new Promise(resolve => setImmediate(resolve));
  
  const projectRoot = path.join(fromPath, '..');
  const srcOllamaDir = path.join(projectRoot, 'binaries', 'ollama', targetPlatform);
  const destOllamaDir = path.join(destBinariesDir, 'ollama', targetPlatform);
  
  if (!fs.existsSync(srcOllamaDir)) {
    console.warn(`[Compile Manager] Ollama binaries not found for ${targetPlatform}`);
    sendProgress('Ollama binaries not found', 78, `Missing: ${srcOllamaDir}`);
    return { success: false, message: `Ollama binaries not found for ${targetPlatform}` };
  }
  
  try {
    // Copy entire Ollama directory structure (bin, lib, runners)
    copyDirectoryRecursive(srcOllamaDir, destOllamaDir);
    
    // Count files copied
    let fileCount = 0;
    const countFiles = (dir) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          countFiles(path.join(dir, entry.name));
        } else {
          fileCount++;
        }
      }
    };
    countFiles(destOllamaDir);
    
    sendProgress('Ollama binaries copied', 80, `Copied ${fileCount} files for ${targetPlatform}`);
    console.log(`[Compile Manager] Copied Ollama binaries: ${fileCount} files`);
    
    return { success: true, fileCount, message: `Copied ${fileCount} Ollama files` };
  } catch (err) {
    console.error('[Compile Manager] Error copying Ollama binaries:', err);
    sendProgress('Ollama copy failed', 80, err.message);
    return { success: false, message: err.message };
  }
}

module.exports = {
  copySettingsForCompilation,
  copyLicenses,
  copyDirectoryRecursive,
  copyOllamaBinaries
};
