/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// BINARY VERSION MANAGEMENT
// ============================================================================

// Load and display current binary versions
async function loadBinaryVersions() {
  try {
    const versions = await window.electronAPI.getBinaryVersions();
    if (versions && versions.ollama) {
      document.getElementById('ollama-version').textContent = versions.ollama.version;
    }
    if (versions && versions.nodejs) {
      document.getElementById('nodejs-version').textContent = versions.nodejs.version;
    }
    if (versions && versions['arduino-cli']) {
      const node = document.getElementById('arduino-cli-version');
      if (node) node.textContent = versions['arduino-cli'].version;
    }
    if (versions && versions.esptool) {
      const node = document.getElementById('esptool-version');
      if (node) node.textContent = versions.esptool.version;
    }
    if (versions && versions.git) {
      document.getElementById('git-version').textContent = versions.git.version;
    }
    if (versions && versions['llama-cpp']) {
      document.getElementById('llama-cpp-version').textContent = versions['llama-cpp'].version;
    }
  } catch (err) {
    console.error('Error loading versions:', err);
  }
}

// Check for updates for a specific binary
async function checkForUpdates(binaryType) {
  try {
    const result = await window.electronAPI.checkForBinaryUpdates(binaryType);
    
    if (result.success) {
      const currentEl = document.getElementById(`${binaryType}-version`);
      const updateNotice = document.getElementById(`${binaryType}-update-notice`);
      const latestEl = document.getElementById(`${binaryType}-latest-version`);
      
      currentEl.textContent = result.current;
      
      if (result.updateAvailable) {
        latestEl.textContent = result.latest;
        updateNotice.style.display = 'block';
      } else {
        updateNotice.style.display = 'none';
        alert(`✅ ${binaryType} is up to date!\n\nCurrent: ${result.current}\nLatest: ${result.latest}`);
      }
    } else {
      alert(`❌ Failed to check for updates:\n${result.message}`);
    }
  } catch (err) {
    alert(`❌ Error checking for updates:\n${err.message}`);
  }
}

// Update binary version
async function updateBinaryVersionConfig(binaryType) {
  const latestVersion = document.getElementById(`${binaryType}-latest-version`).textContent;
  
  if (!confirm(`Update ${binaryType} to ${latestVersion}?\n\nThis will update the configuration. You'll need to re-download binaries after updating.`)) {
    return;
  }
  
  try {
    const result = await window.electronAPI.updateBinaryVersion(binaryType, latestVersion);
    
    if (result.success) {
      document.getElementById(`${binaryType}-version`).textContent = latestVersion;
      document.getElementById(`${binaryType}-update-notice`).style.display = 'none';
      alert(`✅ ${result.message}\n\nPlease re-download ${binaryType} binaries to get the new version.`);
    } else {
      alert(`❌ Update failed:\n${result.message}`);
    }
  } catch (err) {
    alert(`❌ Error updating version:\n${err.message}`);
  }
}

// Auto-load versions when Binary Manager screen is shown
const binaryManagerObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    const target = mutation.target;
    if (target.id === 'binary-manager' && target.classList.contains('active')) {
      loadBinaryVersions();
      checkOllamaStatus(); // Auto-check service status
    }
  });
});

// ============================================================================
// GPU DETECTION - Update Footer Badge
// ============================================================================

async function updateGPUIndicator() {
  try {
    const gpuInfo = await window.electronAPI.getGPUInfo();
    
    if (gpuInfo && gpuInfo.detected) {
      // Parse display text to extract icon and text
      const parts = gpuInfo.displayText.split(' ');
      const icon = parts[0]; // First part is emoji
      const text = parts.slice(1).join(' '); // Rest is text
      
      // Update badge
      document.getElementById('gpu-icon').textContent = icon;
      document.getElementById('gpu-text').textContent = text;
      
      console.log('[GPU Indicator] Updated:', gpuInfo.displayText);
    } else {
      // Detection failed
      document.getElementById('gpu-icon').textContent = '❌';
      document.getElementById('gpu-text').textContent = 'Detection Failed';
    }
  } catch (err) {
    console.error('[GPU Indicator] Failed to update:', err);
    document.getElementById('gpu-icon').textContent = '❌';
    document.getElementById('gpu-text').textContent = 'Error';
  }
}

// Start observing when page loads
document.addEventListener('DOMContentLoaded', () => {
  // Update GPU indicator on page load
  updateGPUIndicator();
  
  // Existing binary manager observer
  const binaryManager = document.getElementById('binary-manager');
  if (binaryManager) {
    binaryManagerObserver.observe(binaryManager, { 
      attributes: true, 
      attributeFilter: ['class'] 
    });
  }
});

// Listen for binary download progress

// ============================================================================
