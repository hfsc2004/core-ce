/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * anythingllm-launcher-standard.js
 *
 * Standalone AnythingLLM launcher for Standard Edition.
 * Contains proven launch logic extracted from Developer Edition's anythingllm-manager-linux-x64.js
 *
 * This module is self-contained with no external PSF module dependencies.
 */

const { shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  launchCompiledAnythingLLM,
  launchPortableAnythingLLM
} = require('./anythingllm-launcher-standard-launchers');
const utils = require('./anythingllm-launcher-standard-utils');

let backendProcess = null;
let frontendProcess = null;
let backendPort = null;
let frontendPort = null;

function attachProcessLogging(proc, name, onExit) {
  proc.stdout.on('data', (data) => {
    console.log(`[AnythingLLM ${name}]`, data.toString().trim());
  });

  proc.stderr.on('data', (data) => {
    console.log(`[AnythingLLM ${name}]`, data.toString().trim());
  });

  proc.on('exit', (code) => {
    console.log(`[AnythingLLM Standard] ${name} exited with code ${code}`);
    onExit();
  });
}

function buildYarnEnv(anythingPath, ollamaPort, storageDir) {
  return {
    ...process.env,
    OLLAMA_BASE_URL: `http://localhost:${ollamaPort}`,
    OLLAMA_BASE_PATH: `http://localhost:${ollamaPort}`,
    OLLAMA_API_BASE_PATH: `http://localhost:${ollamaPort}`,
    OLLAMA_HOST: `http://localhost:${ollamaPort}`,
    SERVER_PORT: backendPort.toString(),
    VITE_API_BASE: `http://localhost:${backendPort}/api`,
    PORT: frontendPort.toString(),
    VITE_PORT: frontendPort.toString(),
    FRONTEND_PORT: frontendPort.toString(),
    STORAGE_DIR: storageDir,
    DOTENV_CONFIG_PATH: path.join(anythingPath, '.env')
  };
}

async function launchWithYarn(anythingPath, ollamaPort) {
  if (!fs.existsSync(anythingPath)) {
    return { success: false, message: `AnythingLLM not found: ${anythingPath}` };
  }

  const packageJsonPath = path.join(anythingPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { success: false, message: 'AnythingLLM not properly installed (missing package.json)' };
  }

  if (!utils.checkYarnAvailable()) {
    return {
      success: false,
      message: 'AnythingLLM requires yarn to be installed. Please install yarn: npm install -g yarn'
    };
  }

  const loading = utils.createLoadingWindow(backendPort, frontendPort);

  try {
    const storageDir = utils.ensureStorageDir(anythingPath);

    loading.updateStatus('Configuring AnythingLLM...');
    utils.createEnvFiles(anythingPath, ollamaPort, backendPort, frontendPort);

    utils.installDependenciesIfNeeded(anythingPath, loading.updateStatus);

    const env = buildYarnEnv(anythingPath, ollamaPort, storageDir);

    loading.updateStatus('Starting backend server...');
    console.log(`[AnythingLLM Standard] Starting backend on port ${backendPort}`);
    backendProcess = spawn('yarn', ['dev:server'], {
      cwd: anythingPath,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env
    });
    attachProcessLogging(backendProcess, 'Backend', () => {
      backendProcess = null;
    });
    console.log(`[AnythingLLM Standard] Backend started - PID: ${backendProcess.pid}`);

    await new Promise((resolve) => setTimeout(resolve, 8000));

    loading.updateStatus('Starting frontend...');
    console.log(`[AnythingLLM Standard] Starting frontend on port ${frontendPort}`);
    frontendProcess = spawn('yarn', ['dev:frontend', '--port', frontendPort.toString()], {
      cwd: anythingPath,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env
    });
    attachProcessLogging(frontendProcess, 'Frontend', () => {
      frontendProcess = null;
    });
    console.log(`[AnythingLLM Standard] Frontend started - PID: ${frontendProcess.pid}`);

    loading.updateStatus('Waiting for servers...');
    console.log('[AnythingLLM Standard] Waiting for servers to be ready...');

    const readiness = await utils.waitForServersReady(
      backendPort,
      frontendPort,
      loading.updateStatus,
      90000
    );

    if (!readiness.backendReady || !readiness.frontendReady) {
      console.error('[AnythingLLM Standard] Servers did not start in time');
      loading.close();
      await stopAnythingLLM();
      return { success: false, message: 'AnythingLLM failed to start in time' };
    }

    loading.close();

    const url = `http://127.0.0.1:${frontendPort}`;
    console.log(`[AnythingLLM Standard] Opening browser: ${url}`);
    shell.openExternal(url);

    return {
      success: true,
      port: frontendPort,
      url,
      message: 'AnythingLLM started successfully',
      backendPid: backendProcess.pid,
      frontendPid: frontendProcess.pid
    };
  } catch (err) {
    console.error('[AnythingLLM Standard] Error:', err);
    loading.close();
    await stopAnythingLLM();
    return { success: false, message: err.message };
  }
}

async function launchAnythingLLM(options) {
  const { appDir, ollamaPort, backendPort: bPort, frontendPort: fPort, gpuInfo = null } = options;

  backendPort = bPort;
  frontendPort = fPort;

  console.log('[AnythingLLM Standard] ================================================');
  console.log('[AnythingLLM Standard] Launching AnythingLLM');
  console.log('[AnythingLLM Standard] ================================================');
  console.log(`[AnythingLLM Standard] App Dir: ${appDir}`);
  console.log(`[AnythingLLM Standard] Ollama Port: ${ollamaPort}`);
  console.log(`[AnythingLLM Standard] Backend Port: ${backendPort}`);
  console.log(`[AnythingLLM Standard] Frontend Port: ${frontendPort}`);
  if (gpuInfo) {
    console.log(`[AnythingLLM Standard] GPU: ${gpuInfo.name || gpuInfo.accelerationType || 'unknown'}`);
  }

  if (backendProcess && !backendProcess.killed) {
    console.log('[AnythingLLM Standard] Already running');
    return {
      success: true,
      port: frontendPort,
      url: `http://127.0.0.1:${frontendPort}`,
      message: 'Already running',
      backendPid: backendProcess.pid,
      frontendPid: frontendProcess ? frontendProcess.pid : null
    };
  }

  const anythingPath = path.join(appDir, '..', 'binaries', 'anythingllm');
  const platformDir = utils.detectPlatformDir();
  const binaryName = process.platform === 'win32' ? 'anythingllm-server.exe' : 'anythingllm-server';
  const compiledBinaryPath = path.join(anythingPath, platformDir, binaryName);

  if (fs.existsSync(compiledBinaryPath)) {
    console.log('[AnythingLLM Standard] Using compiled binary:', compiledBinaryPath);
    const compiledResult = await launchCompiledAnythingLLM({
      binaryPath: compiledBinaryPath,
      anythingPath,
      platformDir,
      ollamaPort
    });
    if (compiledResult?.success) {
      backendPort = compiledResult.backendPort;
      frontendPort = compiledResult.frontendPort;
      backendProcess = compiledResult.backendProcess || null;
    }
    return compiledResult;
  }

  const nodeLocalName = process.platform === 'win32' ? 'node.exe' : 'node';
  const portableNodePath = path.join(anythingPath, platformDir, 'bin', nodeLocalName);
  const serverArchivePath = path.join(anythingPath, platformDir, 'server.tar.gz');
  const serverDir = path.join(anythingPath, platformDir, 'server');
  const hasPortableNode = fs.existsSync(portableNodePath);
  const hasServerArchive = fs.existsSync(serverArchivePath);
  const hasServerDir = fs.existsSync(serverDir);

  if (hasPortableNode && (hasServerArchive || hasServerDir)) {
    console.log('[AnythingLLM Standard] Using portable Node.js:', portableNodePath);
    const portableResult = await launchPortableAnythingLLM({
      nodePath: portableNodePath,
      anythingPath,
      platformDir,
      ollamaPort
    });
    if (portableResult?.success) {
      backendPort = portableResult.backendPort;
      frontendPort = portableResult.frontendPort;
      backendProcess = portableResult.backendProcess || null;
    }
    return portableResult;
  }

  console.log('[AnythingLLM Standard] No compiled binary, using yarn-based launch');
  return launchWithYarn(anythingPath, ollamaPort);
}

async function stopAnythingLLM() {
  console.log('[AnythingLLM Standard] Stopping AnythingLLM...');

  await utils.killManagedProcess(frontendProcess, 'frontend');
  await utils.killManagedProcess(backendProcess, 'backend');

  frontendProcess = null;
  backendProcess = null;

  console.log('[AnythingLLM Standard] Stopped');
  return { success: true, message: 'Stopped' };
}

function isRunning() {
  return (backendProcess !== null && !backendProcess.killed) ||
    (frontendProcess !== null && !frontendProcess.killed);
}

function getProcessInfo() {
  return {
    backend: backendProcess ? { pid: backendProcess.pid, killed: backendProcess.killed } : null,
    frontend: frontendProcess ? { pid: frontendProcess.pid, killed: frontendProcess.killed } : null,
    backendPort,
    frontendPort
  };
}

module.exports = {
  launchAnythingLLM,
  stopAnythingLLM,
  isRunning,
  getProcessInfo
};
