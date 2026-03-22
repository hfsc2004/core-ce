/**
 * compile-anythingllm-pkg.js
 * 
 * Archives AnythingLLM server into a manufacturing-friendly package.
 * 
 * PIPELINE: Verify dependencies → Build frontend → Archive server
 * 
 * 1. Verify server/node_modules exists (run yarn install if needed)
 * 2. Build frontend if not already built
 * 3. Archive server/ directory into single server.tar.gz
 * 4. Copy frontend dist alongside archive
 * 
 * RESULT: server.tar.gz + frontend-dist/ + storage/
 * USB-manufacturing friendly - minimal file count.
 * Paired with portable Node.js binary for zero-dependency execution.
 * 
 * @module compile-anythingllm-pkg
 * @version 1.1.2 - March 5, 2026 - Portable Node.js + archive approach (replaces ncc → pkg)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Get platform-specific info
 */
function getPlatformInfo() {
  const platform = process.platform;
  const arch = process.arch;
  
  let platformDir;
  
  if (platform === 'linux' && arch === 'x64') {
    platformDir = 'linux-x64';
  } else if (platform === 'linux' && arch === 'arm64') {
    platformDir = 'linux-arm64';
  } else if (platform === 'darwin' && arch === 'arm64') {
    platformDir = 'macos-arm';
  } else if (platform === 'darwin' && arch === 'x64') {
    platformDir = 'macos-intel';
  } else if (platform === 'win32' && arch === 'x64') {
    platformDir = 'windows-x64';
  } else if (platform === 'win32' && arch === 'arm64') {
    platformDir = 'windows-arm64';
  } else {
    return null;
  }
  
  return {
    platform,
    arch,
    platformDir,
    isWindows: platform === 'win32',
    exeExt: platform === 'win32' ? '.exe' : ''
  };
}

/**
 * Recursively copy a directory
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Count files in a directory recursively
 */
function countFiles(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Archive AnythingLLM server into a single tar.gz for USB manufacturing.
 * 
 * This replaces the previous ncc → pkg compilation pipeline which was
 * fundamentally broken due to AnythingLLM's dynamic requires, native
 * modules, and handler plugin system.
 * 
 * The new approach:
 * - Archives the server/ directory (with node_modules) into ONE file
 * - Paired with a portable Node.js binary downloaded via Binary Manager
 * - On first consumer launch, server.tar.gz extracts (30-60 sec one-time)
 * - Then runs via: node server/index.js
 * 
 * @param {string} projectRoot - Project root directory (where binaries/ lives)
 * @param {Function} progressCallback - Progress callback ({ status, progress, log })
 * @returns {Promise<Object>} { success, outputPath, message }
 */
async function compileAnythingLLM(projectRoot, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
    if (log) console.log(`[archive] ${log}`);
  };
  
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return { success: false, message: 'Unsupported platform' };
  }
  
  sendProgress('Preparing AnythingLLM archive...', 0, `Platform: ${platformInfo.platformDir}`);
  
  // Paths
  const anythingDir = path.join(projectRoot, 'binaries', 'anythingllm');
  const serverDir = path.join(anythingDir, 'server');
  const outputDir = path.join(anythingDir, 'dist', platformInfo.platformDir);
  const outputArchive = path.join(outputDir, 'server.tar.gz');
  
  // =========================================================================
  // STEP 1: Verify AnythingLLM server exists
  // =========================================================================
  if (!fs.existsSync(serverDir)) {
    return { success: false, message: `AnythingLLM server not found at ${serverDir}` };
  }
  
  // Check node_modules exists
  const nodeModules = path.join(serverDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    sendProgress('Installing dependencies...', 5, 'Running yarn install');
    try {
      execSync('yarn install', { cwd: serverDir, stdio: 'inherit', timeout: 300000 });
    } catch (err) {
      return { success: false, message: `yarn install failed: ${err.message}` };
    }
  }
  
  const serverFileCount = countFiles(serverDir);
  sendProgress('Dependencies verified', 10, `Server directory: ${serverFileCount} files`);
  
  // =========================================================================
  // STEP 2: Build frontend (if not already built)
  // =========================================================================
  const frontendDir = path.join(anythingDir, 'frontend');
  const frontendDist = path.join(frontendDir, 'dist');
  
  if (!fs.existsSync(frontendDist)) {
    sendProgress('Building frontend...', 15, 'This may take a few minutes');
    try {
      // Install frontend dependencies if needed
      const frontendNodeModules = path.join(frontendDir, 'node_modules');
      if (!fs.existsSync(frontendNodeModules)) {
        execSync('yarn install', { cwd: frontendDir, stdio: 'inherit', timeout: 300000 });
      }
      execSync('yarn build', { cwd: frontendDir, stdio: 'inherit', timeout: 600000 });
      sendProgress('Frontend built', 30);
    } catch (err) {
      console.warn('[archive] Frontend build warning:', err.message);
      sendProgress('Frontend skipped', 30, 'Continuing without frontend');
    }
  } else {
    sendProgress('Frontend exists', 30, 'Using existing build');
  }
  
  // =========================================================================
  // STEP 3: Archive server directory into single tar.gz
  // =========================================================================
  sendProgress('Archiving server directory...', 35, 'Creating server.tar.gz (this may take a minute)');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Remove old archive if exists
  if (fs.existsSync(outputArchive)) {
    fs.unlinkSync(outputArchive);
  }
  
  try {
    // Create tar.gz of the server directory
    // -C changes to parent dir, then archives 'server' as a relative path
    // This preserves the 'server/' prefix in the archive for clean extraction
    console.log(`[archive] Creating archive from: ${serverDir}`);
    console.log(`[archive] Output: ${outputArchive}`);
    
    execSync(`tar -czf "${outputArchive}" -C "${anythingDir}" server`, {
      stdio: 'pipe',
      timeout: 600000  // 10 minute timeout for large node_modules
    });
    
    sendProgress('Archive created', 80);
  } catch (err) {
    return { success: false, message: `tar archive failed: ${err.message}` };
  }
  
  // Verify archive
  if (!fs.existsSync(outputArchive)) {
    return { success: false, message: `Archive not found at ${outputArchive}` };
  }
  
  const archiveStats = fs.statSync(outputArchive);
  const archiveSizeMB = (archiveStats.size / (1024 * 1024)).toFixed(1);
  sendProgress('Archive verified', 85, `server.tar.gz: ${archiveSizeMB} MB`);
  
  // =========================================================================
  // STEP 4: Copy frontend dist alongside archive
  // =========================================================================
  if (fs.existsSync(frontendDist)) {
    const outputFrontend = path.join(outputDir, 'frontend-dist');
    if (fs.existsSync(outputFrontend)) {
      fs.rmSync(outputFrontend, { recursive: true, force: true });
    }
    copyDirRecursive(frontendDist, outputFrontend);
    sendProgress('Frontend copied', 90);
  }
  
  // Create empty storage directory
  const storageDir = path.join(outputDir, 'storage');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  
  // =========================================================================
  // STEP 5: Summary
  // =========================================================================
  
  // Count files in output directory
  const outputFileCount = countFiles(outputDir);
  
  sendProgress('Archive complete!', 100, `Archive: ${archiveSizeMB} MB, Output files: ${outputFileCount}`);
  
  console.log(`[archive] ✔ SUCCESS`);
  console.log(`[archive]   Archive: ${archiveSizeMB} MB (${serverFileCount} files compressed)`);
  console.log(`[archive]   Output files: ${outputFileCount}`);
  console.log(`[archive]   Path: ${outputArchive}`);
  
  return {
    success: true,
    outputPath: outputArchive,
    size: archiveStats.size,
    fileCount: outputFileCount,
    message: `AnythingLLM archived: ${archiveSizeMB} MB (${serverFileCount} files → 1 archive)`
  };
}

/**
 * Check if archived AnythingLLM exists
 * (Maintains backward-compatible export name)
 */
function checkCompiledAnythingLLM(projectRoot) {
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return { exists: false };
  }
  
  const outputArchive = path.join(
    projectRoot,
    'binaries',
    'anythingllm',
    'dist',
    platformInfo.platformDir,
    'server.tar.gz'
  );
  
  if (fs.existsSync(outputArchive)) {
    const stats = fs.statSync(outputArchive);
    return {
      exists: true,
      path: outputArchive,
      size: stats.size,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(1)
    };
  }
  
  return { exists: false };
}

module.exports = {
  compileAnythingLLM,
  checkCompiledAnythingLLM,
  getPlatformInfo
};
