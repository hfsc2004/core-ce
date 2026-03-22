/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getCurrentPlatformKey } = require('./binary-manager-platform');
const {
  hasCommand,
  verifyCudaConfigured,
  verifyCudaRuntimeLinked,
  verifyExistingLlamaServerCapability,
  runLlamaCppBuildPreflight,
  detectLlamaCppBuildProfile,
  detectLlamaCppAcceleratorCapabilities
} = require('./binary-manager-llamacpp-preflight');

async function ensureLlamaCppSourceTree(sourceRoot, platformKey, progressCallback = null) {
  const cmakeLists = path.join(sourceRoot, 'CMakeLists.txt');
  if (fs.existsSync(cmakeLists)) return;

  fs.mkdirSync(sourceRoot, { recursive: true });
  const parentDir = path.dirname(sourceRoot);
  const tempDir = path.join(parentDir, `.llama-cpp-src-${platformKey}-${Date.now()}`);
  const repoUrl = 'https://github.com/ggml-org/llama.cpp.git';

  if (!hasCommand('git', ['--version'])) {
    throw new Error('git is required to auto-fetch llama.cpp source but is not available');
  }

  if (progressCallback) {
    progressCallback({
      progress: 5,
      filename: 'llama.cpp',
      completed: 0,
      total: 1,
      speed: 0,
      message: `Source missing; cloning llama.cpp (${platformKey})...`
    });
  }

  execFileSync('git', ['clone', '--depth', '1', repoUrl, tempDir], {
    stdio: 'pipe',
    maxBuffer: 8 * 1024 * 1024
  });

  const entries = fs.readdirSync(tempDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const src = path.join(tempDir, entry.name);
    const dest = path.join(sourceRoot, entry.name);
    fs.cpSync(src, dest, { recursive: true, force: true });
  }
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (progressCallback) {
    progressCallback({
      progress: 9,
      filename: 'llama.cpp',
      completed: 0,
      total: 1,
      speed: 0,
      message: `llama.cpp source synced into binaries/llama.cpp/${platformKey}`
    });
  }
}

async function downloadLlamaCpp(fromPath, progressCallback = null) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const binariesDir = path.join(projectRoot, 'binaries');
    const platformKey = getCurrentPlatformKey();
    const platformDir = path.join(binariesDir, 'llama.cpp', platformKey);
    const binDir = path.join(platformDir, 'bin');
    const isWindows = process.platform === 'win32';
    const exe = (name) => (isWindows ? `${name}.exe` : name);

    fs.mkdirSync(binDir, { recursive: true });

    const buildProfile = detectLlamaCppBuildProfile();
    const desired = [exe('llama-server'), exe('llama-cli'), exe('llama-gguf-split')];
    const existsAll = desired.every((name) => fs.existsSync(path.join(binDir, name)));
    if (existsAll) {
      const serverPath = path.join(binDir, exe('llama-server'));
      const capabilityCheck = verifyExistingLlamaServerCapability(serverPath, buildProfile);
      if (!capabilityCheck.ok) {
        return {
          success: true,
          message:
            `⚠️ Existing llama.cpp binaries found for ${platformKey}, but CUDA capability check failed.\n` +
            `Reason: ${capabilityCheck.reason}\n` +
            'Binaries are kept and can run CPU-only. Rebuild for CUDA after toolkit/driver fixes if desired.'
        };
      }
      return { success: true, message: `✅ llama.cpp binaries already present for ${platformKey}` };
    }

    const sourceRoot = platformDir;
    const cmakeLists = path.join(sourceRoot, 'CMakeLists.txt');
    if (!fs.existsSync(cmakeLists)) {
      await ensureLlamaCppSourceTree(sourceRoot, platformKey, progressCallback);
      if (!fs.existsSync(cmakeLists)) {
        return {
          success: false,
          message:
            `Failed to prepare llama.cpp source for ${platformKey} at ${sourceRoot}. ` +
            'Please check network access and git availability, then click Prepare again.'
        };
      }
    }

    const preflight = runLlamaCppBuildPreflight(fromPath);
    if (!preflight.selected.ok) {
      return {
        success: false,
        message:
          '❌ Build preflight failed before compile. Stopping immediately.\n' +
          preflight.selected.reasons.map((r) => `- ${r}`).join('\n')
      };
    }

    if (progressCallback) {
      progressCallback({
        progress: 10,
        filename: 'llama.cpp',
        completed: 0,
        total: 1,
        speed: 0,
        message: `Preparing llama.cpp for ${platformKey} (local ${buildProfile.label} build, no internet download)...`
      });
    }

    const buildDir = path.join(sourceRoot, 'build');
    const cachePath = path.join(buildDir, 'CMakeCache.txt');
    if (fs.existsSync(cachePath)) {
      try {
        const cacheText = fs.readFileSync(cachePath, 'utf8');
        const expectedRoot = sourceRoot.replace(/\\/g, '/');
        const homeDirLine = cacheText
          .split(/\r?\n/)
          .find((line) => line.startsWith('CMAKE_HOME_DIRECTORY:INTERNAL='));
        const cachedHome = String(homeDirLine || '')
          .split('=')
          .slice(1)
          .join('=')
          .trim()
          .replace(/\\/g, '/');
        const staleCache = cachedHome ? cachedHome !== expectedRoot : !cacheText.includes(expectedRoot);
        if (staleCache) {
          if (progressCallback) {
            progressCallback({
              progress: 20,
              filename: 'llama.cpp',
              completed: 0,
              total: 1,
              speed: 0,
              message: 'Detected stale CMake cache, cleaning local build directory...'
            });
          }
          fs.rmSync(buildDir, { recursive: true, force: true });
        }
      } catch {
        if (progressCallback) {
          progressCallback({
            progress: 20,
            filename: 'llama.cpp',
            completed: 0,
            total: 1,
            speed: 0,
            message: 'CMake cache unreadable, cleaning local build directory...'
          });
        }
        fs.rmSync(buildDir, { recursive: true, force: true });
      }
    }

    const cmakeConfigureArgs = ['-S', sourceRoot, '-B', buildDir, '-D', 'CMAKE_BUILD_TYPE=Release', ...buildProfile.cmakeFlags];
    if (process.platform === 'linux') {
      cmakeConfigureArgs.push(
        '-D', 'CMAKE_BUILD_RPATH=$ORIGIN',
        '-D', 'CMAKE_INSTALL_RPATH=$ORIGIN',
        '-D', 'CMAKE_BUILD_RPATH_USE_ORIGIN=ON'
      );
    }
    execFileSync('cmake', cmakeConfigureArgs, {
      stdio: 'pipe',
      maxBuffer: 8 * 1024 * 1024
    });

    if (buildProfile.expectCuda) {
      const cacheCheck = verifyCudaConfigured(path.join(buildDir, 'CMakeCache.txt'));
      if (!cacheCheck.ok) {
        return {
          success: false,
          message:
            '⚠️ CUDA build was requested, but CMake did not enable CUDA support.\n' +
            `Reason: ${cacheCheck.reason}\n` +
            'No files were deleted. Fix CUDA toolkit/headers visibility and run Prepare again, or switch to CPU mode.'
        };
      }
    }

    if (progressCallback) {
      progressCallback({
        progress: 35,
        filename: 'llama.cpp',
        completed: 0,
        total: 1,
        speed: 0,
        message: `Configuring CMake project (${buildProfile.label})...`
      });
      progressCallback({
        progress: 75,
        filename: 'llama.cpp',
        completed: 0,
        total: 1,
        speed: 0,
        message: `Building llama-server / llama-cli / llama-gguf-split (${buildProfile.label})...`
      });
    }

    execFileSync(
      'cmake',
      ['--build', buildDir, '--config', 'Release', '--target', 'llama-server', 'llama-cli', 'llama-gguf-split'],
      { stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 }
    );

    const candidates = [
      path.join(buildDir, 'bin'),
      path.join(sourceRoot, 'build', 'bin'),
      path.join(sourceRoot, 'bin')
    ];
    const builtBin = candidates.find((p) => fs.existsSync(p));
    if (!builtBin) {
      return { success: false, message: `Build completed but no bin directory found under ${buildDir}` };
    }

    let copied = 0;
    for (const name of desired) {
      const src = path.join(builtBin, name);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(binDir, name);
      fs.copyFileSync(src, dest);
      if (!isWindows) fs.chmodSync(dest, 0o755);
      copied += 1;
    }

    if (progressCallback) {
      progressCallback({
        progress: 100,
        filename: 'llama.cpp',
        completed: 1,
        total: 1,
        speed: 0,
        message: copied > 0 ? `Staged ${copied} llama.cpp binaries for local runtime` : 'No binaries staged'
      });
    }

    const hasServer = fs.existsSync(path.join(binDir, exe('llama-server')));
    if (!hasServer) {
      return {
        success: false,
        message:
          `llama.cpp build finished but ${exe('llama-server')} is missing.\n` +
          `Checked build output in: ${builtBin}`
      };
    }

    if (buildProfile.expectCuda) {
      const serverPath = path.join(binDir, exe('llama-server'));
      const runtimeCheck = verifyCudaRuntimeLinked(serverPath);
      if (!runtimeCheck.ok) {
        return {
          success: true,
          message:
            '⚠️ Build completed, but resulting llama-server is not CUDA-capable.\n' +
            `Detail: ${runtimeCheck.reason}\n` +
            'Binaries were kept and are usable in CPU mode. Rebuild after fixing CUDA runtime/toolkit setup to enable GPU offload.'
        };
      }
    }

    return {
      success: true,
      message: `✅ llama.cpp runtime prepared for ${platformKey} (${buildProfile.label}) at ${path.join(binDir, exe('llama-server'))}` + (buildProfile.notice ? `\nNote: ${buildProfile.notice}` : '')
    };
  } catch (err) {
    console.error('[Binary Manager] llama.cpp prepare/build error:', err);
    return { success: false, message: err.message || 'Failed to prepare llama.cpp runtime' };
  }
}

module.exports = {
  downloadLlamaCpp,
  runLlamaCppBuildPreflight,
  detectLlamaCppBuildProfile,
  detectLlamaCppAcceleratorCapabilities,
  verifyExistingLlamaServerCapability
};
