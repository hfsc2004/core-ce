/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { spawn, exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const logger = require('../logger');

const execPromise = promisify(exec);

function createOllamaEnv(appPath, port, forceCpu = false) {
  const env = {
    ...process.env,
    OLLAMA_HOST: `0.0.0.0:${port}`,
    OLLAMA_ORIGINS: '*',
    OLLAMA_MODELS: path.join(appPath, '..', 'models'),
    OLLAMA_DEBUG: '1'
  };

  if (forceCpu) {
    env.CUDA_VISIBLE_DEVICES = '';
  }

  return env;
}

function spawnOllamaProcess(ollamaPath, env) {
  const processRef = spawn(ollamaPath, ['serve'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env
  });

  processRef.stdout.on('data', (data) => {
    logger.debug('Ollama stdout', { output: data.toString().trim() });
  });

  processRef.stderr.on('data', (data) => {
    logger.debug('Ollama stderr', { output: data.toString().trim() });
  });

  return processRef;
}

async function waitForOllamaReady(port, timeoutSeconds = 30) {
  for (let i = 0; i < timeoutSeconds; i++) {
    try {
      await execPromise(`curl -s http://localhost:${port}/api/tags`, { timeout: 2000 });
      return { ready: true, seconds: i + 1 };
    } catch (_err) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return { ready: false, seconds: timeoutSeconds };
}

async function findPidsOnPort(port) {
  try {
    const { stdout } = await execPromise(`lsof -ti:${port}`);
    return stdout.trim().split('\n').filter(Boolean);
  } catch (_err) {
    return [];
  }
}

async function killStalePSFProcessesByPorts(appPath, platformBinaryPath, portRanges, logPrefix) {
  console.log(`[${logPrefix}] Checking for stale PSF Ollama processes...`);

  const binariesPath = path.join(appPath, '..', 'binaries', 'ollama', platformBinaryPath, 'bin');

  for (const range of portRanges) {
    for (let port = range.start; port <= range.end; port++) {
      const pids = await findPidsOnPort(port);

      for (const pid of pids) {
        try {
          const { stdout: cmdline } = await execPromise(`ps -p ${pid} -o command=`);
          if (cmdline.includes(binariesPath)) {
            console.log(`[${logPrefix}] Killing stale PSF Ollama process on port ${port} (PID: ${pid})`);
            process.kill(parseInt(pid, 10), 'SIGTERM');
          }
        } catch (_err) {
          // Process missing or already exited.
        }
      }
    }
  }
}

async function killProcessesOnPort(port, logPrefix) {
  const pids = await findPidsOnPort(port);
  for (const pid of pids) {
    try {
      process.kill(-parseInt(pid, 10), 'SIGTERM');
      console.log(`[${logPrefix}] Killed process group ${pid}`);
    } catch (_groupErr) {
      try {
        process.kill(parseInt(pid, 10), 'SIGTERM');
      } catch (_pidErr) {
        // Already dead.
      }
    }
  }
}

async function killRemainingByPattern(pattern, logPrefix) {
  try {
    const { stdout } = await execPromise(`pgrep -f "${pattern}"`);
    const pids = stdout.trim().split('\n').filter(Boolean);

    for (const pid of pids) {
      try {
        console.log(`[${logPrefix}] Killing remaining Ollama process PID: ${pid}`);
        process.kill(parseInt(pid, 10), 'SIGTERM');
      } catch (_err) {
        // Process may already be dead.
      }
    }

    if (pids.length > 0) {
      console.log(`[${logPrefix}] Cleaned up ${pids.length} remaining Ollama process(es)`);
    }
  } catch (_err) {
    // No matching processes found.
  }
}

module.exports = {
  createOllamaEnv,
  spawnOllamaProcess,
  waitForOllamaReady,
  killStalePSFProcessesByPorts,
  killProcessesOnPort,
  killRemainingByPattern
};
