/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const { detectGpuMonitorTool } = require('./session-manager-gpu-monitor-detect');
const {
  parseNvidiaOutput,
  parseRocmOutput,
  parseAmdSmiOutput,
  getAppleSiliconInfo,
  getMaliGpuInfo,
  parseTegrastatsOutput
} = require('./session-manager-gpu-monitor-parse');

function createSessionGpuMonitor() {
  let gpuMonitorProcess = null;
  let gpuMonitorCallback = null;
  let gpuMonitorDebounceTimer = null;
  let gpuMonitorBuffer = {};
  let gpuMonitorExpectedCount = 0;
  let gpuMonitorType = null;
  let gpuMonitorInterval = null;
  const GPU_MONITOR_DEBOUNCE_MS = 200;

  function startGpuMonitor(callback) {
    if (gpuMonitorProcess || gpuMonitorInterval) {
      return { success: false, message: 'GPU monitor already running' };
    }

    const tool = detectGpuMonitorTool();
    if (!tool) {
      return { success: false, message: 'No GPU monitoring tool found' };
    }

    gpuMonitorType = tool.type;
    gpuMonitorCallback = callback;
    gpuMonitorBuffer = {};
    gpuMonitorExpectedCount = 0;

    console.log(`[GPU Monitor] Detected ${tool.type} GPU monitoring`);

    if (tool.type === 'apple-silicon' || tool.type === 'mali') {
      return startPollingMonitor(tool);
    }

    return startProcessMonitor(tool);
  }

  function startPollingMonitor(tool) {
    try {
      const pollFn = () => {
        let gpuInfo = null;

        if (tool.type === 'apple-silicon') {
          gpuInfo = getAppleSiliconInfo();
        } else if (tool.type === 'mali') {
          gpuInfo = getMaliGpuInfo();
        }

        if (gpuInfo && gpuMonitorCallback) {
          gpuMonitorBuffer[0] = gpuInfo;
          gpuMonitorExpectedCount = 1;
          gpuMonitorCallback([gpuInfo]);
        }
      };

      pollFn();
      gpuMonitorInterval = setInterval(pollFn, 1000);

      console.log(`[GPU Monitor] Started ${tool.type} polling monitor`);
      return { success: true, message: `GPU monitor started (${tool.type})` };
    } catch (err) {
      console.error('[GPU Monitor] Failed to start polling monitor:', err.message);
      return { success: false, message: err.message };
    }
  }

  function startProcessMonitor(tool) {
    const platform = process.platform;

    try {
      const { spawn } = require('child_process');
      let spawnCmd;
      let spawnArgs;
      let spawnOpts;

      if (tool.type === 'nvidia') {
        spawnCmd = tool.path;
        spawnArgs = [
          '--query-gpu=index,name,memory.used,memory.total,temperature.gpu',
          '--format=csv,noheader,nounits',
          '-l', '1'
        ];
        spawnOpts = { windowsHide: true };
      } else if (tool.type === 'rocm') {
        spawnCmd = 'watch';
        spawnArgs = [
          '-n', '1',
          '-t',
          `${tool.path} --showmeminfo vram --showtemp --csv`
        ];
        spawnOpts = {};
      } else if (tool.type === 'amd-windows') {
        spawnCmd = 'powershell.exe';
        spawnArgs = [
          '-NoProfile',
          '-Command',
          `while($true) { & '${tool.path}' monitor -g 0,1,2,3,4,5,6,7 2>$null; Start-Sleep -Seconds 1 }`
        ];
        spawnOpts = { windowsHide: true };
      } else if (tool.type === 'tegra') {
        spawnCmd = 'tegrastats';
        spawnArgs = ['--interval', '1000'];
        spawnOpts = {};
      }

      if (!spawnCmd) {
        return { success: false, message: `Unknown monitor type: ${tool.type}` };
      }

      console.log(`[GPU Monitor] Starting ${tool.type}: ${spawnCmd} ${spawnArgs.join(' ')}`);
      gpuMonitorProcess = spawn(spawnCmd, spawnArgs, spawnOpts);

      gpuMonitorProcess.stdout.on('data', (data) => {
        const output = data.toString();

        if (gpuMonitorType === 'nvidia') {
          const lines = output.trim().split('\n');
          for (const line of lines) {
            const gpu = parseNvidiaOutput(line);
            if (gpu) {
              gpuMonitorBuffer[gpu.index] = gpu;
            }
          }
        } else if (gpuMonitorType === 'rocm') {
          const gpus = parseRocmOutput(output);
          for (const gpu of gpus) {
            gpuMonitorBuffer[gpu.index] = gpu;
          }
        } else if (gpuMonitorType === 'amd-windows') {
          const gpus = parseAmdSmiOutput(output);
          for (const gpu of gpus) {
            gpuMonitorBuffer[gpu.index] = gpu;
          }
        } else if (gpuMonitorType === 'tegra') {
          const gpu = parseTegrastatsOutput(output);
          if (gpu) {
            gpuMonitorBuffer[gpu.index] = gpu;
          }
        }

        const currentCount = Object.keys(gpuMonitorBuffer).length;
        if (currentCount > gpuMonitorExpectedCount) {
          gpuMonitorExpectedCount = currentCount;
          console.log(`[GPU Monitor] Detected ${gpuMonitorExpectedCount} GPU(s) via ${gpuMonitorType}`);
        }

        if (gpuMonitorDebounceTimer) {
          clearTimeout(gpuMonitorDebounceTimer);
        }

        gpuMonitorDebounceTimer = setTimeout(() => {
          const bufferCount = Object.keys(gpuMonitorBuffer).length;
          if (gpuMonitorCallback && bufferCount > 0) {
            const gpus = Object.values(gpuMonitorBuffer).sort((a, b) => a.index - b.index);
            if (bufferCount !== gpuMonitorExpectedCount) {
              gpuMonitorExpectedCount = bufferCount;
              console.log(`[GPU Monitor] GPU count: ${gpuMonitorExpectedCount}`);
            }
            gpuMonitorCallback(gpus);
            gpuMonitorBuffer = {};
          }
        }, GPU_MONITOR_DEBOUNCE_MS);
      });

      gpuMonitorProcess.stderr.on('data', (data) => {
        console.warn('[GPU Monitor] stderr:', data.toString());
      });

      gpuMonitorProcess.on('close', (code) => {
        console.log(`[GPU Monitor] Process exited with code ${code}`);
        cleanupGpuMonitorState();
      });

      gpuMonitorProcess.on('error', (err) => {
        console.error('[GPU Monitor] Process error:', err.message);
        cleanupGpuMonitorState();
      });

      console.log(`[GPU Monitor] Started ${tool.type} monitoring (${platform})`);
      return { success: true, message: `GPU monitor started (${tool.type})` };
    } catch (err) {
      console.error('[GPU Monitor] Failed to start:', err.message);
      return { success: false, message: err.message };
    }
  }

  function cleanupGpuMonitorState() {
    if (gpuMonitorDebounceTimer) {
      clearTimeout(gpuMonitorDebounceTimer);
      gpuMonitorDebounceTimer = null;
    }
    gpuMonitorProcess = null;
    gpuMonitorInterval = null;
    gpuMonitorCallback = null;
    gpuMonitorBuffer = {};
    gpuMonitorExpectedCount = 0;
    gpuMonitorType = null;
  }

  function stopGpuMonitor() {
    if (!gpuMonitorProcess && !gpuMonitorInterval) {
      return { success: false, message: 'GPU monitor not running' };
    }

    try {
      if (gpuMonitorProcess) {
        gpuMonitorProcess.kill('SIGTERM');
      }
      if (gpuMonitorInterval) {
        clearInterval(gpuMonitorInterval);
      }
      cleanupGpuMonitorState();
      console.log('[GPU Monitor] Stopped');
      return { success: true, message: 'GPU monitor stopped' };
    } catch (err) {
      console.error('[GPU Monitor] Failed to stop:', err.message);
      return { success: false, message: err.message };
    }
  }

  function isGpuMonitorRunning() {
    return gpuMonitorProcess !== null || gpuMonitorInterval !== null;
  }

  return {
    startGpuMonitor,
    stopGpuMonitor,
    isGpuMonitorRunning
  };
}

module.exports = createSessionGpuMonitor;
