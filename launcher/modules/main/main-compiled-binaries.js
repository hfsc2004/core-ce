/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const fs = require('fs');
const path = require('path');

function getPlatformDir() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  if (platform === 'darwin' && arch === 'arm64') return 'macos-arm';
  if (platform === 'darwin' && arch === 'x64') return 'macos-intel';
  if (platform === 'win32' && arch === 'x64') return 'windows-x64';
  if (platform === 'win32' && arch === 'arm64') return 'windows-arm64';
  return 'unknown';
}

function calculateDirectorySize(dirPath) {
  let totalSize = 0;
  const walk = (dir) => {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) walk(itemPath);
        else totalSize += stat.size;
      }
    } catch (_) {}
  };
  walk(dirPath);
  return totalSize;
}

async function getCompiledBinaryStatus(appDir) {
  try {
    const platformDir = getPlatformDir();
    const projectRoot = path.join(appDir, '..');
    const binaryName = process.platform === 'win32' ? 'open-webui.exe' : 'open-webui';
    const webuiDistDir = path.join(projectRoot, 'binaries', 'python-webui', platformDir, 'dist');
    const standaloneBinary = path.join(webuiDistDir, 'open_webui_launcher.dist', binaryName);
    const onefileBinary = path.join(webuiDistDir, binaryName);
    const venvCpuDir = path.join(projectRoot, 'binaries', 'python-webui', platformDir, 'venv-cpu');
    const anythingllmBinary = path.join(
      projectRoot,
      'binaries',
      'anythingllm',
      'dist',
      platformDir,
      process.platform === 'win32' ? 'anythingllm-server.exe' : 'anythingllm-server'
    );

    let webuiStatus = { exists: false };
    let anythingllmStatus = { exists: false };

    if (fs.existsSync(standaloneBinary)) {
      const standaloneDir = path.dirname(standaloneBinary);
      const totalSize = calculateDirectorySize(standaloneDir);
      webuiStatus = {
        exists: true,
        path: standaloneBinary,
        mode: 'standalone',
        size: totalSize,
        sizeMB: (totalSize / (1024 * 1024)).toFixed(1)
      };
    } else if (fs.existsSync(onefileBinary)) {
      const stats = fs.statSync(onefileBinary);
      webuiStatus = {
        exists: true,
        path: onefileBinary,
        mode: 'onefile',
        size: stats.size,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(1)
      };
    }

    if (fs.existsSync(anythingllmBinary)) {
      const stats = fs.statSync(anythingllmBinary);
      anythingllmStatus = {
        exists: true,
        path: anythingllmBinary,
        size: stats.size,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(1)
      };
    }

    return {
      success: true,
      webui: { ...webuiStatus, venvCpuExists: fs.existsSync(venvCpuDir) },
      anythingllm: anythingllmStatus
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function deleteCompiledBinary(appDir, binaryType) {
  try {
    const platformDir = getPlatformDir();
    const projectRoot = path.join(appDir, '..');
    if (binaryType === 'webui') {
      const distDir = path.join(projectRoot, 'binaries', 'python-webui', platformDir, 'dist');
      if (!fs.existsSync(distDir)) {
        return { success: false, message: 'Open WebUI binary not found at: ' + distDir };
      }
      fs.rmSync(distDir, { recursive: true, force: true });
      return { success: true, message: 'Open WebUI binary deleted. Will recompile on next build.' };
    }
    if (binaryType === 'anythingllm') {
      const distDir = path.join(projectRoot, 'binaries', 'anythingllm', 'dist', platformDir);
      if (!fs.existsSync(distDir)) {
        return { success: false, message: 'AnythingLLM binary not found at: ' + distDir };
      }
      fs.rmSync(distDir, { recursive: true, force: true });
      return { success: true, message: 'AnythingLLM binary deleted. Will recompile on next build.' };
    }
    return { success: false, message: 'Unknown binary type: ' + binaryType };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  getPlatformDir,
  getCompiledBinaryStatus,
  deleteCompiledBinary
};
