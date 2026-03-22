/**
 * Pseudo Science Fiction Core Collection - Installation Manager macOS Intel
 * Platform-specific implementation for macOS Intel systems
 * @version 1.1.2 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

const common = require('./installation-manager-common');

async function buildPythonWebUI(fromPath, outputCallback = null) {
  try {
    const buildScript = path.join(fromPath, 'build-python-webui-macos.sh');
    const runtimeEnv = common.getManagedRuntimeEnv(fromPath, 'python-webui');
    
    if (!fs.existsSync(buildScript)) {
      return { 
        success: false, 
        message: `Build script not found: ${buildScript}` 
      };
    }
    
    // Make executable
    try {
      fs.chmodSync(buildScript, '755');
    } catch (e) {
      console.warn('[Installation Manager macOS Intel] Could not chmod build script:', e);
    }
    
    return new Promise((resolve) => {
      const buildProcess = spawn('bash', [buildScript], {
        cwd: fromPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...runtimeEnv }
      });
      
      let output = '';
      
      buildProcess.stdout?.on('data', (data) => {
        const line = data.toString();
        output += line;
        if (outputCallback) outputCallback(line);
        console.log('[Installation Manager macOS Intel] [Python WebUI]', line.trim());
      });
      
      buildProcess.stderr?.on('data', (data) => {
        const line = data.toString();
        output += line;
        if (outputCallback) outputCallback(line);
        console.log('[Installation Manager] [Python WebUI]', line.trim());
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: '✅ Python WebUI built successfully!',
            output
          });
        } else {
          resolve({
            success: false,
            message: `❌ Build failed with code ${code}`,
            output
          });
        }
      });
      
      buildProcess.on('error', (err) => {
        resolve({
          success: false,
          message: `❌ Build error: ${err.message}`,
          output
        });
      });
    });
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function installAnythingLLM(fromPath, outputCallback = null) {
  try {
    const runtimeEnv = common.getManagedRuntimeEnv(fromPath, 'anythingllm');
    const installPath = common.getInstallationPath(fromPath, 'anythingllm');
    const repoUrl = 'https://github.com/Mintplex-Labs/anything-llm.git';
    
    console.log('[Installation Manager macOS Intel] Starting AnythingLLM installation...');
    
    let output = '';
    const sendOutput = (line) => {
      output += line + '\n';
      if (outputCallback) outputCallback(line);
      console.log('[Installation Manager macOS Intel] [AnythingLLM]', line);
    };
    
    const parentDir = path.dirname(installPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    if (fs.existsSync(installPath)) {
      sendOutput('⚠️  Directory exists, checking...');
      const check = await common.checkAnythingLLM(fromPath);
      if (check.success) {
        return {
          success: true,
          message: '✅ AnythingLLM already installed!',
          output,
          path: installPath
        };
      } else if (!check.needsBuild) {
        sendOutput('⚠️  Invalid installation, removing...');
        fs.rmSync(installPath, { recursive: true, force: true });
      }
    }
    
    sendOutput('📥 Step 1/4: Cloning repository...');
    try {
      await execPromise(`git clone ${repoUrl} "${installPath}"`, {
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, ...runtimeEnv }
      });
      sendOutput('✅ Repository cloned');
    } catch (cloneErr) {
      sendOutput(`❌ Git clone failed: ${cloneErr.message}`);
      return { success: false, message: `Git clone failed: ${cloneErr.message}`, output };
    }
    
    sendOutput('📦 Step 2/4: Installing dependencies...');
    try {
      const { stdout, stderr } = await execPromise('yarn setup', {
        cwd: installPath,
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, ...runtimeEnv }
      });
      if (stdout) sendOutput(stdout);
      if (stderr) sendOutput(stderr);
      sendOutput('✅ Dependencies installed');
    } catch (setupErr) {
      sendOutput(`❌ Yarn setup failed: ${setupErr.message}`);
      return { success: false, message: `Yarn setup failed: ${setupErr.message}`, output };
    }
    
    sendOutput('⚙️  Step 3/4: Setting up environment...');
    try {
      const { stdout, stderr } = await execPromise('yarn setup:envs', {
        cwd: installPath,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
        env: { ...process.env, ...runtimeEnv }
      });
      if (stdout) sendOutput(stdout);
      if (stderr) sendOutput(stderr);
      sendOutput('✅ Environment configured');
    } catch (envsErr) {
      sendOutput(`⚠️  yarn setup:envs failed, creating manually...`);
      
      const serverEnvPath = path.join(installPath, 'server', '.env.development');
      const serverEnvContent = `SERVER_PORT=3001\nSTORAGE_DIR=./storage\n`;
      fs.writeFileSync(serverEnvPath, serverEnvContent, 'utf8');
      
      const frontendEnvPath = path.join(installPath, 'frontend', '.env');
      const frontendEnvContent = `VITE_API_BASE=http://localhost:3001/api\n`;
      fs.writeFileSync(frontendEnvPath, frontendEnvContent, 'utf8');
      
      sendOutput('✅ Environment files created manually');
    }
    
    sendOutput('🔨 Step 4/4: Building frontend...');
    try {
      const { stdout, stderr } = await execPromise('cd frontend && yarn build', {
        cwd: installPath,
        maxBuffer: 100 * 1024 * 1024,
        shell: '/bin/bash',
        env: { ...process.env, ...runtimeEnv }
      });
      if (stdout) sendOutput(stdout);
      if (stderr) sendOutput(stderr);
      sendOutput('✅ Frontend built successfully');
    } catch (buildErr) {
      sendOutput(`⚠️  Frontend build had issues: ${buildErr.message}`);
    }
    
    sendOutput('✅ AnythingLLM installation complete!');
    return {
      success: true,
      message: '✅ AnythingLLM installed successfully!',
      output,
      path: installPath
    };
    
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function killAnythingLLMProcesses() {
  console.log('[Installation Manager macOS Intel] ðŸ”ª Killing AnythingLLM processes...');
  
  try {
    await execPromise('pkill -9 -f "anything-llm" 2>/dev/null || true');
    await execPromise('pkill -9 -f "node.*server" 2>/dev/null || true');
    console.log('[Installation Manager macOS Intel] ✅ Killed AnythingLLM processes');
    return { success: true };
  } catch (e) {
    console.log('[Installation Manager macOS Intel] ℹ️  No processes found');
    return { success: true };
  }
}

module.exports = {
  buildPythonWebUI,
  installAnythingLLM,
  killAnythingLLMProcesses
};
