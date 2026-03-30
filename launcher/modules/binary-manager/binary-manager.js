/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Pseudo Science Fiction Core Collection - Binary Manager Module
 * Thin orchestrator for platform-specific binary operations.
 */

const fs = require('fs');
const path = require('path');

const linuxDownloader = require('./binary-download-linux');
const macosDownloader = require('./binary-download-macos');
const windowsDownloader = require('./binary-download-windows');

const {
  getBinaryVersions,
  updateBinaryVersion,
  checkForBinaryUpdates
} = require('./binary-manager-versions');

const {
  getCurrentPlatformKey,
  getAllPlatformKeys,
  isValidPlatformKey,
  resolveSystemGitPath,
  resolveGitExecPath
} = require('./binary-manager-platform');

const {
  downloadLlamaCpp,
  runLlamaCppBuildPreflight,
  detectLlamaCppBuildProfile,
  verifyExistingLlamaServerCapability
} = require('./binary-manager-llamacpp');

function getDownloaderForCurrentPlatform() {
  const platform = process.platform;
  if (platform === 'linux') return linuxDownloader;
  if (platform === 'darwin') return macosDownloader;
  if (platform === 'win32') return windowsDownloader;
  return null;
}

async function dispatchDownload(fnName, fromPath, progressCallback = null) {
  const downloader = getDownloaderForCurrentPlatform();
  const platform = process.platform;

  if (!downloader || typeof downloader[fnName] !== 'function') {
    return {
      success: false,
      message: `Unsupported platform: ${platform}`
    };
  }

  try {
    return await downloader[fnName](fromPath, progressCallback);
  } catch (err) {
    return {
      success: false,
      message: err?.message || 'Download failed'
    };
  }
}

async function deleteBinaries(fromPath, type) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const binariesDir = path.join(projectRoot, 'binaries');

    const targetMap = {
      ollama: path.join(binariesDir, 'ollama'),
      anythingllm: path.join(binariesDir, 'anythingllm'),
      'python-webui': path.join(binariesDir, 'python-webui'),
      nodejs: path.join(binariesDir, 'nodejs'),
      'arduino-cli': path.join(binariesDir, 'arduino-cli'),
      esptool: path.join(binariesDir, 'esptool'),
      git: path.join(binariesDir, 'git'),
      'llama-cpp': path.join(binariesDir, 'llama.cpp')
    };

    const targetDir = targetMap[type];
    if (!targetDir) {
      return { success: false, message: 'Unknown binary type' };
    }

    if (!fs.existsSync(targetDir)) {
      return { success: false, message: `❌ ${type} binaries not found` };
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    return { success: true, message: `✅ Deleted ${type} binaries` };
  } catch (err) {
    console.error('[Binary Manager] Delete binaries error:', err);
    return { success: false, message: err.message };
  }
}

function buildExpectedFiles(type, binariesDir) {
  if (type === 'ollama') {
    return {
      root: 'ollama',
      platforms: {
        'windows-x64': ['bin/ollama.exe'],
        'windows-arm64': ['bin/ollama.exe'],
        'linux-x64': ['bin/ollama'],
        'linux-arm64': ['bin/ollama'],
        'macos-intel': ['bin/ollama'],
        'macos-arm': ['bin/ollama']
      }
    };
  }

  if (type === 'nodejs') {
    return {
      root: 'nodejs',
      platforms: {
        'windows-x64': ['bin/node.exe'],
        'windows-arm64': ['bin/node.exe'],
        'linux-x64': ['bin/node'],
        'linux-arm64': ['bin/node'],
        'macos-intel': ['bin/node'],
        'macos-arm': ['bin/node']
      }
    };
  }

  if (type === 'git') {
    return {
      root: 'git',
      platforms: {
        'windows-x64': ['cmd/git.exe', 'bin/git.exe'],
        'windows-arm64': ['cmd/git.exe', 'bin/git.exe'],
        'linux-x64': ['bin/git', 'cmd/git'],
        'linux-arm64': ['bin/git', 'cmd/git'],
        'macos-intel': ['bin/git', 'cmd/git'],
        'macos-arm': ['bin/git', 'cmd/git']
      }
    };
  }

  if (type === 'arduino-cli') {
    return {
      root: 'arduino-cli',
      platforms: {
        'windows-x64': ['arduino-cli.exe', 'bin/arduino-cli.exe'],
        'windows-arm64': ['arduino-cli.exe', 'bin/arduino-cli.exe'],
        'linux-x64': ['arduino-cli', 'bin/arduino-cli'],
        'linux-arm64': ['arduino-cli', 'bin/arduino-cli'],
        'macos-intel': ['arduino-cli', 'bin/arduino-cli'],
        'macos-arm': ['arduino-cli', 'bin/arduino-cli']
      }
    };
  }

  if (type === 'llama-cpp') {
    return {
      root: 'llama.cpp',
      platforms: {
        'windows-x64': ['bin/llama-server.exe', 'build/bin/llama-server.exe'],
        'windows-arm64': ['bin/llama-server.exe', 'build/bin/llama-server.exe'],
        'linux-x64': ['bin/llama-server', 'build/bin/llama-server'],
        'linux-arm64': ['bin/llama-server', 'build/bin/llama-server'],
        'macos-intel': ['bin/llama-server', 'build/bin/llama-server'],
        'macos-arm': ['bin/llama-server', 'build/bin/llama-server']
      }
    };
  }

  if (type === 'esptool') {
    return {
      root: 'esptool',
      platforms: {
        'windows-x64': ['venv/Scripts/esptool.exe'],
        'windows-arm64': ['venv/Scripts/esptool.exe'],
        'linux-x64': ['venv/bin/esptool'],
        'linux-arm64': ['venv/bin/esptool'],
        'macos-intel': ['venv/bin/esptool'],
        'macos-arm': ['venv/bin/esptool']
      }
    };
  }

  return null;
}

async function checkBinaries(fromPath, type) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const binariesDir = path.join(projectRoot, 'binaries');
    const files = [];

    const spec = buildExpectedFiles(type, binariesDir);
    if (!spec) {
      return { success: true, allExist: false, someExist: false, message: '❌ No binaries found. Click "Download" to download.', files: [] };
    }

    for (const [platform, candidates] of Object.entries(spec.platforms)) {
      const candidatePaths = candidates.map((rel) => path.join(binariesDir, spec.root, platform, rel));
      const existing = candidatePaths.find((p) => fs.existsSync(p));
      files.push({
        platform,
        exists: !!existing,
        path: existing || candidatePaths[0]
      });
    }

    const allExist = files.every((f) => f.exists);
    const someExist = files.some((f) => f.exists);

    let message;
    if (allExist) {
      if (type === 'llama-cpp') {
        const platformKey = getCurrentPlatformKey();
        const current = files.find((f) => f.platform === platformKey && f.exists);
        if (current?.path && fs.existsSync(current.path)) {
          const profile = detectLlamaCppBuildProfile();
          const cap = verifyExistingLlamaServerCapability(current.path, profile);
          message = cap.ok
            ? '✅ All platform binaries found'
            : `⚠️ Binaries found, but current-platform capability check failed: ${cap.reason}`;
        } else {
          message = '✅ All platform binaries found';
        }
      } else {
        message = '✅ All platform binaries found';
      }
    } else if (someExist) {
      const foundPlatforms = files.filter((f) => f.exists).map((f) => f.platform).join(', ');
      message = `✅ Found binaries for: ${foundPlatforms}`;
    } else {
      message = '❌ No binaries found. Click "Download" to download.';
    }

    return { success: true, allExist, someExist, message, files };
  } catch (err) {
    console.error('[Binary Manager] Check binaries error:', err);
    return { success: false, message: err.message };
  }
}

async function downloadOllama(fromPath, progressCallback = null) {
  return dispatchDownload('downloadOllama', fromPath, progressCallback);
}

async function downloadNodeJS(fromPath, progressCallback = null) {
  return dispatchDownload('downloadNodeJS', fromPath, progressCallback);
}

async function downloadArduinoCli(fromPath, progressCallback = null) {
  return dispatchDownload('downloadArduinoCli', fromPath, progressCallback);
}

async function downloadEsptool(fromPath, progressCallback = null) {
  return dispatchDownload('downloadEsptool', fromPath, progressCallback);
}

async function downloadGit(fromPath, progressCallback = null) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const binariesDir = path.join(projectRoot, 'binaries');
    const platformKey = getCurrentPlatformKey();
    const targetDir = path.join(binariesDir, 'git', platformKey);
    fs.mkdirSync(targetDir, { recursive: true });

    const systemGitPath = resolveSystemGitPath();
    if (!systemGitPath) {
      const expected = process.platform === 'win32'
        ? path.join(targetDir, 'cmd', 'git.exe')
        : path.join(targetDir, 'bin', 'git');
      return {
        success: false,
        message:
          `System git not found; cannot bootstrap bundled git for ${platformKey}.\n` +
          `Expected bundled path: ${expected}`
      };
    }

    if (progressCallback) {
      progressCallback({
        progress: 20,
        filename: 'git',
        completed: 0,
        total: 1,
        speed: 0,
        message: `Found system git at ${systemGitPath}`
      });
    }

    const binDir = path.join(targetDir, process.platform === 'win32' ? 'cmd' : 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const targetGitPath = path.join(binDir, process.platform === 'win32' ? 'git.exe' : 'git');
    fs.copyFileSync(systemGitPath, targetGitPath);
    if (process.platform !== 'win32') {
      fs.chmodSync(targetGitPath, 0o755);
    }

    const execPath = resolveGitExecPath(systemGitPath);
    let copiedExecPath = false;
    if (execPath && fs.existsSync(execPath)) {
      const targetExecPath = path.join(targetDir, 'libexec', 'git-core');
      fs.mkdirSync(path.dirname(targetExecPath), { recursive: true });
      fs.cpSync(execPath, targetExecPath, { recursive: true, force: true });
      copiedExecPath = true;
    }

    if (progressCallback) {
      progressCallback({
        progress: 100,
        filename: 'git',
        completed: 1,
        total: 1,
        speed: 0,
        message: copiedExecPath
          ? 'Bundled Git bootstrapped from system git (binary + git-core).'
          : 'Bundled Git bootstrapped from system git (binary only).'
      });
    }

    return {
      success: true,
      message:
        copiedExecPath
          ? `✅ Bundled Git prepared for ${platformKey} at ${targetGitPath} (with git-core helpers).`
          : `✅ Bundled Git binary prepared for ${platformKey} at ${targetGitPath}.`
    };
  } catch (err) {
    console.error('[Binary Manager] Git download guidance error:', err);
    return { success: false, message: err.message };
  }
}

module.exports = {
  getBinaryVersions,
  updateBinaryVersion,
  checkForBinaryUpdates,
  deleteBinaries,
  checkBinaries,
  downloadOllama,
  downloadNodeJS,
  downloadArduinoCli,
  downloadEsptool,
  downloadGit,
  downloadLlamaCpp,
  runLlamaCppBuildPreflight,
  getCurrentPlatformKey,
  getAllPlatformKeys,
  isValidPlatformKey
};
