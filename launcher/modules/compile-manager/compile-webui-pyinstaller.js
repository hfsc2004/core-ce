/**
 * compile-webui-pyinstaller.js
 * 
 * Compiles Open WebUI from Python venv into standalone folder using PyInstaller --onedir.
 * Part of the Standard Edition build pipeline.
 * 
 * Output: A self-contained folder with the binary + all dependencies.
 * No Python installation required on the end user's machine.
 * 
 * BMOC-Lite remains sole authority - the compiled binary accepts:
 *   --port XXXX (command line)
 *   OLLAMA_API_BASE_URL (environment variable)
 *   DATA_DIR (environment variable)
 * 
 * Output structure matches what webui-launcher-standard.js expects:
 *   dist/open_webui_launcher.dist/open-webui
 * 
 * @module compile-webui-pyinstaller
 * @version 1.1.3 - March 5, 2026 - February 2026
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  createLauncherScript,
  createSpecContent
} = require('./compile-webui-pyinstaller-template');

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
 * Compile Open WebUI using PyInstaller --onedir
 * 
 * Creates a standalone folder (not a single giant file) containing:
 * - The compiled binary
 * - All Python dependencies
 * - Data files (frontend, migrations, configs)
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
    if (log) console.log(`[PyInstaller] ${log}`);
  };
  
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return { success: false, message: 'Unsupported platform' };
  }
  
  sendProgress('Preparing PyInstaller build...', 0, `Platform: ${platformInfo.platformDir}`);
  
  // Paths
  const webuiDir = path.join(projectRoot, 'binaries', 'python-webui', platformInfo.platformDir);
  const venvDir = path.join(webuiDir, 'venv');
  const venvBin = platformInfo.isWindows 
    ? path.join(venvDir, 'Scripts')
    : path.join(venvDir, 'bin');
  const pythonExe = path.join(venvBin, platformInfo.pythonBin);
  const pipExe = path.join(venvBin, platformInfo.pipBin);
  const outputDir = path.join(webuiDir, 'dist');
  
  // Output folder matches what webui-launcher-standard.js expects
  const outputFolderName = 'open_webui_launcher.dist';
  const binaryName = `open-webui${platformInfo.exeExt}`;
  const outputBinary = path.join(outputDir, outputFolderName, binaryName);
  
  // Check venv exists
  if (!fs.existsSync(pythonExe)) {
    return { 
      success: false, 
      message: `Python venv not found at ${venvDir}. Build Open WebUI first.` 
    };
  }
  
  sendProgress('Checking Open WebUI installation...', 5, 'Verifying venv');
  
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
  
  // Install PyInstaller if not present
  sendProgress('Installing PyInstaller...', 15, 'Checking PyInstaller');
  
  try {
    execSync(`"${pythonExe}" -c "import PyInstaller"`, { stdio: 'pipe' });
    sendProgress('PyInstaller found', 20, 'Already installed');
  } catch (err) {
    sendProgress('Installing PyInstaller...', 15, 'Installing via pip');
    try {
      execSync(`"${pipExe}" install pyinstaller`, { 
        cwd: webuiDir,
        stdio: 'pipe',
        timeout: 300000 // 5 min timeout
      });
      sendProgress('PyInstaller installed', 20, 'Installation complete');
    } catch (installErr) {
      return { success: false, message: `Failed to install PyInstaller: ${installErr.message}` };
    }
  }
  
  // Find open-webui entry point and site-packages
  sendProgress('Locating entry point...', 25, 'Finding open-webui module');
  
  let entryPoint;
  let sitePackages;
  try {
    const result = execSync(`"${pythonExe}" -c "import open_webui; print(open_webui.__file__)"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    
    entryPoint = path.dirname(result);
    sitePackages = path.dirname(path.dirname(entryPoint));
    sendProgress('Entry point found', 28, entryPoint);
  } catch (err) {
    return { success: false, message: 'Could not locate open-webui module' };
  }
  
  // Create a wrapper launcher script that accepts --port
  sendProgress('Creating launcher script...', 30, 'Generating entry point');
  
  const launcherScript = createLauncherScript();

  const launcherPath = path.join(webuiDir, 'open_webui_launcher.py');
  fs.writeFileSync(launcherPath, launcherScript);
  
  // =========================================================================
  // Build the PyInstaller spec file
  // =========================================================================
  sendProgress('Creating spec file...', 32, 'Configuring PyInstaller');

  // Escape paths for Python (handle backslashes on Windows)
  const pyEntryPoint = entryPoint.replace(/\\/g, '/');
  const pyWebuiDir = webuiDir.replace(/\\/g, '/');
  const pyLauncherPath = launcherPath.replace(/\\/g, '/');

  const specContent = createSpecContent({
    pyLauncherPath,
    pyWebuiDir
  });

  const specPath = path.join(webuiDir, 'open-webui.spec');
  fs.writeFileSync(specPath, specContent);
  sendProgress('Spec file created', 35, specPath);
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // =========================================================================
  // Run PyInstaller
  // =========================================================================
  sendProgress('Running PyInstaller --onedir...', 40, 'This may take 15-30 minutes');
  
  return new Promise((resolve) => {
    const pyinstallerPath = path.join(venvBin, platformInfo.isWindows ? 'pyinstaller.exe' : 'pyinstaller');
    
    const args = [
      specPath,
      '--distpath', outputDir,
      '--workpath', path.join(webuiDir, 'build'),
      '--noconfirm',
      '--clean'
    ];
    
    console.log(`[PyInstaller] Running: ${pyinstallerPath} ${args.join(' ')}`);
    console.log(`[PyInstaller] Output will be: ${path.join(outputDir, outputFolderName)}`);
    
    const proc = spawn(pyinstallerPath, args, {
      cwd: webuiDir,
      env: {
        ...process.env,
        PATH: `${venvBin}${path.delimiter}${process.env.PATH}`
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let lastProgress = 40;
    let lastLogLine = '';
    
    proc.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        lastLogLine = line.trim();
        console.log(`[PyInstaller] ${lastLogLine}`);
        
        // Update progress based on PyInstaller phases
        if (lastLogLine.includes('Analyzing')) lastProgress = Math.min(lastProgress + 1, 55);
        else if (lastLogLine.includes('Processing')) lastProgress = Math.min(lastProgress + 1, 65);
        else if (lastLogLine.includes('Building PYZ')) lastProgress = Math.min(70, lastProgress + 5);
        else if (lastLogLine.includes('Building EXE')) lastProgress = Math.min(75, lastProgress + 5);
        else if (lastLogLine.includes('Building COLLECT') || lastLogLine.includes('Copying')) lastProgress = Math.min(lastProgress + 1, 90);
        
        sendProgress('Compiling Open WebUI...', lastProgress, lastLogLine.substring(0, 100));
      }
    });
    
    proc.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        // PyInstaller puts warnings on stderr - log them but don't treat as errors
        console.log(`[PyInstaller] ${line.trim()}`);
      }
    });
    
    proc.on('error', (err) => {
      resolve({ success: false, message: `PyInstaller failed to start: ${err.message}` });
    });
    
    proc.on('exit', (code) => {
      console.log(`[PyInstaller] Exited with code ${code}`);
      
      if (code === 0 && fs.existsSync(outputBinary)) {
        // Make executable on Unix
        if (!platformInfo.isWindows) {
          try {
            fs.chmodSync(outputBinary, 0o755);
          } catch (e) {
            // Ignore chmod errors
          }
        }
        
        // Calculate total folder size
        let totalSize = 0;
        const calculateSize = (dir) => {
          if (!fs.existsSync(dir)) return;
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
        
        const outputFolder = path.join(outputDir, outputFolderName);
        calculateSize(outputFolder);
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
        const sizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
        
        sendProgress('Compilation complete!', 100, `Output: ${outputFolder} (${sizeGB} GB)`);
        
        resolve({
          success: true,
          outputPath: outputFolder,
          binaryPath: outputBinary,
          size: totalSize,
          message: `Open WebUI compiled successfully (${sizeGB} GB folder)`
        });
      } else {
        // Check if output folder exists even if binary check failed
        const outputFolder = path.join(outputDir, outputFolderName);
        if (fs.existsSync(outputFolder)) {
          console.log(`[PyInstaller] Output folder exists but binary not found at expected path: ${outputBinary}`);
          // List what's in the output folder
          try {
            const items = fs.readdirSync(outputFolder);
            console.log(`[PyInstaller] Output folder contents: ${items.join(', ')}`);
          } catch (e) {}
        }
        
        resolve({
          success: false,
          message: `PyInstaller exited with code ${code}. Expected binary at: ${outputBinary}`
        });
      }
    });
  });
}

/**
 * Check if compiled Open WebUI exists (standalone folder mode)
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Object} { exists, path, size, sizeMB }
 */
function checkCompiledWebUI(projectRoot) {
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return { exists: false };
  }
  
  const binaryName = `open-webui${platformInfo.exeExt}`;
  
  // Check standalone folder mode (--onedir output)
  const standaloneBinary = path.join(
    projectRoot,
    'binaries',
    'python-webui',
    platformInfo.platformDir,
    'dist',
    'open_webui_launcher.dist',
    binaryName
  );
  
  if (fs.existsSync(standaloneBinary)) {
    const folderPath = path.dirname(standaloneBinary);
    
    // Calculate folder size
    let totalSize = 0;
    const calculateSize = (dir) => {
      if (!fs.existsSync(dir)) return;
      try {
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
      } catch (e) {}
    };
    calculateSize(folderPath);
    
    return {
      exists: true,
      path: standaloneBinary,
      folderPath: folderPath,
      size: totalSize,
      sizeMB: (totalSize / (1024 * 1024)).toFixed(1)
    };
  }
  
  // Also check onefile mode (legacy/fallback)
  const onefileBinary = path.join(
    projectRoot,
    'binaries',
    'python-webui',
    platformInfo.platformDir,
    'dist',
    binaryName
  );
  
  if (fs.existsSync(onefileBinary)) {
    const stats = fs.statSync(onefileBinary);
    return {
      exists: true,
      path: onefileBinary,
      size: stats.size,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(1)
    };
  }
  
  return { exists: false };
}

module.exports = {
  compileOpenWebUI,
  checkCompiledWebUI,
  getPlatformInfo
};
