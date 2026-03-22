/**
 * compile-webui-nuitka.js
 * 
 * Compiles Open WebUI from Python to C/C++ and then to native binary using Nuitka.
 * This is TRUE compilation - not bytecode bundling like PyInstaller.
 * 
 * Nuitka: Python → C → Native Machine Code
 * 
 * Requirements on build machine:
 *   - Python 3.x with pip
 *   - C compiler (gcc/clang on Linux/Mac, MSVC on Windows)
 *   - Nuitka (pip install nuitka)
 * 
 * The resulting binary:
 *   - Runs WITHOUT Python installed
 *   - Faster startup and execution
 *   - Smaller than venv (strips unused code)
 *   - Native machine code (not bytecode)
 * 
 * @module compile-webui-nuitka
 * @version 1.1.2 - March 5, 2026
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  createWrapperScript,
  createNuitkaArgs,
  createDataChecks
} = require('./compile-webui-nuitka-template');

/**
 * Get platform-specific paths
 */
function getPlatformInfo() {
  const platform = process.platform;
  const arch = process.arch;
  
  let platformDir;
  if (platform === 'linux' && arch === 'x64') platformDir = 'linux-x64';
  else if (platform === 'linux' && arch === 'arm64') platformDir = 'linux-arm64';
  else if (platform === 'darwin' && arch === 'arm64') platformDir = 'macos-arm';
  else if (platform === 'darwin' && arch === 'x64') platformDir = 'macos-intel';
  else if (platform === 'win32' && arch === 'x64') platformDir = 'windows-x64';
  else if (platform === 'win32' && arch === 'arm64') platformDir = 'windows-arm64';
  else return null;
  
  return {
    platform,
    arch,
    platformDir,
    isWindows: platform === 'win32',
    pythonBin: platform === 'win32' ? 'python.exe' : 'python',
    pipBin: platform === 'win32' ? 'pip.exe' : 'pip',
    exeExt: platform === 'win32' ? '.exe' : ''
  };
}

/**
 * Check if C compiler is available
 */
function checkCCompiler() {
  const compilers = process.platform === 'win32' 
    ? ['cl.exe', 'gcc.exe', 'clang.exe']
    : ['gcc', 'clang', 'cc'];
  
  for (const compiler of compilers) {
    try {
      execSync(`which ${compiler} 2>/dev/null || where ${compiler} 2>nul`, { stdio: 'pipe' });
      return { available: true, compiler };
    } catch (e) {
      // Try next
    }
  }
  
  return { available: false, compiler: null };
}

/**
 * Check all system dependencies required for Nuitka compilation
 * @returns {Object} { ready, missing, installCommand }
 */
function checkSystemDependencies() {
  const missing = [];
  const platform = process.platform;
  
  // Check C compiler
  const compilerCheck = checkCCompiler();
  if (!compilerCheck.available) {
    missing.push('gcc/clang (C compiler)');
  }
  
  // Linux-specific: patchelf is required
  if (platform === 'linux') {
    try {
      execSync('which patchelf', { stdio: 'pipe' });
    } catch (e) {
      missing.push('patchelf');
    }
  }
  
  // Check for ccache (optional but speeds up recompilation)
  // Not required, just nice to have
  
  if (missing.length === 0) {
    return { ready: true, missing: [], installCommand: null };
  }
  
  // Generate install command based on platform
  let installCommand;
  if (platform === 'linux') {
    // Detect package manager
    try {
      execSync('which apt', { stdio: 'pipe' });
      installCommand = `sudo apt install -y build-essential patchelf`;
    } catch (e) {
      try {
        execSync('which dnf', { stdio: 'pipe' });
        installCommand = `sudo dnf install -y gcc gcc-c++ patchelf`;
      } catch (e2) {
        try {
          execSync('which yum', { stdio: 'pipe' });
          installCommand = `sudo yum install -y gcc gcc-c++ patchelf`;
        } catch (e3) {
          installCommand = `Install: ${missing.join(', ')} using your package manager`;
        }
      }
    }
  } else if (platform === 'darwin') {
    installCommand = `xcode-select --install`;
  } else {
    installCommand = `Install Visual Studio Build Tools with C++ support`;
  }
  
  return { ready: false, missing, installCommand };
}

/**
 * Compile Open WebUI using Nuitka
 * 
 * @param {string} projectRoot - Project root directory (where binaries/ lives)
 * @param {Function} progressCallback - Progress callback ({ status, progress, log })
 * @returns {Promise<Object>} { success, outputPath, message }
 */
async function compileOpenWebUI(projectRoot, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
    if (log) console.log(`[Nuitka] ${log}`);
  };
  
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return { success: false, message: 'Unsupported platform' };
  }
  
  sendProgress('Preparing Nuitka build...', 0, `Platform: ${platformInfo.platformDir}`);
  
  // Check ALL system dependencies upfront
  sendProgress('Checking system dependencies...', 2, 'C compiler, patchelf, etc.');
  const depCheck = checkSystemDependencies();
  if (!depCheck.ready) {
    return { 
      success: false, 
      message: `Missing system dependencies: ${depCheck.missing.join(', ')}\n\nRun this command first:\n${depCheck.installCommand}` 
    };
  }
  sendProgress('System dependencies OK', 5, 'All build tools available');
  
  // Paths
  const webuiDir = path.join(projectRoot, 'binaries', 'python-webui', platformInfo.platformDir);
  const venvDir = path.join(webuiDir, 'venv');
  const venvBin = platformInfo.isWindows 
    ? path.join(venvDir, 'Scripts')
    : path.join(venvDir, 'bin');
  const pythonExe = path.join(venvBin, platformInfo.pythonBin);
  const pipExe = path.join(venvBin, platformInfo.pipBin);
  const outputDir = path.join(webuiDir, 'dist');
  let outputBinary = path.join(outputDir, `open-webui${platformInfo.exeExt}`);
  
  // Check venv exists
  if (!fs.existsSync(pythonExe)) {
    return { 
      success: false, 
      message: `Python venv not found at ${venvDir}. Build Open WebUI first.` 
    };
  }
  
  sendProgress('Checking Open WebUI installation...', 8, 'Verifying venv');
  
  // Check open-webui is installed
  try {
    execSync(`"${pythonExe}" -c "import open_webui"`, { stdio: 'pipe' });
    sendProgress('Open WebUI verified', 10, 'Package found in venv');
  } catch (err) {
    return { 
      success: false, 
      message: 'open-webui not installed in venv. Build Open WebUI first.' 
    };
  }
  
  // Install Nuitka if not present
  sendProgress('Checking Nuitka...', 12, 'Verifying Nuitka installation');
  
  try {
    execSync(`"${pythonExe}" -c "import nuitka"`, { stdio: 'pipe' });
    sendProgress('Nuitka found', 15, 'Already installed');
  } catch (err) {
    sendProgress('Installing Nuitka...', 12, 'Installing via pip (one-time)');
    try {
      execSync(`"${pipExe}" install nuitka ordered-set zstandard`, { 
        cwd: webuiDir,
        stdio: 'pipe',
        timeout: 300000 // 5 min timeout
      });
      sendProgress('Nuitka installed', 15, 'Installation complete');
    } catch (installErr) {
      return { success: false, message: `Failed to install Nuitka: ${installErr.message}` };
    }
  }
  
  // Find open-webui entry point
  sendProgress('Locating entry point...', 18, 'Finding open-webui module');
  
  let entryPoint;
  let sitePackages;
  try {
    const result = execSync(`"${pythonExe}" -c "import open_webui; print(open_webui.__file__)"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    
    entryPoint = path.dirname(result);
    sitePackages = path.dirname(path.dirname(entryPoint));
    sendProgress('Entry point found', 20, entryPoint);
  } catch (err) {
    return { success: false, message: 'Could not locate open-webui module' };
  }
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Create a wrapper script that Nuitka will compile
  // This handles the entry point properly
  const wrapperScript = createWrapperScript();

  const wrapperPath = path.join(webuiDir, 'open_webui_launcher.py');
  fs.writeFileSync(wrapperPath, wrapperScript);
  sendProgress('Wrapper script created', 22, wrapperPath);
  
  // Build Nuitka command
  sendProgress('Starting Nuitka compilation...', 25, 'This will take several hours (4-8+) for large ML apps');
  
  const nuitkaArgs = createNuitkaArgs({
    platformInfo,
    outputDir,
    entryPoint,
    wrapperPath,
    cpuJobs: Math.max(1, Math.floor(os.cpus().length / 2))
  });
  
  // Filter out data dirs/files if they don't exist
  // Each check removes ALL nuitkaArgs entries that match the pattern
  const dataChecks = createDataChecks(entryPoint);
  
  for (const check of dataChecks) {
    if (!fs.existsSync(check.dir)) {
      // Remove ALL nuitkaArgs entries matching this path component
      for (let i = nuitkaArgs.length - 1; i >= 0; i--) {
        if (nuitkaArgs[i].includes(check.match)) {
          console.log(`[Nuitka] Skipping missing data: ${check.dir} (${nuitkaArgs[i].substring(0, 60)}...)`);
          nuitkaArgs.splice(i, 1);
        }
      }
    }
  }
  
  console.log(`[Nuitka] Running: ${pythonExe} ${nuitkaArgs.join(' ')}`);
  
  return new Promise((resolve) => {
    const proc = spawn(pythonExe, nuitkaArgs, {
      cwd: webuiDir,
      env: {
        ...process.env,
        PATH: `${venvBin}${path.delimiter}${process.env.PATH}`,
        VIRTUAL_ENV: venvDir
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let lastProgress = 25;
    let lastStage = '';
    
    const processOutput = (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        
        console.log(`[Nuitka] ${line}`);
        
        // Parse Nuitka progress
        if (line.includes('Nuitka-Progress:')) {
          const match = line.match(/(\d+)\/(\d+)/);
          if (match) {
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            lastProgress = 25 + Math.floor((current / total) * 60);
            sendProgress('Compiling to C...', lastProgress, `${current}/${total} modules`);
          }
        } else if (line.includes('Nuitka:INFO: Starting')) {
          sendProgress('Starting compilation...', 28, line.substring(0, 80));
        } else if (line.includes('Backend C:')) {
          if (!lastStage.includes('Backend')) {
            lastStage = 'Backend C';
            sendProgress('Compiling C code...', 85, 'gcc/clang compilation');
          }
        } else if (line.includes('Linking')) {
          sendProgress('Linking...', 92, 'Creating executable');
        } else if (line.includes('Onefile:')) {
          sendProgress('Creating single file...', 95, 'Packaging into one executable');
        }
      }
    };
    
    proc.stdout.on('data', processOutput);
    proc.stderr.on('data', processOutput);
    
    proc.on('error', (err) => {
      resolve({ success: false, message: `Nuitka failed to start: ${err.message}` });
    });
    
    proc.on('exit', (code) => {
      // Clean up wrapper script
      try {
        fs.unlinkSync(wrapperPath);
      } catch (e) {}
      
      // Check for output - Nuitka puts it in a subdirectory
      // For standalone mode: open_webui_launcher.dist/open-webui (or open_webui_launcher)
      // For onefile mode: open-webui directly in output dir
      const possibleOutputs = [
        outputBinary,
        path.join(outputDir, `open_webui_launcher${platformInfo.exeExt}`),
        // Standalone mode outputs
        path.join(outputDir, 'open_webui_launcher.dist', `open-webui${platformInfo.exeExt}`),
        path.join(outputDir, 'open_webui_launcher.dist', `open_webui_launcher${platformInfo.exeExt}`),
        path.join(webuiDir, `open_webui_launcher${platformInfo.exeExt}`)
      ];
      
      let foundBinary = null;
      let isStandaloneMode = false;
      for (const p of possibleOutputs) {
        if (fs.existsSync(p)) {
          foundBinary = p;
          // Check if this is standalone mode (binary inside .dist folder)
          if (p.includes('.dist')) {
            isStandaloneMode = true;
          }
          break;
        }
      }
      
      if (code === 0 && foundBinary) {
        // For standalone mode, keep the folder structure
        // For onefile mode, move/rename to expected location if needed
        if (isStandaloneMode) {
          // Standalone: create a symlink or copy the binary to the expected location
          // The .dist folder contains all dependencies
          const distFolder = path.dirname(foundBinary);
          const targetBinary = path.join(outputDir, `open-webui${platformInfo.exeExt}`);
          
          // Create a wrapper script that runs the binary from the .dist folder
          // Or just note that the binary is in the .dist folder
          console.log(`[Nuitka] Standalone mode: binary at ${foundBinary}`);
          console.log(`[Nuitka] Standalone folder: ${distFolder}`);
          
          // Update outputBinary to point to the actual location
          outputBinary = foundBinary;
        } else if (foundBinary !== outputBinary) {
          fs.mkdirSync(path.dirname(outputBinary), { recursive: true });
          fs.renameSync(foundBinary, outputBinary);
        }
        
        // Make executable on Unix
        if (!platformInfo.isWindows) {
          try {
            fs.chmodSync(outputBinary, 0o755);
          } catch (e) {}
        }
        
        const stats = fs.statSync(outputBinary);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        
        sendProgress('Compilation complete!', 100, `Output: ${outputBinary} (${sizeMB} MB)`);
        
        resolve({
          success: true,
          outputPath: outputBinary,
          size: stats.size,
          message: `Open WebUI compiled successfully (${sizeMB} MB)`
        });
      } else {
        sendProgress('Compilation failed', 100, `Exit code: ${code}`);
        resolve({
          success: false,
          message: `Nuitka exited with code ${code}`
        });
      }
    });
  });
}

/**
 * Check if compiled Open WebUI exists
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Object} { exists, path, size }
 */
function checkCompiledWebUI(projectRoot) {
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return { exists: false };
  }
  
  const outputBinary = path.join(
    projectRoot, 
    'binaries', 
    'python-webui', 
    platformInfo.platformDir, 
    'dist',
    `open-webui${platformInfo.exeExt}`
  );
  
  if (fs.existsSync(outputBinary)) {
    const stats = fs.statSync(outputBinary);
    return {
      exists: true,
      path: outputBinary,
      size: stats.size,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(1)
    };
  }
  
  return { exists: false };
}

module.exports = {
  compileOpenWebUI,
  checkCompiledWebUI,
  getPlatformInfo,
  checkCCompiler,
  checkSystemDependencies
};
