/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function findNvidiaSmi() {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const platform = process.platform;

  if (platform === 'linux') {
    try {
      execSync('which nvidia-smi', { stdio: 'ignore' });
      return 'nvidia-smi';
    } catch {
      return null;
    }
  }

  if (platform === 'win32') {
    const possiblePaths = [
      'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
      'C:\\Windows\\System32\\nvidia-smi.exe'
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    try {
      execSync('where nvidia-smi', { stdio: 'ignore' });
      return 'nvidia-smi.exe';
    } catch {
      return null;
    }
  }

  return null;
}

function findRocmSmi() {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const platform = process.platform;

  if (platform !== 'linux') {
    return null;
  }

  const possiblePaths = [
    '/opt/rocm/bin/rocm-smi',
    '/usr/bin/rocm-smi'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  try {
    execSync('which rocm-smi', { stdio: 'ignore' });
    return 'rocm-smi';
  } catch {
    return null;
  }
}

function findAmdSmiWindows() {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const platform = process.platform;

  if (platform !== 'win32') {
    return null;
  }

  const possiblePaths = [
    'C:\\Program Files\\AMD\\ROCm\\bin\\amd-smi.exe',
    'C:\\Program Files\\AMD\\ROCM\\bin\\amd-smi.exe',
    'C:\\Program Files (x86)\\AMD\\ROCm\\bin\\amd-smi.exe',
    'C:\\Windows\\System32\\amd-smi.exe',
    'C:\\Program Files\\AMD\\AMD Software\\amd-smi.exe',
    'C:\\Program Files\\AMD\\CNext\\CNext\\amd-smi.exe'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  try {
    execSync('where amd-smi', { stdio: 'ignore' });
    return 'amd-smi.exe';
  } catch {
    return null;
  }
}

function detectAppleSilicon() {
  const { execSync } = require('child_process');
  const platform = process.platform;

  if (platform !== 'darwin') {
    return false;
  }

  try {
    const arch = execSync('uname -m', { encoding: 'utf8' }).trim();
    if (arch === 'arm64') {
      return true;
    }

    const gpuInfo = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep -i "Apple"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return gpuInfo.toLowerCase().includes('apple');
  } catch {
    return false;
  }
}

function detectMaliGpu() {
  const fs = require('fs');
  const platform = process.platform;

  if (platform !== 'linux') {
    return false;
  }

  const maliPaths = [
    '/sys/class/devfreq/fb000000.gpu',
    '/sys/class/devfreq/ff9a0000.gpu',
    '/sys/class/misc/mali0',
    '/sys/devices/platform/mali-dp.0',
    '/dev/mali0'
  ];

  for (const p of maliPaths) {
    if (fs.existsSync(p)) {
      return true;
    }
  }

  try {
    const dtGpu = fs.readdirSync('/proc/device-tree').find((d) =>
      d.includes('gpu') || d.includes('mali')
    );
    if (dtGpu) return true;
  } catch {}

  return false;
}

function detectTegra() {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const platform = process.platform;

  if (platform !== 'linux') {
    return false;
  }

  try {
    execSync('which tegrastats', { stdio: 'ignore' });
    return true;
  } catch {}

  if (fs.existsSync('/proc/device-tree/compatible')) {
    try {
      const compatible = fs.readFileSync('/proc/device-tree/compatible', 'utf8');
      if (compatible.toLowerCase().includes('tegra')) {
        return true;
      }
    } catch {}
  }

  return false;
}

function detectGpuMonitorTool() {
  const nvidiaSmi = findNvidiaSmi();
  if (nvidiaSmi) {
    return { type: 'nvidia', path: nvidiaSmi };
  }

  const rocmSmi = findRocmSmi();
  if (rocmSmi) {
    return { type: 'rocm', path: rocmSmi };
  }

  const amdSmi = findAmdSmiWindows();
  if (amdSmi) {
    return { type: 'amd-windows', path: amdSmi };
  }

  if (detectTegra()) {
    return { type: 'tegra', path: 'tegrastats' };
  }

  if (detectAppleSilicon()) {
    return { type: 'apple-silicon', path: 'sysctl' };
  }

  if (detectMaliGpu()) {
    return { type: 'mali', path: 'sysfs' };
  }

  return null;
}

const NVIDIA_UNIFIED_MEMORY_PATTERNS = [
  'grace',
  'gh200',
  'gb10',
  'gb200',
  'tegra',
  'orin',
  'xavier'
];

function isNvidiaUnifiedMemory(gpuName) {
  const nameLower = gpuName.toLowerCase();
  return NVIDIA_UNIFIED_MEMORY_PATTERNS.some((pattern) => nameLower.includes(pattern));
}

module.exports = {
  detectGpuMonitorTool,
  isNvidiaUnifiedMemory
};
