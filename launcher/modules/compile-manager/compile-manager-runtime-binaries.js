/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Compile manager runtime binary packaging (WebUI / AnythingLLM).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { copyDirectoryRecursive } = require('./compile-manager-file-ops.js');

let webuiCompiler = null;
let anythingllmCompiler = null;
try {
  webuiCompiler = require('./compile-webui-pyinstaller.js');
  console.log('[Compile Manager] Using PyInstaller for WebUI compilation');
} catch (err) {
  console.log('[Compile Manager] WebUI PyInstaller compiler not available:', err.message);
  try {
    webuiCompiler = require('./compile-webui-nuitka.js');
    console.log('[Compile Manager] Falling back to Nuitka');
  } catch (err2) {
    console.log('[Compile Manager] No WebUI compiler available');
  }
}
try {
  anythingllmCompiler = require('./compile-anythingllm-pkg.js');
} catch (err) {
  console.log('[Compile Manager] AnythingLLM compiler not available:', err.message);
}

async function copyWebUIBinaries(fromPath, targetPlatform, destBinariesDir, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
  };
  
  sendProgress('Checking Open WebUI...', 81, `Platform: ${targetPlatform}`);
  
  const projectRoot = path.join(fromPath, '..');
  const isWindows = targetPlatform.startsWith('windows');
  const binaryName = isWindows ? 'open-webui.exe' : 'open-webui';
  
  // Path to compiled binary - check both standalone and onefile modes
  const onefileBinaryPath = path.join(projectRoot, 'binaries', 'python-webui', targetPlatform, 'dist', binaryName);
  const standaloneBinaryPath = path.join(projectRoot, 'binaries', 'python-webui', targetPlatform, 'dist', 'open_webui_launcher.dist', binaryName);
  
  // Use whichever exists (standalone takes priority)
  const hasStandaloneBinary = fs.existsSync(standaloneBinaryPath);
  const hasOnefileBinary = fs.existsSync(onefileBinaryPath);
  const compiledBinaryPath = hasStandaloneBinary ? standaloneBinaryPath : onefileBinaryPath;
  
  // Path to venv (source)
  const venvPath = path.join(projectRoot, 'binaries', 'python-webui', targetPlatform, 'venv');
  // Destination
  const destWebUIDir = path.join(destBinariesDir, 'python-webui', targetPlatform);
  
  // Check what we have
  const hasCompiledBinary = hasStandaloneBinary || hasOnefileBinary;
  const hasVenv = fs.existsSync(venvPath);
  
  console.log(`[Compile Manager] WebUI binary check - standalone: ${hasStandaloneBinary}, onefile: ${hasOnefileBinary}, venv: ${hasVenv}`);
  
  if (!hasCompiledBinary && !hasVenv) {
    console.log(`[Compile Manager] Open WebUI not installed for ${targetPlatform} - skipping`);
    sendProgress('Open WebUI not available', 82, 'Skipping (not installed)');
    return { success: true, skipped: true, message: 'Open WebUI not installed - skipping' };
  }
  
  try {
    // If no compiled binary but venv exists, compile it first!
    if (!hasCompiledBinary && hasVenv && webuiCompiler) {
      sendProgress('Compiling Open WebUI...', 82, 'PyInstaller --onedir (15-30 minutes)');
      console.log('[Compile Manager] No compiled binary found, compiling with PyInstaller...');
      
      const compileResult = await webuiCompiler.compileOpenWebUI(projectRoot, (p) => {
        // Scale progress 82-84 for compilation
        const scaledProgress = 82 + (p.progress / 100) * 2;
        sendProgress(`Compiling: ${p.status}`, scaledProgress, p.log);
      });
      
      if (!compileResult.success) {
        console.error('[Compile Manager] PyInstaller compilation failed:', compileResult.message);
        // Fall back to copying venv
        sendProgress('Compilation failed, copying venv...', 84, 'Fallback to source');
        const srcWebUIDir = path.join(projectRoot, 'binaries', 'python-webui', targetPlatform);
        copyDirectoryRecursive(srcWebUIDir, destWebUIDir);
        return { success: true, compiled: false, fallback: true, message: 'Copied venv (compilation failed)' };
      }
      
      console.log('[Compile Manager] Compilation successful:', compileResult.outputPath);
    }
    
    // Check for standalone mode (.dist folder) or onefile mode (single binary)
    const distFolderPath = path.join(projectRoot, 'binaries', 'python-webui', targetPlatform, 'dist', 'open_webui_launcher.dist');
    const standaloneMode = fs.existsSync(distFolderPath);
    
    if (standaloneMode) {
      // Standalone mode: copy entire .dist folder
      sendProgress('Copying Open WebUI standalone folder...', 84, 'Standalone mode');
      await new Promise(resolve => setImmediate(resolve));
      
      const destDistDir = path.join(destWebUIDir, 'dist');
      const destStandaloneDir = path.join(destDistDir, 'open_webui_launcher.dist');
      fs.mkdirSync(destDistDir, { recursive: true });
      
      // Copy entire standalone folder
      copyDirectoryRecursive(distFolderPath, destStandaloneDir);
      
      // Make binary executable on Unix
      const destBinaryPath = path.join(destStandaloneDir, binaryName);
      if (!isWindows && fs.existsSync(destBinaryPath)) {
        fs.chmodSync(destBinaryPath, 0o755);
      }
      
      // Calculate total size of folder
      let totalSize = 0;
      const calculateSize = (dir) => {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            calculateSize(itemPath);
          } else {
            totalSize += stat.size;
          }
        }
      };
      calculateSize(destStandaloneDir);
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
      
      sendProgress('Open WebUI standalone copied', 85, `${sizeMB} MB`);
      console.log(`[Compile Manager] Copied compiled Open WebUI (standalone): ${sizeMB} MB`);
      
      return { success: true, compiled: true, standalone: true, size: totalSize, message: `Copied standalone folder (${sizeMB} MB)` };
    } else if (fs.existsSync(compiledBinaryPath)) {
      // Onefile mode: copy single binary
      sendProgress('Copying compiled Open WebUI binary...', 84, binaryName);
      await new Promise(resolve => setImmediate(resolve));
      
      // Create destination directory
      const destDistDir = path.join(destWebUIDir, 'dist');
      fs.mkdirSync(destDistDir, { recursive: true });
      
      // Copy just the compiled binary
      const destBinaryPath = path.join(destDistDir, binaryName);
      fs.copyFileSync(compiledBinaryPath, destBinaryPath);
      
      // Make executable on Unix
      if (!isWindows) {
        fs.chmodSync(destBinaryPath, 0o755);
      }
      
      const stats = fs.statSync(destBinaryPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
      
      sendProgress('Open WebUI binary copied', 85, `${binaryName} (${sizeMB} MB)`);
      console.log(`[Compile Manager] Copied compiled Open WebUI binary: ${sizeMB} MB`);
      
      return { success: true, compiled: true, standalone: false, size: stats.size, message: `Copied compiled binary (${sizeMB} MB)` };
    } else {
      // Fallback: copy entire venv directory
      sendProgress('Copying Open WebUI venv...', 84, 'Copying source (no compiled binary)');
      const srcWebUIDir = path.join(projectRoot, 'binaries', 'python-webui', targetPlatform);
      copyDirectoryRecursive(srcWebUIDir, destWebUIDir);
      
      sendProgress('Open WebUI venv copied', 85, 'Copied source files');
      return { success: true, compiled: false, message: 'Copied venv (no compiled binary)' };
    }
  } catch (err) {
    console.error('[Compile Manager] Error with Open WebUI:', err);
    sendProgress('Open WebUI failed', 85, err.message);
    return { success: false, message: err.message };
  }
}

async function copyAnythingLLMBinaries(fromPath, targetPlatform, destBinariesDir, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
  };
  
  sendProgress('Checking AnythingLLM...', 86, `Platform: ${targetPlatform}`);
  
  const projectRoot = path.join(fromPath, '..');
  const isWindows = targetPlatform.startsWith('windows');
  
  // Path to archived server (portable Node.js + archive approach)
  const archivePath = path.join(projectRoot, 'binaries', 'anythingllm', 'dist', targetPlatform, 'server.tar.gz');
  // Path to source (Node.js project)
  const srcAnythingDir = path.join(projectRoot, 'binaries', 'anythingllm');
  const packageJsonPath = path.join(srcAnythingDir, 'package.json');
  // Path to portable Node.js binary
  const nodeLocalName = isWindows ? 'node.exe' : 'node';
  const nodeBinaryPath = path.join(projectRoot, 'binaries', 'nodejs', targetPlatform, 'bin', nodeLocalName);
  // Destination
  const destAnythingDir = path.join(destBinariesDir, 'anythingllm', targetPlatform);
  
  // Check what we have
  const hasArchive = fs.existsSync(archivePath);
  const hasSource = fs.existsSync(packageJsonPath);
  const hasNodeBinary = fs.existsSync(nodeBinaryPath);
  
  if (!hasArchive && !hasSource) {
    console.log(`[Compile Manager] AnythingLLM not installed - skipping`);
    sendProgress('AnythingLLM not available', 87, 'Skipping (not installed)');
    return { success: true, skipped: true, message: 'AnythingLLM not installed - skipping' };
  }
  
  if (!hasNodeBinary) {
    console.warn(`[Compile Manager] Portable Node.js not found for ${targetPlatform} - download it via Binary Manager`);
    sendProgress('Node.js binary missing', 87, `Download Node.js for ${targetPlatform} in Binary Manager`);
    return { success: false, message: `Portable Node.js not found for ${targetPlatform}. Download it via Binary Manager first.` };
  }
  
  try {
    // If no archive but source exists, create archive first
    if (!hasArchive && hasSource && anythingllmCompiler) {
      sendProgress('Archiving AnythingLLM...', 87, 'Creating server.tar.gz (this may take a minute)');
      console.log('[Compile Manager] No archive found, creating server.tar.gz...');
      
      const archiveResult = await anythingllmCompiler.compileAnythingLLM(projectRoot, (p) => {
        const scaledProgress = 87 + (p.progress / 100) * 2;
        sendProgress(`Archiving: ${p.status}`, scaledProgress, p.log);
      });
      
      if (!archiveResult.success) {
        console.error('[Compile Manager] Archive creation failed:', archiveResult.message);
        sendProgress('Archive failed', 89, archiveResult.message);
        return { success: false, message: `Archive creation failed: ${archiveResult.message}` };
      }
      
      console.log('[Compile Manager] Archive created:', archiveResult.outputPath);
    }
    
    // Copy the archive + portable node + frontend to product
    if (fs.existsSync(archivePath)) {
      fs.mkdirSync(destAnythingDir, { recursive: true });
      
      // 1. Copy portable Node.js binary
      sendProgress('Copying portable Node.js...', 88, nodeLocalName);
      const destNodeDir = path.join(destAnythingDir, 'bin');
      fs.mkdirSync(destNodeDir, { recursive: true });
      const destNodePath = path.join(destNodeDir, nodeLocalName);
      fs.copyFileSync(nodeBinaryPath, destNodePath);
      if (!isWindows) {
        fs.chmodSync(destNodePath, 0o755);
      }
      const nodeSizeMB = (fs.statSync(destNodePath).size / (1024 * 1024)).toFixed(1);
      console.log(`[Compile Manager] Copied portable Node.js: ${nodeSizeMB} MB`);
      
      // 2. Copy server.tar.gz (single archive file)
      sendProgress('Copying server archive...', 89, 'server.tar.gz');
      const destArchivePath = path.join(destAnythingDir, 'server.tar.gz');
      fs.copyFileSync(archivePath, destArchivePath);
      const archiveSizeMB = (fs.statSync(destArchivePath).size / (1024 * 1024)).toFixed(1);
      console.log(`[Compile Manager] Copied server archive: ${archiveSizeMB} MB`);
      
      // 3. Copy frontend dist if it exists
      const frontendDist = path.join(srcAnythingDir, 'dist', targetPlatform, 'frontend-dist');
      if (fs.existsSync(frontendDist)) {
        const destFrontend = path.join(destAnythingDir, 'frontend-dist');
        copyDirectoryRecursive(frontendDist, destFrontend);
        console.log('[Compile Manager] Copied frontend-dist');
      }
      
      // 4. Create empty storage directory
      const destStorage = path.join(destAnythingDir, 'storage');
      if (!fs.existsSync(destStorage)) {
        fs.mkdirSync(destStorage, { recursive: true });
      }
      
      sendProgress('AnythingLLM packaged', 90, `Node.js: ${nodeSizeMB} MB + Archive: ${archiveSizeMB} MB`);
      console.log(`[Compile Manager] AnythingLLM packaged: node (${nodeSizeMB} MB) + server.tar.gz (${archiveSizeMB} MB)`);
      
      return { 
        success: true, 
        compiled: true, 
        message: `Packaged: node (${nodeSizeMB} MB) + server.tar.gz (${archiveSizeMB} MB)` 
      };
    } else {
      sendProgress('AnythingLLM archive not found', 90, 'Archive server directory first');
      return { success: false, message: 'server.tar.gz not found. Run archive step first.' };
    }
  } catch (err) {
    console.error('[Compile Manager] Error with AnythingLLM:', err);
    sendProgress('AnythingLLM failed', 90, err.message);
    return { success: false, message: err.message };
  }
}

module.exports = {
  copyWebUIBinaries,
  copyAnythingLLMBinaries
};
