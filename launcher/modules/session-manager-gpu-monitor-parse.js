/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { isNvidiaUnifiedMemory } = require('./session-manager-gpu-monitor-detect');

function parseNvidiaOutput(line) {
  const parts = line.split(',').map((s) => s.trim());
  if (parts.length >= 5) {
    const gpuName = parts[1];
    return {
      index: parseInt(parts[0], 10),
      name: gpuName,
      memoryUsed: parseFloat(parts[2]),
      memoryTotal: parseFloat(parts[3]),
      temperature: parseInt(parts[4], 10),
      isSharedMemory: isNvidiaUnifiedMemory(gpuName)
    };
  }
  return null;
}

function parseRocmOutput(output) {
  const gpus = {};
  const lines = output.split('\n');

  const csvHeaderIndex = lines.findIndex((l) => l.includes('device') && l.includes('VRAM'));
  if (csvHeaderIndex !== -1) {
    for (let i = csvHeaderIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('device')) continue;

      const parts = line.split(',').map((s) => s.trim());
      if (parts.length >= 4) {
        const indexMatch = parts[0].match(/GPU(\d+)/i);
        const index = indexMatch ? parseInt(indexMatch[1], 10) : 0;
        const vramTotal = parseFloat(parts[1]) / (1024 * 1024);
        const vramUsed = parseFloat(parts[2]) / (1024 * 1024);
        const temp = parseFloat(parts[3]);

        gpus[index] = {
          index: index,
          name: `AMD GPU ${index}`,
          memoryUsed: vramUsed,
          memoryTotal: vramTotal,
          temperature: Math.round(temp)
        };
      }
    }
  } else {
    for (const line of lines) {
      const gpuMatch = line.match(/GPU\[(\d+)\]\s*:\s*(.+):\s*(.+)/);
      if (gpuMatch) {
        const index = parseInt(gpuMatch[1], 10);
        const key = gpuMatch[2].trim().toLowerCase();
        const value = gpuMatch[3].trim();

        if (!gpus[index]) {
          gpus[index] = {
            index: index,
            name: `AMD GPU ${index}`,
            memoryUsed: 0,
            memoryTotal: 0,
            temperature: 0
          };
        }

        if (key.includes('total used') || key.includes('used memory')) {
          const numValue = parseFloat(value);
          gpus[index].memoryUsed = numValue > 100000 ? numValue / (1024 * 1024) : numValue;
        } else if (key.includes('total memory') && !key.includes('used')) {
          const numValue = parseFloat(value);
          gpus[index].memoryTotal = numValue > 100000 ? numValue / (1024 * 1024) : numValue;
        } else if (key.includes('temperature') || key.includes('temp')) {
          gpus[index].temperature = Math.round(parseFloat(value));
        }
      }
    }
  }

  return Object.values(gpus);
}

function parseAmdSmiOutput(output) {
  const gpus = {};
  const lines = output.split('\n');

  for (const line of lines) {
    const tableMatch = line.match(/^\s*(\d+)\s+(\d+)c?\s+[\d.]+W?\s+[\d.]+%?\s+(\d+)\s*\/\s*(\d+)\s*MB/i);
    if (tableMatch) {
      const index = parseInt(tableMatch[1], 10);
      gpus[index] = {
        index: index,
        name: `AMD GPU ${index}`,
        memoryUsed: parseFloat(tableMatch[3]),
        memoryTotal: parseFloat(tableMatch[4]),
        temperature: parseInt(tableMatch[2], 10)
      };
      continue;
    }

    const simpleMatch = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (simpleMatch && parseInt(simpleMatch[2], 10) < 150) {
      const index = parseInt(simpleMatch[1], 10);
      if (!gpus[index]) {
        gpus[index] = {
          index: index,
          name: `AMD GPU ${index}`,
          memoryUsed: parseFloat(simpleMatch[3]),
          memoryTotal: parseFloat(simpleMatch[4]),
          temperature: parseInt(simpleMatch[2], 10)
        };
      }
    }
  }

  if (Object.keys(gpus).length === 0) {
    let currentGpu = null;
    for (const line of lines) {
      const gpuMatch = line.match(/GPU[:\s]+(\d+)/i);
      if (gpuMatch) {
        currentGpu = parseInt(gpuMatch[1], 10);
        if (!gpus[currentGpu]) {
          gpus[currentGpu] = {
            index: currentGpu,
            name: `AMD GPU ${currentGpu}`,
            memoryUsed: 0,
            memoryTotal: 0,
            temperature: 0
          };
        }
        continue;
      }

      if (currentGpu === null) continue;
      const nameMatch = line.match(/Name[:\s]+(.+)/i);
      if (nameMatch) {
        gpus[currentGpu].name = nameMatch[1].trim();
        continue;
      }
      const tempMatch = line.match(/Temp(?:erature)?[:\s]+(\d+)/i);
      if (tempMatch) {
        gpus[currentGpu].temperature = parseInt(tempMatch[1], 10);
        continue;
      }
      const usedMatch = line.match(/VRAM\s*Used[:\s]+(\d+)/i);
      if (usedMatch) {
        gpus[currentGpu].memoryUsed = parseFloat(usedMatch[1]);
        continue;
      }
      const totalMatch = line.match(/VRAM\s*Total[:\s]+(\d+)/i);
      if (totalMatch) {
        gpus[currentGpu].memoryTotal = parseFloat(totalMatch[1]);
        continue;
      }
    }
  }

  return Object.values(gpus);
}

function getAppleSiliconInfo() {
  const { execSync } = require('child_process');
  const os = require('os');

  try {
    let gpuName = 'Apple Silicon GPU';
    try {
      const gpuInfo = execSync('system_profiler SPDisplaysDataType 2>/dev/null', { encoding: 'utf8' });
      const nameMatch = gpuInfo.match(/Chipset Model:\s*(.+)/i) ||
                        gpuInfo.match(/Chip:\s*(.+)/i);
      if (nameMatch) {
        gpuName = nameMatch[1].trim();
      }
    } catch {}

    const totalMemMB = os.totalmem() / (1024 * 1024);
    const freeMemMB = os.freemem() / (1024 * 1024);
    const usedMemMB = totalMemMB - freeMemMB;

    let temperature = 0;
    try {
      const thermalInfo = execSync(
        'ioreg -r -n AppleAPCIFilterDevice 2>/dev/null | grep -i temperature || ' +
        'ioreg -r -c AppleSMC 2>/dev/null | grep -i "GPU" | head -1',
        { encoding: 'utf8', timeout: 2000 }
      );
      const tempMatch = thermalInfo.match(/(\d+)/);
      if (tempMatch) {
        temperature = parseInt(tempMatch[1], 10);
        if (temperature > 150) temperature = Math.round(temperature / 100);
      }
    } catch {
      temperature = -1;
    }

    return {
      index: 0,
      name: gpuName,
      memoryUsed: Math.round(usedMemMB),
      memoryTotal: Math.round(totalMemMB),
      temperature: temperature,
      isSharedMemory: true
    };
  } catch (err) {
    console.error('[GPU Monitor] Apple Silicon info error:', err.message);
    return null;
  }
}

function getMaliGpuInfo() {
  const fs = require('fs');
  const os = require('os');

  try {
    const totalMemMB = os.totalmem() / (1024 * 1024);
    const freeMemMB = os.freemem() / (1024 * 1024);
    const usedMemMB = totalMemMB - freeMemMB;

    let gpuName = 'Mali GPU';
    try {
      const dtFiles = fs.readdirSync('/proc/device-tree');
      const gpuDir = dtFiles.find((d) => d.includes('gpu'));
      if (gpuDir && fs.existsSync(`/proc/device-tree/${gpuDir}/compatible`)) {
        const compatible = fs.readFileSync(`/proc/device-tree/${gpuDir}/compatible`, 'utf8');
        if (compatible.includes('G610')) gpuName = 'Mali-G610';
        else if (compatible.includes('G710')) gpuName = 'Mali-G710';
        else if (compatible.includes('T860')) gpuName = 'Mali-T860';
        else if (compatible.includes('T880')) gpuName = 'Mali-T880';
      }
    } catch {}

    let temperature = 0;
    try {
      const thermalZones = fs.readdirSync('/sys/class/thermal')
        .filter((z) => z.startsWith('thermal_zone'));

      for (const zone of thermalZones) {
        try {
          const typePath = `/sys/class/thermal/${zone}/type`;
          const tempPath = `/sys/class/thermal/${zone}/temp`;

          if (fs.existsSync(typePath) && fs.existsSync(tempPath)) {
            const type = fs.readFileSync(typePath, 'utf8').toLowerCase();
            if (type.includes('gpu') || type.includes('mali') || type.includes('soc')) {
              const temp = parseInt(fs.readFileSync(tempPath, 'utf8').trim(), 10);
              temperature = Math.round(temp / 1000);
              if (type.includes('gpu') || type.includes('mali')) break;
            }
          }
        } catch {}
      }
    } catch {
      temperature = -1;
    }

    return {
      index: 0,
      name: gpuName,
      memoryUsed: Math.round(usedMemMB),
      memoryTotal: Math.round(totalMemMB),
      temperature: temperature,
      isSharedMemory: true
    };
  } catch (err) {
    console.error('[GPU Monitor] Mali GPU info error:', err.message);
    return null;
  }
}

function parseTegrastatsOutput(output) {
  try {
    const ramMatch = output.match(/RAM\s+(\d+)\/(\d+)MB/i);
    let memUsed = 0;
    let memTotal = 0;
    if (ramMatch) {
      memUsed = parseInt(ramMatch[1], 10);
      memTotal = parseInt(ramMatch[2], 10);
    }

    let temperature = 0;
    const tempMatch = output.match(/GPU@([\d.]+)C/i);
    if (tempMatch) {
      temperature = Math.round(parseFloat(tempMatch[1]));
    }

    let gpuName = 'Tegra GPU';
    const modelMatch = output.match(/(Jetson\s*\w+)/i);
    if (modelMatch) {
      gpuName = modelMatch[1];
    }

    return {
      index: 0,
      name: gpuName,
      memoryUsed: memUsed,
      memoryTotal: memTotal,
      temperature: temperature,
      isSharedMemory: true
    };
  } catch (err) {
    console.error('[GPU Monitor] Tegrastats parse error:', err.message);
    return null;
  }
}

module.exports = {
  parseNvidiaOutput,
  parseRocmOutput,
  parseAmdSmiOutput,
  getAppleSiliconInfo,
  getMaliGpuInfo,
  parseTegrastatsOutput
};
