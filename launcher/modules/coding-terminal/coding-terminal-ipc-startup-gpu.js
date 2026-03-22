/**
 * Coding terminal startup GPU selection helpers.
 */

'use strict';

function createStartupGpuTools(deps = {}) {
  const { execFileSync } = deps;

  function resolvePreferredNvidiaGpuIndex(gpuInfo, overrideValue) {
    const overrideIndex = Number(overrideValue);
    if (Number.isInteger(overrideIndex) && overrideIndex >= 0) {
      return overrideIndex;
    }
    const runtimeDetected = detectBestNvidiaGpuIndex();
    if (Number.isInteger(runtimeDetected) && runtimeDetected >= 0) {
      return runtimeDetected;
    }
    const detectedIndex = Number(gpuInfo?.index);
    if (Number.isInteger(detectedIndex) && detectedIndex >= 0) {
      return detectedIndex;
    }
    const fallbackIndex = Number(gpuInfo?.cudaDeviceIndex);
    if (Number.isInteger(fallbackIndex) && fallbackIndex >= 0) {
      return fallbackIndex;
    }
    return null;
  }

  function resolvePreferredNvidiaGpuUuid(gpuInfo, overrideValue) {
    const override = String(overrideValue || '').trim();
    if (override) return override;
    const uuid = String(gpuInfo?.uuid || '').trim();
    if (uuid) return uuid;
    const cudaDeviceIndex = String(gpuInfo?.cudaDeviceIndex || '').trim();
    if (cudaDeviceIndex && /GPU-/i.test(cudaDeviceIndex)) {
      return cudaDeviceIndex;
    }
    return '';
  }

  function detectBestNvidiaGpuIndex() {
    try {
      const out = execFileSync(
        'nvidia-smi',
        ['--query-gpu=index,memory.total,display_active', '--format=csv,noheader,nounits'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const rows = String(out || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(',').map((p) => p.trim());
          const index = Number(parts[0]);
          const memoryTotalMiB = Number(parts[1]);
          const displayRaw = String(parts[2] || '').toLowerCase();
          const displayActive = displayRaw.includes('enabled') || displayRaw.includes('on') || displayRaw === '1';
          if (!Number.isInteger(index) || index < 0 || !Number.isFinite(memoryTotalMiB)) return null;
          return { index, memoryTotalMiB, displayActive };
        })
        .filter(Boolean);
      if (!rows.length) return null;
      rows.sort((a, b) => {
        if (a.displayActive !== b.displayActive) return a.displayActive ? 1 : -1;
        if (a.memoryTotalMiB !== b.memoryTotalMiB) return b.memoryTotalMiB - a.memoryTotalMiB;
        return a.index - b.index;
      });
      return rows[0].index;
    } catch {
      return null;
    }
  }

  return {
    resolvePreferredNvidiaGpuIndex,
    resolvePreferredNvidiaGpuUuid
  };
}

module.exports = createStartupGpuTools;
