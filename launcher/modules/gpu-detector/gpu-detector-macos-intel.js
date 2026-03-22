/**
 * Pseudo Science Fiction Core Collection - GPU Detector Module
 * MACOS INTEL IMPLEMENTATION
 * 
 * Platform-specific GPU detection for macOS Intel systems.
 * This file contains ONLY macOS Intel-specific logic.
 * 
 * Supported GPUs:
 * - AMD Radeon discrete GPUs via system_profiler
 * - Intel Iris integrated GPUs via system_profiler
 * 
 * STATUS: 🟡 UNTESTED - Extracted from original code but not verified
 * 
 * @module gpu-detector-macos-intel
 * @version 1.1.2 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const os = require('os');
const { spawn } = require('child_process');

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect all GPUs on macOS Intel system
 * @returns {Promise<Object>} Hardware detection results
 */
async function detectAll() {
  const totalMem = Math.round(os.totalmem() / (1024 ** 3)); // GB
  const cpuCount = os.cpus().length;
  const platform = process.platform;
  
  let gpuDetected = false;
  let gpuVRAM = 0;
  let gpuList = [];
  
  // Use system_profiler to detect GPUs
  try {
    const gpus = await detectMacOSGPU();
    if (gpus.length > 0) {
      gpuDetected = true;
      gpuList = gpus;
      gpuVRAM = Math.max(...gpus.map(g => g.vram));
    }
  } catch (err) {
    console.log('[GPU Detector] macOS Intel GPU detection failed:', err.message);
  }
  
  console.log(`[GPU Detector] Platform: ${platform} (Intel)`);
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
// macOS GPU Detection
// ============================================================================

/**
 * Detect GPUs using system_profiler
 * Handles both discrete AMD GPUs and integrated Intel GPUs
 * @returns {Promise<Array>} Array of GPU objects
 */
async function detectMacOSGPU() {
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
        
        // For Intel integrated GPUs, estimate based on system RAM
        if (chipsetModel.toLowerCase().includes('intel') && vramMB === 0) {
          const totalMem = Math.round(os.totalmem() / (1024 ** 3));
          vramMB = Math.min(Math.round(totalMem * 0.5 * 1024), 16 * 1024); // Up to 50% or 16GB
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
    throw new Error('macOS Intel GPU detection failed');
  }
  
  return gpus;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  detectAll
};
