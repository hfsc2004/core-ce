/**
 * Pseudo Science Fiction Core Collection - GPU Detector Module
 * WINDOWS ARM64 IMPLEMENTATION
 * 
 * Platform-specific GPU detection for Windows ARM64 systems.
 * This file contains ONLY Windows ARM64-specific logic.
 * 
 * Supported GPUs:
 * - AMD (ROCm) via WMI PowerShell queries
 * - Intel (oneAPI) via WMI PowerShell queries
 * - Qualcomm Adreno (via WMI)
 * 
 * NOTE: NVIDIA GPUs are rare on ARM64 Windows, nvidia-smi may not work
 * 
 * STATUS: 🟡 UNTESTED - Extracted from original code but not verified
 * 
 * @module gpu-detector-windows-arm64
 * @version 1.1.3 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const os = require('os');
const { spawn } = require('child_process');

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect all GPUs on Windows ARM64 system
 * @returns {Promise<Object>} Hardware detection results
 */
async function detectAll() {
  const totalMem = Math.round(os.totalmem() / (1024 ** 3)); // GB
  const cpuCount = os.cpus().length;
  const platform = process.platform;
  
  let gpuDetected = false;
  let gpuVRAM = 0;
  let gpuList = [];
  
  // Try AMD first
  try {
    const amdGPUs = await detectAMD_Windows();
    gpuList.push(...amdGPUs);
  } catch (err) {
    console.log('[GPU Detector] AMD detection failed on Windows ARM64');
  }
  
  // Try Intel if no AMD found
  if (gpuList.length === 0) {
    try {
      const intelGPUs = await detectIntel_Windows();
      gpuList.push(...intelGPUs);
    } catch (err) {
      console.log('[GPU Detector] Intel detection failed on Windows ARM64');
    }
  }
  
  // Try Qualcomm Adreno (Windows on ARM devices)
  if (gpuList.length === 0) {
    try {
      const adrenoGPUs = await detectAdreno_Windows();
      gpuList.push(...adrenoGPUs);
    } catch (err) {
      console.log('[GPU Detector] Qualcomm Adreno detection failed on Windows ARM64');
    }
  }
  
  if (gpuList.length > 0) {
    gpuDetected = true;
    gpuVRAM = Math.max(...gpuList.map(g => g.vram));
  }
  
  console.log(`[GPU Detector] Platform: ${platform} (ARM64)`);
  console.log(`[GPU Detector] Detected ${gpuList.length} GPU(s):`, gpuList);
  console.log(`[GPU Detector] Max VRAM: ${gpuVRAM}GB`);
  
  return {
    ram_gb: totalMem,
    cpu_count: cpuCount,
    gpu_detected: gpuDetected,
    gpu_vram: gpuVRAM,
    gpu_list: gpuList,
    platform: platform
  };
}

// ============================================================================
// AMD Detection (Windows ARM64)
// ============================================================================

/**
 * Detect AMD GPUs using WMI PowerShell queries
 * @returns {Promise<Array>} Array of AMD GPU objects
 */
async function detectAMD_Windows() {
  const gpus = [];
  
  try {
    const result = await new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', [
        '-Command',
        'Get-WmiObject Win32_VideoController | Where-Object {$_.Name -like "*AMD*" -or $_.Name -like "*Radeon*"} | Select-Object Name,AdapterRAM | ConvertTo-Json'
      ]);
      
      let output = '';
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          reject(new Error('No AMD GPU found'));
        }
      });
      
      ps.stderr.on('data', () => {}); // Ignore stderr
    });
    
    const data = JSON.parse(result);
    const gpuArray = Array.isArray(data) ? data : [data];
    
    for (const gpu of gpuArray) {
      if (gpu.Name && gpu.AdapterRAM) {
        const vramBytes = parseInt(gpu.AdapterRAM);
        const vramGB = Math.round(vramBytes / (1024 ** 3));
        if (vramGB > 0) {
          gpus.push({
            name: gpu.Name,
            vram: vramGB
          });
        }
      }
    }
  } catch (err) {
    throw new Error('AMD GPU detection failed on Windows ARM64');
  }
  
  return gpus;
}

// ============================================================================
// Intel Detection (Windows ARM64)
// ============================================================================

/**
 * Detect Intel GPUs using WMI PowerShell queries
 * @returns {Promise<Array>} Array of Intel GPU objects
 */
async function detectIntel_Windows() {
  const gpus = [];
  
  try {
    const result = await new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', [
        '-Command',
        'Get-WmiObject Win32_VideoController | Where-Object {$_.Name -like "*Intel*"} | Select-Object Name,AdapterRAM | ConvertTo-Json'
      ]);
      
      let output = '';
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          reject(new Error('No Intel GPU found'));
        }
      });
      
      ps.stderr.on('data', () => {}); // Ignore stderr
    });
    
    const data = JSON.parse(result);
    const gpuArray = Array.isArray(data) ? data : [data];
    
    for (const gpu of gpuArray) {
      if (gpu.Name) {
        // Intel integrated GPUs share system RAM
        const totalMem = Math.round(os.totalmem() / (1024 ** 3));
        const estimatedVRAM = Math.min(Math.round(totalMem * 0.5), 16);
        
        gpus.push({
          name: gpu.Name,
          vram: estimatedVRAM
        });
      }
    }
  } catch (err) {
    throw new Error('Intel GPU detection failed on Windows ARM64');
  }
  
  return gpus;
}

// ============================================================================
// Qualcomm Adreno Detection (Windows ARM64)
// ============================================================================

/**
 * Detect Qualcomm Adreno GPUs using WMI PowerShell queries
 * Common on Windows on ARM devices (Surface Pro X, etc.)
 * @returns {Promise<Array>} Array of Adreno GPU objects
 */
async function detectAdreno_Windows() {
  const gpus = [];
  
  try {
    const result = await new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', [
        '-Command',
        'Get-WmiObject Win32_VideoController | Where-Object {$_.Name -like "*Adreno*" -or $_.Name -like "*Qualcomm*"} | Select-Object Name,AdapterRAM | ConvertTo-Json'
      ]);
      
      let output = '';
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          reject(new Error('No Adreno GPU found'));
        }
      });
      
      ps.stderr.on('data', () => {}); // Ignore stderr
    });
    
    const data = JSON.parse(result);
    const gpuArray = Array.isArray(data) ? data : [data];
    
    for (const gpu of gpuArray) {
      if (gpu.Name) {
        // Adreno GPUs share system RAM (unified memory architecture)
        const totalMem = Math.round(os.totalmem() / (1024 ** 3));
        const estimatedVRAM = Math.min(Math.round(totalMem * 0.4), 8); // Up to 40% or 8GB
        
        gpus.push({
          name: gpu.Name,
          vram: estimatedVRAM
        });
      }
    }
  } catch (err) {
    throw new Error('Qualcomm Adreno detection failed on Windows ARM64');
  }
  
  return gpus;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  detectAll
};
