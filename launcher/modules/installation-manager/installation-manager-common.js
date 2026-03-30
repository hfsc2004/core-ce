/**
 * Pseudo Science Fiction Core Collection - Installation Manager Common
 * SHARED FUNCTIONS - Platform-independent operations
 * 
 * Contains functions that work identically across all platforms.
 * 
 * @module installation-manager-common
 * @version 1.1.3 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PYTHON_WEBUI_REQUIRED_MODULES = [
  { module: 'open_webui', pip: 'open-webui' },
  { module: 'mpremote', pip: 'mpremote' },
  { module: 'transformers', pip: 'transformers' },
  // Optional for now: upstream chatterbox-tts currently fails on some Python 3.12 setups.
  { module: 'chatterbox', pip: 'chatterbox-tts', optional: true },
  { module: 'phonemizer', pip: 'phonemizer' },
  { module: 'torch', pip: 'torch' },
  { module: 'numpy', pip: 'numpy' }
];

function probePythonModule(pythonExe, moduleName) {
  const probe = spawnSync(
    pythonExe,
    ['-c', `import ${moduleName}; print("ok")`],
    { encoding: 'utf8', timeout: 15000 }
  );
  return !probe.error && probe.status === 0;
}

function installPythonPackages(pythonExe, packages = []) {
  const unique = Array.from(new Set((Array.isArray(packages) ? packages : []).filter(Boolean)));
  if (unique.length === 0) {
    return { success: true, output: '' };
  }
  const installOne = (pkg) => {
    const args = ['-m', 'pip', 'install'];
    if (pkg === 'torch') {
      const isWinX64 = process.platform === 'win32' && process.arch === 'x64';
      const isLinuxX64 = process.platform === 'linux' && process.arch === 'x64';
      if (isWinX64 || isLinuxX64) {
        args.push('--index-url', 'https://download.pytorch.org/whl/cu118');
      } else {
        args.push('--index-url', 'https://download.pytorch.org/whl/cpu');
      }
    }
    args.push(pkg);
    return spawnSync(pythonExe, args, { encoding: 'utf8', timeout: 300000 });
  };

  let combinedOutput = '';
  for (const pkg of unique) {
    const install = installOne(pkg);
    const output = `${String(install.stdout || '').trim()}\n${String(install.stderr || '').trim()}`.trim();
    if (output) combinedOutput += `${output}\n`;
    if (install.error || install.status !== 0) {
      return {
        success: false,
        output: combinedOutput.trim(),
        error: install.error?.message || `pip install ${pkg} exited with code ${install.status}`
      };
    }
  }
  return { success: true, output: combinedOutput.trim() };
}

function hasCommand(cmd) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const probe = spawnSync(checker, [cmd], { encoding: 'utf8', timeout: 8000 });
  return !probe.error && probe.status === 0;
}

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function getManagedRuntimeEnv(fromPath, scope = 'general') {
  const projectRoot = path.join(fromPath, '..');
  const safeScope = String(scope || 'general').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const root = path.join(projectRoot, '.psf', 'toolchains', 'cache', safeScope);
  const xdgCache = path.join(root, 'xdg');
  const pipCache = path.join(root, 'pip');
  const uvCache = path.join(root, 'uv');
  const npmCache = path.join(root, 'npm');
  const yarnCache = path.join(root, 'yarn');

  [root, xdgCache, pipCache, uvCache, npmCache, yarnCache].forEach(ensureDir);

  return {
    XDG_CACHE_HOME: xdgCache,
    PIP_CACHE_DIR: pipCache,
    UV_CACHE_DIR: uvCache,
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
    npm_config_cache: npmCache,
    NPM_CONFIG_CACHE: npmCache,
    YARN_CACHE_FOLDER: yarnCache,
    npm_config_update_notifier: 'false',
    NO_UPDATE_NOTIFIER: '1'
  };
}

/**
 * Get installation directory for a service
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @param {string} serviceType - Type of service (python-webui, anythingllm, ollama)
 * @returns {string} Installation directory path
 */
function getInstallationPath(fromPath, serviceType) {
  const projectRoot = path.join(fromPath, '..');
  
  if (serviceType === 'python-webui') {
    const platform = process.platform;
    const arch = process.arch;
    
    let platformDir;
    if (platform === 'win32') {
      platformDir = arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
    } else if (platform === 'darwin') {
      platformDir = arch === 'arm64' ? 'macos-arm' : 'macos-intel';
    } else {
      platformDir = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    }
    
    return path.join(projectRoot, 'binaries', 'python-webui', platformDir);
  } else if (serviceType === 'anythingllm') {
    return path.join(projectRoot, 'binaries', 'anythingllm');
  } else if (serviceType === 'ollama') {
    // Ollama is expected to be installed locally by user
    return null;
  }
  
  throw new Error(`Unknown service type: ${serviceType}`);
}

/**
 * Check if Python WebUI is installed
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {Promise<Object>} { success, message, path }
 */
async function checkPythonWebUI(fromPath) {
  try {
    const installPath = getInstallationPath(fromPath, 'python-webui');
    const venvDir = path.join(installPath, 'venv');
    
    const platform = process.platform;
    const pythonExe = platform === 'win32' 
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python');
    
    if (fs.existsSync(pythonExe)) {
      const missing = PYTHON_WEBUI_REQUIRED_MODULES.filter((item) => !probePythonModule(pythonExe, item.module));
      const missingRequired = missing.filter((item) => item.optional !== true);
      const missingOptional = missing.filter((item) => item.optional === true);
      const installedPkgs = [];
      const optionalInstallFailed = [];

      if (missingRequired.length > 0) {
        const installPkgs = missingRequired.map((item) => item.pip);
        const repaired = installPythonPackages(pythonExe, installPkgs);
        if (!repaired.success) {
          return {
            success: false,
            message:
              `⚠️ Python WebUI environment found, but required packages are missing and auto-repair failed.\n` +
              `Missing: ${installPkgs.join(', ')}\n` +
              `Path: ${venvDir}\n` +
              `Error: ${repaired.error}`,
            path: venvDir
          };
        }
        installedPkgs.push(...installPkgs);
      }

      if (missingOptional.length > 0) {
        for (const item of missingOptional) {
          const repaired = installPythonPackages(pythonExe, [item.pip]);
          if (repaired.success) {
            installedPkgs.push(item.pip);
          } else {
            optionalInstallFailed.push(item.pip);
          }
        }
      }

      if (missing.length > 0) {
        const stillMissing = PYTHON_WEBUI_REQUIRED_MODULES.filter((item) => !probePythonModule(pythonExe, item.module));
        const stillMissingRequired = stillMissing.filter((item) => item.optional !== true);
        const stillMissingOptional = stillMissing.filter((item) => item.optional === true);
        if (stillMissingRequired.length > 0) {
          return {
            success: false,
            message:
              `⚠️ Auto-repair completed, but some required packages are still unavailable.\n` +
              `Missing: ${stillMissingRequired.map((item) => item.pip).join(', ')}\n` +
              `Path: ${venvDir}`,
            path: venvDir
          };
        }

        const lines = [];
        lines.push('✅ Python WebUI environment repaired and verified.');
        if (installedPkgs.length > 0) {
          lines.push(`Installed missing packages: ${installedPkgs.join(', ')}`);
        }
        if (stillMissingOptional.length > 0 || optionalInstallFailed.length > 0) {
          lines.push(`Optional packages not installed: ${stillMissingOptional.map((item) => item.pip).join(', ') || optionalInstallFailed.join(', ')}`);
          lines.push('TTS models that require those optional packages will remain unavailable.');
        }
        lines.push(`Path: ${venvDir}`);
        return { success: true, message: lines.join('\n'), path: venvDir };
      }

      if (process.platform === 'linux') {
        const hasEspeakNg = hasCommand('espeak-ng');
        const hasEspeak = hasCommand('espeak');
        if (!hasEspeakNg && !hasEspeak) {
          return {
            success: false,
            message:
              `⚠️ Python WebUI environment found, but speech backend binary is missing.\n` +
              `Install system package: espeak-ng (or espeak)\n` +
              `Ubuntu/Debian: sudo apt install espeak-ng\n` +
              `Path: ${venvDir}`,
            path: venvDir
          };
        }
      }

      return {
        success: true,
        message: `✅ Python WebUI environment found (Open WebUI + mpremote + voice runtime + phonemizer)\nPath: ${venvDir}`,
        path: venvDir
      };
    } else {
      return {
        success: false,
        message: `❌ Python WebUI environment not found.\nLooking for: ${pythonExe}\nClick "Build" to create it.`
      };
    }
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Check if AnythingLLM is installed
 * @param {string} fromPath - Path to calculate from (usually __dirname)
 * @returns {Promise<Object>} { success, message, path }
 */
async function checkAnythingLLM(fromPath) {
  try {
    const installPath = getInstallationPath(fromPath, 'anythingllm');
    const packageJsonPath = path.join(installPath, 'package.json');
    const serverPath = path.join(installPath, 'server');
    const frontendPath = path.join(installPath, 'frontend');
    
    // Check if git repo exists and has been installed
    if (fs.existsSync(packageJsonPath) && 
        fs.existsSync(serverPath) && 
        fs.existsSync(frontendPath)) {
      
      // AnythingLLM is a monorepo - check for node_modules in subdirectories
      const serverNodeModules = path.join(installPath, 'server', 'node_modules');
      const frontendNodeModules = path.join(installPath, 'frontend', 'node_modules');
      const collectorNodeModules = path.join(installPath, 'collector', 'node_modules');
      
      // All three subdirectories should have node_modules
      if (fs.existsSync(serverNodeModules) && 
          fs.existsSync(frontendNodeModules) && 
          fs.existsSync(collectorNodeModules)) {
        return {
          success: true,
          installed: true,
          message: `✅ AnythingLLM is installed\nPath: ${installPath}`,
          path: installPath,
          needsBuild: false
        };
      } else {
        return {
          success: false,
          installed: false,
          message: `⚠️ AnythingLLM cloned but dependencies not installed\nPath: ${installPath}\nClick "Install" to complete setup.`,
          path: installPath,
          needsBuild: true
        };
      }
    } else {
      return {
        success: false,
        installed: false,
        message: `❌ AnythingLLM not found.\nClick "Install" to clone and build from GitHub.`,
        needsBuild: true
      };
    }
  } catch (err) {
    return { success: false, installed: false, message: err.message, needsBuild: true };
  }
}

/**
 * Delete installation
 * @param {string} fromPath - Path to calculate from
 * @param {string} type - Installation type (python-webui, anythingllm)
 * @returns {Promise<Object>} { success, message }
 */
async function deleteInstallation(fromPath, type) {
  try {
    const installPath = getInstallationPath(fromPath, type);
    
    if (!installPath) {
      return { success: false, message: 'Invalid installation type' };
    }
    
    if (!fs.existsSync(installPath)) {
      return { success: true, message: 'Installation does not exist' };
    }
    
    // Delete directory recursively
    fs.rmSync(installPath, { recursive: true, force: true });
    
    return {
      success: true,
      message: `✅ ${type} installation deleted successfully`
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to delete ${type}: ${err.message}`
    };
  }
}

/**
 * Check all installations
 * @param {string} fromPath - Path to calculate from
 * @returns {Promise<Object>} { pythonWebui, anythingllm }
 */
async function checkAllInstallations(fromPath) {
  const pythonWebui = await checkPythonWebUI(fromPath);
  const anythingllm = await checkAnythingLLM(fromPath);
  
  return {
    pythonWebui,
    anythingllm
  };
}

module.exports = {
  getInstallationPath,
  checkPythonWebUI,
  checkAnythingLLM,
  deleteInstallation,
  checkAllInstallations,
  getManagedRuntimeEnv
};
