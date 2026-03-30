/**
 * Pseudo Science Fiction Core Collection - GPU Detector Module
 * LINUX ARM64 IMPLEMENTATION
 * 
 * Platform-specific GPU detection for Linux ARM64 systems.
 * This file contains ONLY Linux ARM64-specific logic.
 * 
 * Supported Hardware:
 * - NVIDIA Jetson (CUDA) via nvidia-smi
 * - ARM Mali GPU (Orange Pi, Rock Pi, etc.)
 * - Rockchip NPU (RK3588, RK3576, RK3566)
 * - CIX NPU (CD8180, CD8160)
 * - Google Coral TPU
 * - Hailo AI Accelerator
 * - Raspberry Pi VideoCore GPU
 * 
 * STATUS: 🟡 UNTESTED - Extracted from original code but not verified
 * 
 * @module gpu-detector-linux-arm64
 * @version 1.1.3 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const common = require('./gpu-detector-common.js');

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect all GPUs/NPUs/TPUs on Linux ARM64 system
 * @returns {Promise<Object>} Hardware detection results
 */
async function detectAll() {
  const totalMem = Math.round(os.totalmem() / (1024 ** 3)); // GB
  const cpuCount = os.cpus().length;
  const platform = process.platform;
  
  let gpuDetected = false;
  let gpuVRAM = 0;
  let gpuList = [];
  
  console.log('[GPU Detector] ARM64 architecture detected, checking for SBC GPUs/NPUs...');
  
  // Try to detect ARM SBC accelerators (NPU, TPU, etc.)
  try {
    const armAccelerators = await detectARM_Accelerators();
    if (armAccelerators.length > 0) {
      gpuList.push(...armAccelerators);
    }
  } catch (err) {
    console.log('[GPU Detector] ARM accelerator detection failed:', err.message);
  }
  
  // Try ARM Mali GPU detection
  if (gpuList.length === 0) {
    try {
      const maliGPUs = await detectMali_GPU();
      if (maliGPUs.length > 0) {
        gpuList.push(...maliGPUs);
      }
    } catch (err) {
      console.log('[GPU Detector] Mali GPU detection failed');
    }
  }
  
  // Try Raspberry Pi VideoCore
  if (gpuList.length === 0) {
    try {
      const videocoreGPUs = await detectVideoCore_GPU();
      if (videocoreGPUs.length > 0) {
        gpuList.push(...videocoreGPUs);
      }
    } catch (err) {
      console.log('[GPU Detector] VideoCore GPU detection failed');
    }
  }
  
  // Try NVIDIA (Jetson boards have nvidia-smi!)
  if (gpuList.length === 0) {
    try {
      const nvidiaGPUs = await detectNVIDIA_ARM();
      gpuList.push(...nvidiaGPUs);
    } catch (err) {
      console.log('[GPU Detector] NVIDIA detection failed on ARM64');
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
// NVIDIA Detection (ARM64 - Jetson)
// ============================================================================

/**
 * Detect NVIDIA GPUs on ARM64 (Jetson boards)
 * @returns {Promise<Array>} Array of NVIDIA GPU objects
 */
async function detectNVIDIA_ARM() {
  return common.detectNVIDIA_Common();
}

// ============================================================================
// ARM SBC Accelerator Detection
// ============================================================================

/**
 * Detect NPUs and TPUs on ARM single-board computers
 * @returns {Promise<Array>} Array of accelerator objects
 */
async function detectARM_Accelerators() {
  const accelerators = [];
  
  // Detect Rockchip NPU (Orange Pi 5/6, Rock 5, etc.)
  try {
    const rockchipNPU = await detectRockchip_NPU();
    if (rockchipNPU) {
      accelerators.push(rockchipNPU);
    }
  } catch (err) {
    console.log('[GPU Detector] Rockchip NPU not found');
  }
  
  // Detect Google Coral TPU
  try {
    const coralTPU = await detectCoral_TPU();
    if (coralTPU) {
      accelerators.push(coralTPU);
    }
  } catch (err) {
    console.log('[GPU Detector] Coral TPU not found');
  }
  
  // Detect Hailo AI Accelerator
  try {
    const hailoAI = await detectHailo_AI();
    if (hailoAI) {
      accelerators.push(hailoAI);
    }
  } catch (err) {
    console.log('[GPU Detector] Hailo AI not found');
  }
  
  return accelerators;
}

/**
 * Rockchip NPU Detection
 * Supports CIX CD8180/CD8160 (30 TOPS), RK3588 (6 TOPS), RK3576 (8 TOPS), RK3566 (1 TOPS)
 */
async function detectRockchip_NPU() {
  try {
    const npuPaths = [
      '/sys/class/devfreq/fdab0000.npu',  // RK3588
      '/sys/class/devfreq/fde40000.npu',  // RK3576
      '/proc/device-tree/npu@fdab0000',
      '/proc/device-tree/npu@fde40000'
    ];
    
    let foundNPU = false;
    for (const npuPath of npuPaths) {
      if (fs.existsSync(npuPath)) {
        foundNPU = true;
        break;
      }
    }
    
    if (foundNPU || fs.existsSync('/proc/device-tree/compatible')) {
      let socName = 'Unknown SoC';
      let npuTOPS = 0;
      let combinedTOPS = 0;
      
      if (fs.existsSync('/proc/device-tree/compatible')) {
        const compatible = fs.readFileSync('/proc/device-tree/compatible', 'utf8');
        
        if (compatible.includes('cd8180') || compatible.includes('cd8160') || compatible.includes('cix,p1')) {
          if (compatible.includes('cd8180')) {
            socName = 'CIX CD8180';
          } else if (compatible.includes('cd8160')) {
            socName = 'CIX CD8160'; 
          } else {
            socName = 'CIX P1';
          }
          npuTOPS = 30;
          combinedTOPS = 45;
        } else if (compatible.includes('rk3588')) {
          socName = 'Rockchip RK3588';
          npuTOPS = 6;
          combinedTOPS = 6;
        } else if (compatible.includes('rk3576')) {
          socName = 'Rockchip RK3576';
          npuTOPS = 8;
          combinedTOPS = 8;
        } else if (compatible.includes('rk3566')) {
          socName = 'Rockchip RK3566';
          npuTOPS = 1;
          combinedTOPS = 1;
        }
      }
      
      if (npuTOPS > 0) {
        const totalMem = Math.round(os.totalmem() / (1024 ** 3));
        const estimatedVRAM = Math.round(totalMem * 0.3);
        
        console.log(`[GPU Detector] Detected ${socName} NPU with ${npuTOPS} TOPS`);
        
        return {
          name: `${socName} NPU (${npuTOPS} TOPS)`,
          vram: estimatedVRAM,
          type: 'npu',
          tops: npuTOPS,
          combined_tops: combinedTOPS
        };
      }
    }
    
    throw new Error('NPU not found');
  } catch (err) {
    throw err;
  }
}

/**
 * Google Coral TPU Detection
 */
async function detectCoral_TPU() {
  try {
    // Check for Coral TPU via USB
    const result = await new Promise((resolve, reject) => {
      const lsusb = spawn('lsusb');
      
      let output = '';
      lsusb.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      lsusb.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error('lsusb failed'));
        }
      });
      
      lsusb.stderr.on('data', () => {});
    });
    
    if (result.includes('Google') || result.includes('1a6e:089a')) {
      console.log('[GPU Detector] Detected Google Coral USB Accelerator');
      return {
        name: 'Google Coral Edge TPU (USB)',
        vram: 0,
        type: 'tpu',
        tops: 4
      };
    }
    
    if (fs.existsSync('/sys/class/apex')) {
      console.log('[GPU Detector] Detected Google Coral PCIe Accelerator');
      return {
        name: 'Google Coral Edge TPU (PCIe)',
        vram: 0,
        type: 'tpu',
        tops: 4
      };
    }
    
    throw new Error('Coral TPU not found');
  } catch (err) {
    throw err;
  }
}

/**
 * Hailo AI Accelerator Detection
 */
async function detectHailo_AI() {
  try {
    const pciDevices = '/sys/bus/pci/devices';
    if (fs.existsSync(pciDevices)) {
      const devices = fs.readdirSync(pciDevices);
      
      for (const device of devices) {
        const vendorPath = path.join(pciDevices, device, 'vendor');
        if (fs.existsSync(vendorPath)) {
          const vendor = fs.readFileSync(vendorPath, 'utf8').trim();
          if (vendor === '0x1e60') {
            console.log('[GPU Detector] Detected Hailo AI Accelerator');
            return {
              name: 'Hailo-8 AI Accelerator',
              vram: 0,
              type: 'npu',
              tops: 26
            };
          }
        }
      }
    }
    
    const result = await new Promise((resolve, reject) => {
      const lsusb = spawn('lsusb');
      
      let output = '';
      lsusb.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      lsusb.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error('lsusb failed'));
        }
      });
      
      lsusb.stderr.on('data', () => {});
    });
    
    if (result.includes('Hailo') || result.includes('1e60')) {
      console.log('[GPU Detector] Detected Hailo AI USB Accelerator');
      return {
        name: 'Hailo-8L AI Accelerator (USB)',
        vram: 0,
        type: 'npu',
        tops: 13
      };
    }
    
    throw new Error('Hailo AI not found');
  } catch (err) {
    throw err;
  }
}

/**
 * ARM Mali GPU Detection
 */
async function detectMali_GPU() {
  const gpus = [];
  
  try {
    const maliPaths = [
      '/sys/devices/platform/fb000000.gpu',
      '/sys/devices/platform/fde60000.gpu',
      '/sys/class/misc/mali0'
    ];
    
    let foundMali = false;
    for (const maliPath of maliPaths) {
      if (fs.existsSync(maliPath)) {
        foundMali = true;
        break;
      }
    }
    
    if (foundMali || fs.existsSync('/proc/device-tree/compatible')) {
      let gpuName = 'ARM Mali GPU';
      
      if (fs.existsSync('/proc/device-tree/compatible')) {
        const compatible = fs.readFileSync('/proc/device-tree/compatible', 'utf8');
        
        if (compatible.includes('cd8180') || compatible.includes('cd8160') || compatible.includes('cix,p1')) {
          gpuName = 'ARM Immortalis-G720 MC10';
        } else if (compatible.includes('rk3588')) {
          gpuName = 'ARM Mali-G610 MP4';
        } else if (compatible.includes('rk3576')) {
          gpuName = 'ARM Mali-G52 MC3';
        } else if (compatible.includes('rk3566')) {
          gpuName = 'ARM Mali-G52 MP2';
        }
      }
      
      const totalMem = Math.round(os.totalmem() / (1024 ** 3));
      const estimatedVRAM = Math.round(totalMem * 0.4);
      
      console.log(`[GPU Detector] Detected ${gpuName}`);
      
      gpus.push({
        name: gpuName,
        vram: estimatedVRAM
      });
    }
    
    if (gpus.length === 0) {
      throw new Error('Mali GPU not found');
    }
  } catch (err) {
    throw err;
  }
  
  return gpus;
}

/**
 * Raspberry Pi VideoCore GPU Detection
 */
async function detectVideoCore_GPU() {
  const gpus = [];
  
  try {
    if (fs.existsSync('/usr/bin/vcgencmd') || fs.existsSync('/opt/vc/bin/vcgencmd')) {
      const vcgencmd = fs.existsSync('/usr/bin/vcgencmd') ? '/usr/bin/vcgencmd' : '/opt/vc/bin/vcgencmd';
      
      const result = await new Promise((resolve, reject) => {
        const vc = spawn(vcgencmd, ['get_mem', 'gpu']);
        
        let output = '';
        vc.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        vc.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error('vcgencmd failed'));
          }
        });
        
        vc.stderr.on('data', () => {});
      });
      
      const match = result.match(/gpu=(\d+)M/);
      let gpuMemMB = 128;
      
      if (match) {
        gpuMemMB = parseInt(match[1]);
      }
      
      let piModel = 'Raspberry Pi';
      if (fs.existsSync('/proc/device-tree/model')) {
        const model = fs.readFileSync('/proc/device-tree/model', 'utf8').trim();
        piModel = model.replace(/\0/g, '');
      }
      
      console.log(`[GPU Detector] Detected ${piModel} with ${gpuMemMB}MB GPU memory`);
      
      gpus.push({
        name: `${piModel} VideoCore GPU`,
        vram: Math.max(1, Math.round(gpuMemMB / 1024))
      });
    } else {
      throw new Error('Not a Raspberry Pi');
    }
  } catch (err) {
    throw err;
  }
  
  return gpus;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  detectAll
};
