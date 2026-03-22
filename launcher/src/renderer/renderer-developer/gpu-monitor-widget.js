/**
 * GPU MONITOR WIDGET
 * Renderer-side component for displaying real-time GPU stats
 * 
 * @module gpu-monitor-widget
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

// ============================================================================
// STATE
// ============================================================================

let gpuMonitorListenerActive = false;
let gpuMonitorDisplayUnit = 'MB';  // default 'MB' (click toggles to 'GB')
let gpuMonitorTempUnit = 'C';      // 'C' or 'F'
let gpuMonitorLastData = null;     // Store last data for re-render on unit toggle
let gpuMonitorSyncTimer = null;
let gpuMonitorUserDismissed = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize GPU monitor widget
 * Checks saved preference and auto-starts if it was enabled
 */
async function initGpuMonitorWidget() {
  if (!window.__disclaimerAccepted) return;
  startGpuMonitorSyncLoop();
  try {
    // Check if GPU monitor was enabled in settings
    const enabled = await window.electronAPI.getGpuMonitorEnabled();
    
    if (enabled) {
      console.log('[GPU Monitor Widget] Auto-starting based on saved preference');
      
      // Start the monitor
      const result = await window.electronAPI.startGpuMonitor();
      
      if (result.success) {
        showGpuMonitorWidget();
        setupGpuMonitorListener();
      } else {
        console.warn('[GPU Monitor Widget] Failed to auto-start:', result.message);
      }
    }
  } catch (err) {
    console.warn('[GPU Monitor Widget] Init error:', err.message);
  }
}

// ============================================================================
// WIDGET DISPLAY
// ============================================================================

/**
 * Show the GPU monitor widget
 */
function showGpuMonitorWidget() {
  const widget = document.getElementById('gpu-monitor-widget');
  if (widget) {
    widget.style.display = 'block';
    gpuMonitorUserDismissed = false;
    setupGpuMonitorListener();
  }
}

/**
 * Hide the GPU monitor widget
 */
function hideGpuMonitorWidget() {
  const widget = document.getElementById('gpu-monitor-widget');
  if (widget) {
    widget.style.display = 'none';
    gpuMonitorUserDismissed = true;
  }
  
  // Note: We don't stop the monitor here - user can re-show via settings
  // The monitor continues running in case they want to see it again
}

/**
 * Toggle memory display unit between MB and GB
 */
function toggleGpuMonitorUnit() {
  gpuMonitorDisplayUnit = (gpuMonitorDisplayUnit === 'MB') ? 'GB' : 'MB';
  console.log(`[GPU Monitor Widget] Memory unit switched to ${gpuMonitorDisplayUnit}`);
  
  // Re-render with stored data
  if (gpuMonitorLastData) {
    updateGpuMonitorDisplay(gpuMonitorLastData);
  }
}

/**
 * Toggle temperature display unit between C and F
 */
function toggleGpuMonitorTempUnit() {
  gpuMonitorTempUnit = (gpuMonitorTempUnit === 'C') ? 'F' : 'C';
  console.log(`[GPU Monitor Widget] Temperature unit switched to ${gpuMonitorTempUnit}`);
  
  // Re-render with stored data
  if (gpuMonitorLastData) {
    updateGpuMonitorDisplay(gpuMonitorLastData);
  }
}

/**
 * Setup listener for GPU monitor data
 */
function setupGpuMonitorListener() {
  if (gpuMonitorListenerActive) return;
  
  window.electronAPI.onGpuMonitorData((gpuData) => {
    updateGpuMonitorDisplay(gpuData);
  });
  
  gpuMonitorListenerActive = true;
  console.log('[GPU Monitor Widget] Listener active');
}

/**
 * Update the GPU monitor display with new data
 * @param {Array} gpuData - Array of GPU objects from nvidia-smi
 */
function updateGpuMonitorDisplay(gpuData) {
  const textElement = document.getElementById('gpu-monitor-text');
  if (!textElement || !gpuData || gpuData.length === 0) return;
  
  // Store for re-render on unit toggle
  gpuMonitorLastData = gpuData;
  
  // Build display string for all GPUs
  const parts = gpuData.map(gpu => {
    // Format memory based on selected unit
    let memDisplay;
    if (gpu.isSharedMemory) {
      // Shared memory devices (Apple Silicon, Mali, Tegra)
      // Show system RAM usage since GPU shares with CPU
      if (gpuMonitorDisplayUnit === 'GB') {
        const memUsed = (gpu.memoryUsed / 1024).toFixed(1);
        const memTotal = (gpu.memoryTotal / 1024).toFixed(1);
        memDisplay = `${memUsed}/${memTotal} GB ⚡`;  // ⚡ indicates shared
      } else {
        const memUsed = Math.round(gpu.memoryUsed);
        const memTotal = Math.round(gpu.memoryTotal);
        memDisplay = `${memUsed}/${memTotal} MB ⚡`;
      }
    } else {
      // Dedicated VRAM
      let memUsed, memTotal, memUnit;
      if (gpuMonitorDisplayUnit === 'GB') {
        memUsed = (gpu.memoryUsed / 1024).toFixed(1);
        memTotal = (gpu.memoryTotal / 1024).toFixed(1);
        memUnit = 'GB';
      } else {
        memUsed = Math.round(gpu.memoryUsed);
        memTotal = Math.round(gpu.memoryTotal);
        memUnit = 'MB';
      }
      memDisplay = `${memUsed}/${memTotal} ${memUnit}`;
    }
    
    // Format temperature based on selected unit
    let tempDisplay;
    if (gpu.temperature < 0) {
      // Temperature not available (e.g., Apple Silicon without sudo)
      tempDisplay = '--';
    } else if (gpuMonitorTempUnit === 'C') {
      tempDisplay = `${gpu.temperature}°C`;
    } else {
      const tempF = Math.round((gpu.temperature * 9/5) + 32);
      tempDisplay = `${tempF}°F`;
    }
    
    // Determine temperature class (based on Celsius thresholds)
    let tempClass = 'gpu-stat-temp';
    if (gpu.temperature >= 80) {
      tempClass += ' hot';
    } else if (gpu.temperature >= 65) {
      tempClass += ' warm';
    }
    
    // Shorten GPU name if too long
    let gpuName = gpu.name;
    if (gpuName.length > 20) {
      // Try common shortenings
      gpuName = gpuName
        .replace('NVIDIA ', '')
        .replace('GeForce ', '')
        .replace('Quadro ', 'Q')
        .replace('Tesla ', 'T')
        .replace('Apple ', '')
        .replace('Mali-', 'M')
        // Modern NVIDIA unified memory GPUs
        .replace('Grace Blackwell ', 'GB')
        .replace('Grace Hopper ', 'GH')
        .replace('Blackwell ', 'B')
        .replace('Hopper ', 'H')
        .replace('Superchip', '')
        // Jetson series
        .replace('Jetson ', 'J')
        .replace('AGX ', '')
        .replace('Orin ', 'Orin ')
        .replace('Xavier ', 'Xav ');
    }
    
    return `<span class="gpu-stat-name">${gpuName}</span>` +
           `<span class="gpu-stat-separator">|</span>` +
           `<span class="gpu-stat-memory" onclick="toggleGpuMonitorUnit()" style="cursor: pointer;" title="${gpu.isSharedMemory ? 'Shared memory (⚡) - Click to toggle MB/GB' : 'Click to toggle MB/GB'}">${memDisplay}</span>` +
           `<span class="gpu-stat-separator">|</span>` +
           `<span class="${tempClass}" onclick="toggleGpuMonitorTempUnit()" style="cursor: pointer;" title="Click to toggle °C/°F">${tempDisplay}</span>`;
  });
  
  // Join multiple GPUs with separator
  textElement.innerHTML = parts.join('<span class="gpu-stat-separator" style="margin: 0 10px;">•</span>');
}

/**
 * Cleanup GPU monitor (call on app close or when disabling)
 */
async function cleanupGpuMonitor() {
  try {
    window.electronAPI.removeGpuMonitorListener();
    gpuMonitorListenerActive = false;
    
    const widget = document.getElementById('gpu-monitor-widget');
    if (widget) {
      widget.style.display = 'none';
    }
  } catch (err) {
    console.warn('[GPU Monitor Widget] Cleanup error:', err.message);
  }
}

function startGpuMonitorSyncLoop() {
  if (gpuMonitorSyncTimer) return;
  gpuMonitorSyncTimer = setInterval(async () => {
    try {
      if (!window.__disclaimerAccepted) return;
      const isRunning = await window.electronAPI.isGpuMonitorRunning();
      if (!isRunning) {
        gpuMonitorUserDismissed = false;
        return;
      }
      const widget = document.getElementById('gpu-monitor-widget');
      if (!widget) return;
      if (widget.style.display === 'none' && !gpuMonitorUserDismissed) {
        showGpuMonitorWidget();
      }
    } catch {
      // ignore periodic sync errors
    }
  }, 3000);
}

// ============================================================================
// EXPORTS (for use by other modules)
// ============================================================================

// These functions are called from settings-modal.js
// They're global so they can be accessed from onclick handlers
