/**
 * Pseudo Science Fiction Core Collection - GPU Detector Module
 * MACOS ARM (APPLE SILICON) IMPLEMENTATION
 * 
 * Platform-specific GPU detection for macOS ARM64 (Apple Silicon) systems.
 * This file contains ONLY macOS ARM64-specific logic.
 * 
 * Supported GPUs:
 * - Apple Silicon (M1/M2/M3/M4) unified memory via system_profiler
 * 
 * NOTE: Apple Silicon uses unified memory architecture - GPU shares system RAM.
 * We estimate 70% of system RAM is available for GPU tasks (conservative estimate).
 * 
 * STATUS: 🟡 UNTESTED - Extracted from original code but not verified
 * 
 * @module gpu-detector-macos-arm
 * @version 1.1.3 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const os = require('os');
const { spawn } = require('child_process');

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect all GPUs on macOS ARM64 (Apple Silicon) system
 * @returns {Promise<Object>} Hardware detection results
 */
async function detectAll() {
  const totalMem = Math.round(os.totalmem() / (1024 ** 3)); // GB
  const cpuCount = os.cpus().length;
  const platform = process.platform;
  
  let gpuDetected = false;
  let gpuVRAM = 0;
  let gpuList = [];
  
  // Use system_profiler to detect Apple Silicon GPU
  try {
    const gpus = await detectAppleSiliconGPU();
    if (gpus.length > 0) {
      gpuDetected = true;
      gpuList = gpus;
      gpuVRAM = Math.max(...gpus.map(g => g.vram));
    }
  } catch (err) {
    console.log('[GPU Detector] Apple Silicon GPU detection failed:', err.message);
  }
  
  console.log(`[GPU Detector] Platform: ${platform} (Apple Silicon)`);
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
// Apple Silicon GPU Detection
// ============================================================================

/**
 * Detect Apple Silicon GPU using system_profiler
 * Apple Silicon uses unified memory - GPU shares system RAM
 * 
 * @returns {Promise<Array>} Array of GPU objects
 */
async function detectAppleSiliconGPU() {
  const gpus = [];
  
  try {
    const result = await new Promise((resolve, reject) => {
      const profiler = spawn('system_profiler', ['SPDisplaysDataType', '-json']);
      
      let output = '';
      profiler.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      profiler.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error('system_profiler failed'));
        }
      });
      
      profiler.stderr.on('data', () => {}); // Ignore stderr
    });
    
    const data = JSON.parse(result);
    
    // Parse the display data
    if (data.SPDisplaysDataType && Array.isArray(data.SPDisplaysDataType)) {
      for (const display of data.SPDisplaysDataType) {
        // Check for chipset model (GPU name)
        const chipsetModel = display.sppci_model || display.spdisplays_chipset || 'Unknown GPU';
        
        // Try to extract VRAM
        let vramMB = 0;
        
        // Look for VRAM in various fields
        if (display.spdisplays_vram) {
          const vramStr = display.spdisplays_vram.toLowerCase();
          if (vramStr.includes('mb')) {
            vramMB = parseInt(vramStr);
          } else if (vramStr.includes('gb')) {
            vramMB = parseInt(vramStr) * 1024;
          }
        } else if (display.sppci_ram) {
          const ramStr = display.sppci_ram.toLowerCase();
          if (ramStr.includes('mb')) {
            vramMB = parseInt(ramStr);
          } else if (ramStr.includes('gb')) {
            vramMB = parseInt(ramStr) * 1024;
          }
        }
        
        // For Apple Silicon, estimate based on system RAM
        // M1/M2/M3/M4 use unified memory - allocate ~70% for GPU tasks
        // This is a conservative estimate for LLM workloads
        if (chipsetModel.toLowerCase().includes('apple') || 
            chipsetModel.toLowerCase().includes('m1') ||
            chipsetModel.toLowerCase().includes('m2') ||
            chipsetModel.toLowerCase().includes('m3') ||
            chipsetModel.toLowerCase().includes('m4')) {
          const totalMem = Math.round(os.totalmem() / (1024 ** 3));
          vramMB = Math.round(totalMem * 0.7 * 1024); // 70% of system RAM
          
          console.log(`[GPU Detector] Apple Silicon detected: ${chipsetModel}`);
          console.log(`[GPU Detector] System RAM: ${totalMem}GB, Estimated GPU VRAM: ${Math.round(vramMB / 1024)}GB (70%)`);
        }
        
        if (vramMB > 0) {
          gpus.push({
            name: chipsetModel,
            vram: Math.round(vramMB / 1024) // Convert to GB
          });
        }
      }
    }
  } catch (err) {
    throw new Error('Apple Silicon GPU detection failed');
  }
  
  return gpus;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  detectAll
};
