
/**
 * Pseudo Science Fiction Core Collection - GGUF Tools Builder
 * 
 * Automatically builds the `llama-gguf-split` utility per platform/architecture.
 *
 * IMPORTANT: This module is aligned with the global project layout described in FilePaths_1.0.20b.md:
 *
 *   {project root}
 *      ├── /binaries
 *      ├── /launcher
 *      └── ...
 *
 * So:
 *   - This file lives in:           <projectRoot>/launcher/modules/gguf-tools-builder.js
 *   - llama.cpp source is stored in <projectRoot>/binaries/llama.cpp/<platformTag>
 *   - gguf tools binary is stored in<projectRoot>/binaries/gguf-tools/<platformTag>/llama-gguf-split[.exe]
 *
 * @module gguf-tools-builder
 * @version 1.1.3 - March 5, 2026-gguf-pathfix
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

function getPlatformTag() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'linux') {
    if (arch === 'x64') return 'linux-x64';
    if (arch === 'arm64') return 'linux-arm64';
  } else if (platform === 'darwin') {
    if (arch === 'arm64') return 'macos-arm';
    if (arch === 'x64') return 'macos-intel';
  } else if (platform === 'win32') {
    if (arch === 'x64') return 'windows-x64';
    if (arch === 'arm64') return 'windows-arm64';
  }

  throw new Error(`[gguf-tools-builder] Unsupported platform: ${platform}-${arch}`);
}

/**
 * Run a command and capture success/failure.
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: options.stdio || 'inherit',
      cwd: options.cwd || process.cwd(),
      shell: options.shell || false
    });

    proc.on('error', (err) => reject(err));

    proc.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `[gguf-tools-builder] Command failed (${cmd} ${args.join(' ')}), exit code ${code}`
        )
      );
    });
  });
}

/**
 * Resolve paths using the documented project layout.
 *
 * This file is at:
 *   <projectRoot>/launcher/modules/gguf-tools-builder.js
 *
 * So:
 *   launcherRoot = <projectRoot>/launcher
 *   projectRoot  = parent of launcherRoot
 *   binariesDir  = <projectRoot>/binaries
 */
function resolvePaths() {
  const moduleDir = __dirname;                           // .../launcher/modules
  const launcherRoot = path.resolve(moduleDir, '..');    // .../launcher
  const projectRoot = path.resolve(launcherRoot, '..');  // .../{project root}
  const binariesDir = path.join(projectRoot, 'binaries');

  const platformTag = getPlatformTag();

  const llamaCppDir = path.join(binariesDir, 'llama.cpp', platformTag);
  const toolsDir = path.join(binariesDir, 'gguf-tools', platformTag);

  const exeName = os.platform() === 'win32' ? 'llama-gguf-split.exe' : 'llama-gguf-split';
  const targetExePath = path.join(toolsDir, exeName);

  return {
    projectRoot,
    launcherRoot,
    binariesDir,
    platformTag,
    llamaCppDir,
    toolsDir,
    exeName,
    targetExePath
  };
}

function ggufSplitExists(targetExePath) {
  try {
    return fs.existsSync(targetExePath);
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Clone llama.cpp repo if not present.
 */
async function ensureLlamaCppRepo(llamaCppDir, progressCallback = null) {
  if (fs.existsSync(path.join(llamaCppDir, '.git'))) {
    if (progressCallback) {
      progressCallback('[gguf-tools-builder] Existing llama.cpp repo detected, skipping clone.');
    }
    return;
  }

  ensureDir(path.dirname(llamaCppDir));

  const repoUrl = 'https://github.com/ggml-org/llama.cpp.git';

  if (progressCallback) {
    progressCallback(`[gguf-tools-builder] Cloning llama.cpp from ${repoUrl} into ${llamaCppDir} ...`);
  }

  await runCommand('git', ['clone', '--depth', '1', repoUrl, llamaCppDir], {
    stdio: 'inherit'
  });

  if (progressCallback) {
    progressCallback('[gguf-tools-builder] Clone complete.');
  }
}

/**
 * Configure + build llama-gguf-split with CMake.
 */
async function buildLlamaGgufSplit(llamaCppDir, progressCallback = null) {
  if (progressCallback) {
    progressCallback('[gguf-tools-builder] Configuring llama.cpp (CMake)...');
  }

  await runCommand('cmake', ['-B', 'build', '-S', '.', '-DBUILD_SHARED_LIBS=OFF'], {
    cwd: llamaCppDir,
    stdio: 'inherit'
  });

  if (progressCallback) {
    progressCallback('[gguf-tools-builder] Building llama-gguf-split (Release)...');
  }

  await runCommand(
    'cmake',
    ['--build', 'build', '--config', 'Release', '--target', 'llama-gguf-split'],
    {
      cwd: llamaCppDir,
      stdio: 'inherit'
    }
  );

  if (progressCallback) {
    progressCallback('[gguf-tools-builder] Build finished.');
  }
}

/**
 * Try to locate the built gguf-split binary inside the build tree.
 */
function locateBuiltGgufSplit(llamaCppDir, exeName) {
  const candidates = [
    path.join(llamaCppDir, 'build', 'bin', exeName),
    path.join(llamaCppDir, 'build', exeName),
    path.join(llamaCppDir, 'build', 'Release', exeName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Build (or reuse) llama-gguf-split and return its path.
 */
async function buildGgufSplit(options = {}) {
  const { forceRebuild = false, progressCallback = null } = options;

  const {
    projectRoot,
    launcherRoot,
    binariesDir,
    platformTag,
    llamaCppDir,
    toolsDir,
    exeName,
    targetExePath
  } = resolvePaths();

  if (progressCallback) {
    progressCallback(`[gguf-tools-builder] Project root: ${projectRoot}`);
    progressCallback(`[gguf-tools-builder] Binaries root: ${binariesDir}`);
    progressCallback(`[gguf-tools-builder] Platform: ${platformTag}`);
    progressCallback(`[gguf-tools-builder] Target binary: ${targetExePath}`);
  }

  if (!forceRebuild && ggufSplitExists(targetExePath)) {
    if (progressCallback) {
      progressCallback('[gguf-tools-builder] Using cached gguf-split binary.');
    }
    return targetExePath;
  }

  ensureDir(binariesDir);
  ensureDir(llamaCppDir);
  ensureDir(toolsDir);

  await ensureLlamaCppRepo(llamaCppDir, progressCallback);
  await buildLlamaGgufSplit(llamaCppDir, progressCallback);

  const builtPath = locateBuiltGgufSplit(llamaCppDir, exeName);
  if (!builtPath) {
    throw new Error('[gguf-tools-builder] Failed to locate built llama-gguf-split binary.');
  }

  fs.copyFileSync(builtPath, targetExePath);

  try {
    fs.chmodSync(targetExePath, 0o755);
  } catch {
    // On Windows this might fail; ignore.
  }

  if (progressCallback) {
    progressCallback(`[gguf-tools-builder] gguf-split ready at: ${targetExePath}`);
  }

  return targetExePath;
}

/**
 * Public entry: ensure llama-gguf-split is available and return its absolute path.
 */
async function ensureGgufSplitAvailable(options = {}) {
  try {
    const targetPath = await buildGgufSplit(options);
    return targetPath;
  } catch (err) {
    console.error('[gguf-tools-builder] Failed to ensure gguf-split:', err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = {
  ensureGgufSplitAvailable,
  buildGgufSplit
};
