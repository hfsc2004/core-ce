/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
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
  return null;
}

function getOllamaBinaryPath(binariesDir) {
  const platformDir = getPlatformDir();
  if (!platformDir) return null;

  const binaryName = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
  const binaryPath = path.join(binariesDir, 'ollama', platformDir, 'bin', binaryName);
  return fs.existsSync(binaryPath) ? binaryPath : null;
}

function getWebUIBinaryPath(binariesDir) {
  const platformDir = getPlatformDir();
  if (!platformDir) return null;

  const binaryName = process.platform === 'win32' ? 'open-webui.exe' : 'open-webui';
  const bundlePath = path.join(binariesDir, 'python-webui', platformDir);

  const standaloneBinary = path.join(bundlePath, 'dist', 'open_webui_launcher.dist', binaryName);
  if (fs.existsSync(standaloneBinary)) {
    return {
      path: standaloneBinary,
      isCompiled: true,
      workingDir: path.dirname(standaloneBinary)
    };
  }

  const compiledBinary = path.join(bundlePath, 'dist', binaryName);
  if (fs.existsSync(compiledBinary)) {
    return {
      path: compiledBinary,
      isCompiled: true,
      workingDir: bundlePath
    };
  }

  const venvBinary = path.join(bundlePath, 'venv', 'bin', binaryName);
  if (fs.existsSync(venvBinary)) {
    return {
      path: venvBinary,
      isCompiled: false,
      workingDir: bundlePath
    };
  }

  return null;
}

function findAnythingLLMInstallation(binariesDir) {
  const platformDir = getPlatformDir();
  const anythingBasePath = path.join(binariesDir, 'anythingllm');

  const binaryName = process.platform === 'win32' ? 'anythingllm-server.exe' : 'anythingllm-server';
  const compiledPath = platformDir
    ? path.join(anythingBasePath, platformDir, binaryName)
    : null;

  if (compiledPath && fs.existsSync(compiledPath)) {
    return {
      found: true,
      type: 'compiled',
      binaryPath: compiledPath,
      basePath: anythingBasePath,
      message: 'Compiled binary found'
    };
  }

  const nodeLocalName = process.platform === 'win32' ? 'node.exe' : 'node';
  const portableNodePath = platformDir
    ? path.join(anythingBasePath, platformDir, 'bin', nodeLocalName)
    : null;
  const serverArchivePath = platformDir
    ? path.join(anythingBasePath, platformDir, 'server.tar.gz')
    : null;
  const serverDirPath = platformDir
    ? path.join(anythingBasePath, platformDir, 'server')
    : null;

  if (
    portableNodePath &&
    (fs.existsSync(serverArchivePath) || fs.existsSync(serverDirPath)) &&
    fs.existsSync(portableNodePath)
  ) {
    return {
      found: true,
      type: 'portable',
      binaryPath: portableNodePath,
      basePath: anythingBasePath,
      platformDir,
      serverDir: serverDirPath,
      serverArchive: serverArchivePath,
      message: 'Portable Node.js installation found'
    };
  }

  const packageJsonPath = path.join(anythingBasePath, 'package.json');
  const serverPath = path.join(anythingBasePath, 'server');
  const frontendPath = path.join(anythingBasePath, 'frontend');

  if (fs.existsSync(packageJsonPath) && fs.existsSync(serverPath) && fs.existsSync(frontendPath)) {
    const serverNodeModules = path.join(serverPath, 'node_modules');
    const frontendNodeModules = path.join(frontendPath, 'node_modules');

    if (fs.existsSync(serverNodeModules) && fs.existsSync(frontendNodeModules)) {
      return {
        found: true,
        type: 'yarn',
        binaryPath: null,
        basePath: anythingBasePath,
        message: 'Source installation found'
      };
    }

    return {
      found: false,
      type: null,
      message: 'AnythingLLM found but dependencies not installed. Run yarn install in the anythingllm directory.'
    };
  }

  return {
    found: false,
    type: null,
    message: 'AnythingLLM not found. Please install AnythingLLM in the binaries/anythingllm directory.'
  };
}

function createAnythingLLMEnvFiles(basePath, ollamaPort, serverPort) {
  const rootEnv = `OLLAMA_BASE_URL=http://127.0.0.1:${ollamaPort}\nSERVER_PORT=${serverPort}\nSTORAGE_DIR=${path.join(basePath, 'server', 'storage')}\nDISABLE_TELEMETRY=true\n`;

  fs.writeFileSync(path.join(basePath, '.env'), rootEnv);

  const serverEnvPath = path.join(basePath, 'server', '.env');
  if (fs.existsSync(path.dirname(serverEnvPath))) {
    fs.writeFileSync(serverEnvPath, rootEnv);
  }

  const serverEnvDevPath = path.join(basePath, 'server', '.env.development');
  if (fs.existsSync(path.dirname(serverEnvDevPath))) {
    fs.writeFileSync(serverEnvDevPath, rootEnv);
  }
}

module.exports = {
  getPlatformDir,
  getOllamaBinaryPath,
  getWebUIBinaryPath,
  findAnythingLLMInstallation,
  createAnythingLLMEnvFiles
};
