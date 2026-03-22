/**
 * Pseudo Science Fiction Core Collection - GPU Detector Module
 * WINDOWS X64 IMPLEMENTATION
 * 
 * Platform-specific GPU detection for Windows x86_64 systems.
 * This file contains ONLY Windows x64-specific logic.
 * 
 * Supported GPUs:
 * - NVIDIA (CUDA) via nvidia-smi
 * - AMD (ROCm) via WMI PowerShell queries
 * - Intel (oneAPI) via WMI PowerShell queries
 * 
 * STATUS: 🟡 UNTESTED - Extracted from original code but not verified
 * 
 * @module gpu-detector-windows-x64
 * @version 1.1.2 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const os = require('os');
const { spawn } = require('child_process');
const common = require('./gpu-detector-common.js');

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect all GPUs on Windows x64 system
 * @returns {Promise<Object>} Hardware detection results
 */
async function detectAll() {
  const totalMem = Math.round(os.totalmem() / (1024 ** 3)); // GB
  const cpuCount = os.cpus().length;
  const platform = process.platform;
  
  let gpuDetected = false;
  let gpuVRAM = 0;
  let gpuList = [];
  
  // Try NVIDIA first (most common for AI workloads)
  try {
    const nvidiaGPUs = await detectNVIDIA_Windows();
    gpuList.push(...nvidiaGPUs);
  } catch (err) {
    console.log('[GPU Detector] NVIDIA detection failed on Windows x64');
  }
  
  // Try AMD if no NVIDIA found
  if (gpuList.length === 0) {
    try {
      const amdGPUs = await detectAMD_Windows();
      gpuList.push(...amdGPUs);
    } catch (err) {
      console.log('[GPU Detector] AMD detection failed on Windows x64');
    }
  }
  
  // Try Intel if nothing else found
  if (gpuList.length === 0) {
    try {
      const intelGPUs = await detectIntel_Windows();
      gpuList.push(...intelGPUs);
    } catch (err) {
      console.log('[GPU Detector] Intel detection failed on Windows x64');
    }
  }
  
  if (gpuList.length > 0) {
    gpuDetected = true;
    gpuVRAM = Math.max(...gpuList.map(g => g.vram));
  }
  
  console.log(`[GPU Detector] Platform: ${platform} (x64)`);
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
// NVIDIA Detection (Windows x64)
// ============================================================================

/**
 * Detect NVIDIA GPUs using nvidia-smi
 * Uses shared common implementation
 * @returns {Promise<Array>} Array of NVIDIA GPU objects
 */
async function detectNVIDIA_Windows() {
  return common.detectNVIDIA_Common();
}

// ============================================================================
// AMD Detection (Windows x64)
// ============================================================================

/**
 * Detect AMD GPUs using WMI PowerShell queries
 * @returns {Promise<Array>} Array of AMD GPU objects
 */
async function detectAMD_Windows() {
  const gpus = [];
  
  try {
    // Use PowerShell to query AMD GPU info
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
    throw new Error('AMD GPU detection failed on Windows x64');
  }
  
  return gpus;
}

// ============================================================================
// Intel Detection (Windows x64)
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
        const estimatedVRAM = Math.min(Math.round(totalMem * 0.5), 16); // Up to 50% or 16GB
        
        gpus.push({
          name: gpu.Name,
          vram: estimatedVRAM
        });
      }
    }
  } catch (err) {
    throw new Error('Intel GPU detection failed on Windows x64');
  }
  
  return gpus;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  detectAll
};
