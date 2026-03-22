/**
 * Pseudo Science Fiction Core Collection - GPU Detector Common Utilities
 * SHARED LOGIC - Platform-agnostic functions used by all implementations
 * 
 * This file contains functions that work identically across all platforms:
 * - classifyForInference() - GPU classification based on name/type
 * - detectNVIDIA_Common() - nvidia-smi parsing (works on Windows + Linux)
 * 
 * @module gpu-detector-common
 * @version 1.1.2 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const { spawn } = require('child_process');

// ============================================================================
// GPU Classification (Platform-Agnostic)
// ============================================================================

/**
 * Classify detected hardware for AI inference
 * Selects primary GPU (highest VRAM) and determines acceleration type
 * 
 * This function is COMPLETELY platform-agnostic - just string matching.
 * Works identically on Windows, macOS, Linux x64, and Linux ARM.
 * 
 * @param {Object} hardware - Hardware detection results from detectAll()
 * @returns {Object} GPU classification for inference configuration
 */
function classifyForInference(hardware) {
  const gpuInfo = {
    accelerationType: 'cpu',
    cudaDeviceIndex: null,
    displayText: '💻 CPU Inference',
    detected: false
  };
  
  if (!hardware || !hardware.gpu_list || hardware.gpu_list.length === 0) {
    console.log('[GPU Classifier] No GPU detected, using CPU inference');
    gpuInfo.detected = true;
    return gpuInfo;
  }
  
  // Find GPU with highest VRAM (not just first GPU)
  // This handles multi-GPU systems correctly (e.g., iGPU + dGPU)
  const primaryGPU = hardware.gpu_list.reduce((best, gpu) => {
    return (gpu.vram > best.vram) ? gpu : best;
  }, hardware.gpu_list[0]);
  
  console.log(`[GPU Classifier] Selected GPU: ${primaryGPU.name} with ${primaryGPU.vram}GB VRAM`);
  
  const gpuName = primaryGPU.name.toLowerCase();
  
  // NVIDIA GPUs (CUDA)
  if (gpuName.includes('nvidia') || gpuName.includes('geforce') || 
      gpuName.includes('quadro') || gpuName.includes('tesla') ||
      gpuName.includes('rtx') || gpuName.includes('gtx')) {
    gpuInfo.accelerationType = 'nvidia';
    gpuInfo.cudaDeviceIndex = primaryGPU.uuid || primaryGPU.index || 0;  // Prefer UUID, fallback to index
    gpuInfo.displayText = '🎮 GPU Inference';
    gpuInfo.vram = primaryGPU.vram;
    gpuInfo.name = primaryGPU.name;
    gpuInfo.uuid = primaryGPU.uuid;
    gpuInfo.index = primaryGPU.index;  // Include index for CUDA_VISIBLE_DEVICES fallback
    console.log(`[GPU Classifier] NVIDIA GPU detected: ${primaryGPU.name} (CUDA UUID: ${gpuInfo.cudaDeviceIndex})`);
  }
  // Apple Silicon (Metal)
  else if (gpuName.includes('apple') || gpuName.includes('m1') || 
           gpuName.includes('m2') || gpuName.includes('m3') || gpuName.includes('m4')) {
    gpuInfo.accelerationType = 'apple-silicon';
    gpuInfo.displayText = '🍎 Apple Silicon';
    gpuInfo.vram = primaryGPU.vram;
    gpuInfo.name = primaryGPU.name;
    console.log(`[GPU Classifier] Apple Silicon detected: ${primaryGPU.name}`);
  }
  // ARM Mali GPU
  else if (gpuName.includes('mali')) {
    gpuInfo.accelerationType = 'mali';
    gpuInfo.displayText = '⚡ Mali GPU';
    gpuInfo.vram = primaryGPU.vram;
    gpuInfo.name = primaryGPU.name;
    console.log(`[GPU Classifier] ARM Mali GPU detected: ${primaryGPU.name}`);
  }
  // VideoCore (Raspberry Pi)
  else if (gpuName.includes('videocore')) {
    gpuInfo.accelerationType = 'videocore';
    gpuInfo.displayText = '⚡ VideoCore GPU';
    gpuInfo.vram = primaryGPU.vram;
    gpuInfo.name = primaryGPU.name;
    console.log(`[GPU Classifier] VideoCore GPU detected: ${primaryGPU.name}`);
  }
  // NPU (Rockchip, Hailo, etc.)
  else if (gpuName.includes('npu') || gpuName.includes('rockchip') || 
           gpuName.includes('hailo') || gpuName.includes('coral')) {
    gpuInfo.accelerationType = 'npu';
    gpuInfo.displayText = '⚡ NPU Acceleration';
    gpuInfo.vram = primaryGPU.vram;
    gpuInfo.name = primaryGPU.name;
    console.log(`[GPU Classifier] NPU detected: ${primaryGPU.name}`);
  }
  // AMD GPUs (ROCm - future support)
  else if (gpuName.includes('amd') || gpuName.includes('radeon')) {
    gpuInfo.accelerationType = 'amd';
    gpuInfo.displayText = '🎮 GPU Inference';
    gpuInfo.vram = primaryGPU.vram;
    gpuInfo.name = primaryGPU.name;
    console.log(`[GPU Classifier] AMD GPU detected: ${primaryGPU.name} (ROCm support may vary)`);
  }
  // Intel GPUs (oneAPI - future support)
  else if (gpuName.includes('intel') && (gpuName.includes('arc') || gpuName.includes('iris'))) {
    gpuInfo.accelerationType = 'intel';
    gpuInfo.displayText = '🎮 GPU Inference';
    gpuInfo.vram = primaryGPU.vram;
    gpuInfo.name = primaryGPU.name;
    console.log(`[GPU Classifier] Intel GPU detected: ${primaryGPU.name} (oneAPI support may vary)`);
  }
  // Unknown GPU - generic acceleration
  else {
    gpuInfo.accelerationType = 'gpu';
    gpuInfo.displayText = '🎮 GPU Inference';
    gpuInfo.vram = primaryGPU.vram;
    gpuInfo.name = primaryGPU.name;
    console.log(`[GPU Classifier] Unknown GPU type: ${primaryGPU.name}, attempting generic GPU inference`);
  }
  
  gpuInfo.detected = true;
  return gpuInfo;
}

// ============================================================================
// NVIDIA Detection (Shared between Windows and Linux)
// ============================================================================

/**
 * NVIDIA GPU Detection using nvidia-smi
 * 
 * This function works on BOTH Windows and Linux because nvidia-smi
 * has identical behavior on both platforms.
 * 
 * @returns {Promise<Array>} Array of NVIDIA GPU objects
 */
async function detectNVIDIA_Common() {
  const gpus = [];
  
  try {
    const result = await new Promise((resolve, reject) => {
      const nvidia = spawn('nvidia-smi', [
        '--query-gpu=index,name,memory.total,uuid',
        '--format=csv,noheader,nounits'
      ]);
      
      let output = '';
      nvidia.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      nvidia.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error('nvidia-smi failed'));
        }
      });
      
      nvidia.stderr.on('data', () => {}); // Ignore stderr
    });
    
    const lines = result.split('\n');
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 4) {
        const gpuIndex = parseInt(parts[0]);
        const gpuName = parts[1];
        const vramMB = parseInt(parts[2]);
        const gpuUUID = parts[3];
        if (vramMB > 0) {
          gpus.push({
            name: gpuName,
            vram: Math.round(vramMB / 1024), // Convert MB to GB
            index: gpuIndex,  // nvidia-smi display index (for reference only)
            uuid: gpuUUID     // Hardware UUID (for CUDA_VISIBLE_DEVICES)
          });
        }
      }
    }
  } catch (err) {
    throw new Error('NVIDIA GPU not found');
  }
  
  return gpus;
}

// ============================================================================
// Hardware Requirements Calculation Pipeline
// ============================================================================

/**
 * Calculate KV cache memory usage per 1K tokens
 * @param {Object} model - Model with architecture fields
 * @returns {number} MB per 1K tokens
 */
function calculateKVPer1KTokens(model) {
  const hiddenSize = model.hidden_size || model.hiddenSize;
  const numLayers = model.num_layers || model.numLayers || model.num_hidden_layers;
  const numKVHeads = model.num_kv_heads || model.numKVHeads || model.num_key_value_heads;
  const numAttentionHeads = model.num_attention_heads || model.numAttentionHeads;
  
  // If we don't have architecture info, estimate from file size
  if (!hiddenSize || !numLayers || !numKVHeads) {
    console.log('[GPU Common] Missing architecture info, using size-based estimate');
    const sizeGB = (model.size_mb || 0) / 1024;
    // Rough estimate: ~50MB per 1K tokens for 7B, scales with size
    return Math.max(20, sizeGB * 7);
  }
  
  const headDim = hiddenSize / numAttentionHeads;
  const bytesPerElement = 2; // FP16 for KV cache even in quantized models
  
  // KV cache per token = 2 (K+V) × layers × kv_heads × head_dim × bytes
  const kvPerTokenBytes = 2 * numLayers * numKVHeads * headDim * bytesPerElement;
  const kvPer1KTokensMB = (kvPerTokenBytes * 1000) / (1024 * 1024);
  
  console.log(`[GPU Common] KV cache: ${kvPer1KTokensMB.toFixed(1)} MB per 1K tokens`);
  return kvPer1KTokensMB;
}

function parseParameterBillions(model) {
  const candidates = [
    model?.parameters,
    model?.name,
    model?.id,
    model?.filename
  ].map((v) => String(v || '')).filter(Boolean);
  for (const text of candidates) {
    // Match patterns like: 397B, 33b, 1.7b, 397B-A17B (first = total)
    const matches = text.match(/(\d+(?:\.\d+)?)\s*[bB]/g);
    if (!matches || matches.length === 0) continue;
    const first = String(matches[0]).match(/(\d+(?:\.\d+)?)/);
    if (!first) continue;
    const total = Number(first[1]);
    if (Number.isFinite(total) && total > 0) return total;
  }
  return 0;
}

function quantizationBits(model) {
  const q = String(model?.quantization || model?.filename || '').toUpperCase();
  if (q.includes('Q2')) return 2;
  if (q.includes('Q3')) return 3;
  if (q.includes('Q4')) return 4;
  if (q.includes('Q5')) return 5;
  if (q.includes('Q6')) return 6;
  if (q.includes('Q8')) return 8;
  if (q.includes('F16') || q.includes('FP16') || q.includes('BF16')) return 16;
  if (q.includes('F32') || q.includes('FP32')) return 32;
  return 4; // conservative default
}

/**
 * Calculate baseline memory (context-independent)
 * @param {Object} model - Model from catalog
 * @returns {number} Baseline GB required
 */
function calculateBaseline(model) {
  const weightsFromSizeGB = (model.size_mb || 0) / 1024;
  const paramsB = parseParameterBillions(model);
  const bits = quantizationBits(model);
  const estimatedWeightsFromParamsGB = paramsB > 0 ? (paramsB * 1e9 * (bits / 8)) / (1024 ** 3) : 0;
  // If parsed parameter estimate is much larger than reported file size, trust parameter floor.
  const weightsGB = Math.max(weightsFromSizeGB, estimatedWeightsFromParamsGB);
  const visionGB = model.supports_vision ? 2.0 : 0;
  const activationGB = weightsGB * 0.25; // ~25% for activations
  const overheadGB = 0.5; // Ollama/runtime overhead
  
  const baseline = weightsGB + visionGB + activationGB + overheadGB;
  console.log(`[GPU Common] Baseline: ${baseline.toFixed(2)} GB (weights: ${weightsGB.toFixed(1)} [size=${weightsFromSizeGB.toFixed(1)}, params=${estimatedWeightsFromParamsGB.toFixed(1)}], vision: ${visionGB}, activation: ${activationGB.toFixed(1)}, overhead: ${overheadGB})`);
  return baseline;
}

/**
 * Calculate full hardware requirements for a model
 * @param {Object} model - Model from catalog with architecture fields
 * @returns {Object} Requirements object
 */
function calculateModelRequirements(model) {
  const baseline = calculateBaseline(model);
  const kvPer1K = calculateKVPer1KTokens(model);
  
  const contextLength = model.context_length || 4096;
  const minContext = 2048;
  const recommendedContext = Math.min(contextLength, 32768);
  
  // KV cache at different context lengths (in GB)
  const kvAtMin = (kvPer1K * minContext / 1000) / 1024;
  const kvAtRecommended = (kvPer1K * recommendedContext / 1000) / 1024;
  const kvAtMax = (kvPer1K * contextLength / 1000) / 1024;
  
  // GPU requirements (tighter, optimized memory)
  const minVRAM = Math.ceil(baseline + kvAtMin + 0.5);
  const recommendedVRAM = Math.ceil(baseline + kvAtRecommended + 2.0);
  
  // CPU/RAM requirements (~15% more for non-optimized layout)
  const minRAM = Math.ceil(baseline * 1.15 + kvAtMin + 2.0);
  const recommendedRAM = Math.ceil(baseline * 1.15 + kvAtRecommended + 4.0);
  
  return {
    baseline_gb: parseFloat(baseline.toFixed(2)),
    kv_per_1k_tokens_mb: parseFloat(kvPer1K.toFixed(1)),
    min_vram_gb: minVRAM,
    min_ram_gb: minRAM,
    min_context: minContext,
    recommended_vram_gb: recommendedVRAM,
    recommended_ram_gb: recommendedRAM,
    recommended_context: recommendedContext,
    max_context: contextLength,
    kv_at_max_gb: parseFloat(kvAtMax.toFixed(2)),
    supports_vision: model.supports_vision || false
  };
}

/**
 * Get compatibility verdict for a model on user's hardware
 * @param {Object} model - Model from catalog
 * @param {Object} hardware - Hardware from detectAll()
 * @param {Object} classification - GPU classification from classifyForInference()
 * @returns {Object} Compatibility assessment
 */
function getModelCompatibility(model, hardware, classification) {
  const req = calculateModelRequirements(model);
  
  const gpuVRAM = classification?.vram || 0;
  const systemRAM = hardware?.ram_gb || 0;
  const hasGPU = classification?.accelerationType && classification.accelerationType !== 'cpu';
  
  // Calculate available memory for KV cache
  const availableVRAM = Math.max(0, gpuVRAM - req.baseline_gb - 0.5);
  const availableRAM = Math.max(0, systemRAM - req.baseline_gb * 1.15 - 2.0);
  
  // Calculate max context that fits
  const maxContextGPU = hasGPU && availableVRAM > 0 
    ? Math.floor((availableVRAM * 1024) / req.kv_per_1k_tokens_mb * 1000)
    : 0;
  const maxContextCPU = availableRAM > 0
    ? Math.floor((availableRAM * 1024) / req.kv_per_1k_tokens_mb * 1000)
    : 0;
  
  // Cap at model's max context
  const effectiveMaxGPU = Math.min(maxContextGPU, req.max_context);
  const effectiveMaxCPU = Math.min(maxContextCPU, req.max_context);
  
  // Determine verdicts
  let gpuVerdict, cpuVerdict, overallVerdict, message;
  
  // GPU verdict
  if (!hasGPU) {
    gpuVerdict = 'no_gpu';
  } else if (effectiveMaxGPU >= req.recommended_context) {
    gpuVerdict = 'excellent';
  } else if (effectiveMaxGPU >= 8192) {
    gpuVerdict = 'good';
  } else if (effectiveMaxGPU >= 2048) {
    gpuVerdict = 'marginal';
  } else {
    gpuVerdict = 'insufficient';
  }
  
  // CPU verdict
  if (effectiveMaxCPU >= req.recommended_context) {
    cpuVerdict = 'good';
  } else if (effectiveMaxCPU >= 8192) {
    cpuVerdict = 'usable';
  } else if (effectiveMaxCPU >= 2048) {
    cpuVerdict = 'marginal';
  } else {
    cpuVerdict = 'insufficient';
  }
  
  // Overall verdict and message
  if (gpuVerdict === 'excellent') {
    overallVerdict = 'excellent';
    message = `Runs fully on GPU with ${req.recommended_context.toLocaleString()} context`;
  } else if (gpuVerdict === 'good') {
    overallVerdict = 'good';
    message = `GPU mode up to ${effectiveMaxGPU.toLocaleString()} context`;
  } else if (gpuVerdict === 'marginal') {
    overallVerdict = 'marginal';
    message = `GPU limited to ${effectiveMaxGPU.toLocaleString()} context`;
  } else if (cpuVerdict === 'good' || cpuVerdict === 'usable') {
    overallVerdict = 'cpu_recommended';
    message = `CPU mode recommended (up to ${effectiveMaxCPU.toLocaleString()} context)`;
  } else if (cpuVerdict === 'marginal') {
    overallVerdict = 'marginal';
    message = `May run with very limited context (${effectiveMaxCPU.toLocaleString()} max)`;
  } else {
    overallVerdict = 'insufficient';
    message = `Insufficient memory (need ${req.min_ram_gb}GB RAM minimum)`;
  }
  
  // Add vision warning
  if (req.supports_vision && gpuVerdict !== 'excellent' && gpuVerdict !== 'good') {
    message += '. Vision models have high baseline memory.';
  }
  
  return {
    canRun: overallVerdict !== 'insufficient',
    verdict: overallVerdict,
    message: message,
    requirements: req,
    gpu: {
      verdict: gpuVerdict,
      max_context: effectiveMaxGPU,
      available_vram_gb: parseFloat(availableVRAM.toFixed(1))
    },
    cpu: {
      verdict: cpuVerdict,
      max_context: effectiveMaxCPU,
      available_ram_gb: parseFloat(availableRAM.toFixed(1))
    },
    user_hardware: {
      gpu_vram_gb: gpuVRAM,
      ram_gb: systemRAM,
      has_gpu: hasGPU,
      gpu_name: classification?.name || 'None'
    }
  };
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  classifyForInference,
  detectNVIDIA_Common,
  calculateKVPer1KTokens,
  calculateBaseline,
  calculateModelRequirements,
  getModelCompatibility
};
