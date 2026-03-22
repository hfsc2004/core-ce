/**
 * Pseudo Science Fiction Core Collection - GPU Detector Module
 * LINUX X64 IMPLEMENTATION
 * 
 * Platform-specific GPU detection for Linux x86_64 systems.
 * This file contains ONLY Linux x64-specific logic.
 * 
 * Supported GPUs:
 * - NVIDIA (CUDA) via nvidia-smi
 * - AMD (ROCm) via lspci
 * - Intel (oneAPI) via lspci
 * 
 * STATUS: ✅ TESTED - Working on Linux x64
 * 
 * @module gpu-detector-linux-x64
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
 * Detect all GPUs on Linux x64 system
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
    const nvidiaGPUs = await detectNVIDIA_Linux();
    gpuList.push(...nvidiaGPUs);
  } catch (err) {
    console.log('[GPU Detector] NVIDIA detection failed on Linux x64');
  }
  
  // Try AMD if no NVIDIA found
  if (gpuList.length === 0) {
    try {
      const amdGPUs = await detectAMD_Linux();
      gpuList.push(...amdGPUs);
    } catch (err) {
      console.log('[GPU Detector] AMD detection failed on Linux x64');
    }
  }
  
  // Try Intel if nothing else found
  if (gpuList.length === 0) {
    try {
      const intelGPUs = await detectIntel_Linux();
      gpuList.push(...intelGPUs);
    } catch (err) {
      console.log('[GPU Detector] Intel detection failed on Linux x64');
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
// NVIDIA Detection (Linux x64)
// ============================================================================

/**
 * Detect NVIDIA GPUs using nvidia-smi
 * Uses shared common implementation
 * @returns {Promise<Array>} Array of NVIDIA GPU objects
 */
async function detectNVIDIA_Linux() {
  return common.detectNVIDIA_Common();
}

// ============================================================================
// AMD Detection (Linux x64)
// ============================================================================

/**
 * Detect AMD GPUs using lspci
 * @returns {Promise<Array>} Array of AMD GPU objects
 */
async function detectAMD_Linux() {
  const gpus = [];
  
  try {
    const result = await new Promise((resolve, reject) => {
      const lspci = spawn('lspci', ['-v']);
      
      let output = '';
      lspci.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      lspci.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error('lspci failed'));
        }
      });
      
      lspci.stderr.on('data', () => {}); // Ignore stderr
    });
    
    // Parse lspci output for AMD GPUs
    const lines = result.split('\n');
    let currentGPU = null;
    
    for (const line of lines) {
      // Look for AMD or ATI VGA/Display controller
      if ((line.includes('VGA') || line.includes('Display')) && 
          (line.includes('AMD') || line.includes('ATI') || line.includes('Radeon'))) {
        // Extract GPU name
        const match = line.match(/:\s+(.+?)(?:\s+\(rev|\s+\[|$)/);
        if (match) {
          currentGPU = match[1].trim();
        }
      }
      
      // Look for memory size (approximate)
      if (currentGPU && line.includes('Memory at')) {
        const sizeMatch = line.match(/size=(\d+)([KMG])/);
        if (sizeMatch) {
          let vramMB = 0;
          const size = parseInt(sizeMatch[1]);
          const unit = sizeMatch[2];
          
          if (unit === 'G') {
            vramMB = size * 1024;
          } else if (unit === 'M') {
            vramMB = size;
          } else if (unit === 'K') {
            vramMB = Math.round(size / 1024);
          }
          
          if (vramMB >= 256) { // Only add if >= 256MB
            gpus.push({
              name: currentGPU,
              vram: Math.round(vramMB / 1024)
            });
            currentGPU = null;
          }
        }
      }
    }
    
    // If we found AMD GPU but no VRAM, estimate based on model
    if (currentGPU && gpus.length === 0) {
      gpus.push({
        name: currentGPU,
        vram: 4 // Default estimate for AMD GPUs
      });
    }
  } catch (err) {
    throw new Error('AMD GPU detection failed on Linux x64');
  }
  
  return gpus;
}

// ============================================================================
// Intel Detection (Linux x64)
// ============================================================================

/**
 * Detect Intel GPUs using lspci
 * @returns {Promise<Array>} Array of Intel GPU objects
 */
async function detectIntel_Linux() {
  const gpus = [];
  
  try {
    const result = await new Promise((resolve, reject) => {
      const lspci = spawn('lspci');
      
      let output = '';
      lspci.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      lspci.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error('lspci failed'));
        }
      });
      
      lspci.stderr.on('data', () => {}); // Ignore stderr
    });
    
    // Look for Intel VGA/Display controller
    const lines = result.split('\n');
    for (const line of lines) {
      if ((line.includes('VGA') || line.includes('Display')) && line.includes('Intel')) {
        const match = line.match(/:\s+(.+?)(?:\s+\(rev|\s+\[|$)/);
        if (match) {
          const gpuName = match[1].trim();
          
          // Intel integrated GPUs share system RAM
          const totalMem = Math.round(os.totalmem() / (1024 ** 3));
          const estimatedVRAM = Math.min(Math.round(totalMem * 0.5), 16); // Up to 50% or 16GB
          
          gpus.push({
            name: gpuName,
            vram: estimatedVRAM
          });
        }
      }
    }
  } catch (err) {
    throw new Error('Intel GPU detection failed on Linux x64');
  }
  
  return gpus;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  detectAll
};
