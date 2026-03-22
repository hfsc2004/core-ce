/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// BINARY MANAGER FUNCTIONS
// ============================================================================

async function checkBinary(type) {
  try {
    const result = await window.electronAPI.checkBinaries(type);
    const statusDiv = document.getElementById(`${type}-status`);
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = result.message;
  } catch (err) {
    console.error('Check binary error:', err);
    alert('Error checking binaries: ' + err.message);
  }
}

async function downloadBinary(type) {
  const progressDiv = document.getElementById('download-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const currentFile = document.getElementById('current-file');
  const filesCompleted = document.getElementById('files-completed');
  const downloadSpeed = document.getElementById('download-speed');
  const statusDiv = document.getElementById(`${type}-status`);
  
  // Show progress UI
  progressDiv.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '0%';
  currentFile.textContent = 'Starting download...';
  filesCompleted.textContent = 'Files: 0/0';
  downloadSpeed.textContent = '0 KB/s';
  
  // Hide status initially
  statusDiv.style.display = 'none';
  
  // Scroll to progress
  progressDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  
  try {
    const result = await window.electronAPI.downloadBinaries(type);
    const success = !!result?.success;
    const message = String(result?.message || (success ? 'Operation completed.' : 'Operation failed with no message.'));

    statusDiv.style.display = 'block';
    statusDiv.innerHTML = success
      ? `<span style="color:#00ff88;">✅ ${message}</span>`
      : `<span style="color:#ff6b6b;">❌ ${message}</span>`;

    if (success) {
      progressText.textContent = '100%';
      progressBar.style.width = '100%';
      progressBar.style.background = '#00d4ff';
      currentFile.textContent = 'Completed';
      setTimeout(() => {
        progressDiv.style.display = 'none';
      }, 3000);
    } else {
      progressText.textContent = 'Failed';
      progressBar.style.background = '#ff6b6b';
      currentFile.textContent = 'Failed';
      filesCompleted.textContent = 'Files: failed';
      downloadSpeed.textContent = '-';
    }
  } catch (err) {
    console.error('Download binary error:', err);
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = `<span style="color: #ff6b6b;">❌ Error: ${err.message}</span>`;
    progressText.textContent = 'Failed';
    progressBar.style.background = '#ff6b6b';
    currentFile.textContent = 'Failed';
    filesCompleted.textContent = 'Files: failed';
    downloadSpeed.textContent = '-';
  }
}

async function downloadAllBinaries() {
  const progressDiv = document.getElementById('download-progress');
  progressDiv.style.display = 'block';
  
  try {
    await window.electronAPI.downloadBinaries('anythingllm');
    
    setTimeout(() => {
      progressDiv.style.display = 'none';
    }, 3000);
  } catch (err) {
    console.error('Download all error:', err);
    alert('Error downloading binaries: ' + err.message);
  }
}

async function checkAllBinaries() {
  await checkBinary('anythingllm');
}

function formatPreflightReasons(reasons = []) {
  const unique = Array.from(new Set((Array.isArray(reasons) ? reasons : []).filter(Boolean)));
  if (unique.length === 0) return 'none';
  return unique.map((r) => `- ${r}`).join('\n');
}

async function checkLlamaCppBuild() {
  const statusDiv = document.getElementById('llama-cpp-status');
  if (!statusDiv) return;
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<span style="color:#aaa;">⏳ Running llama.cpp build preflight...</span>';

  try {
    const result = await window.electronAPI.checkLlamaCppBuild();
    if (!result?.success) {
      statusDiv.innerHTML = `<span style="color:#ff6b6b;">❌ ${result?.message || 'Preflight failed'}</span>`;
      return;
    }

    const selected = result.selected || {};
    const toolchain = result.toolchain || {};
    const backends = result.backends || {};
    const sourceState = result.sourcePresent
      ? 'present'
      : `missing (auto-clone will require git)`;
    const selectedBadge = selected.ok ? '✅ PASS' : '❌ FAIL';
    const selectedColor = selected.ok ? '#00ff88' : '#ff6b6b';

    statusDiv.innerHTML = `
      <div style="color:${selectedColor}; font-weight:700; margin-bottom:8px;">${selectedBadge} Selected Profile: ${selected.label || 'CPU-only'}</div>
      <div style="color:#ccc; margin-bottom:6px;">Platform: ${result.platformKey || 'unknown'} | Source: ${sourceState}</div>
      <div style="color:${toolchain.ok ? '#00ff88' : '#ff6b6b'}; margin-bottom:6px;">
        Toolchain: ${toolchain.ok ? 'PASS' : 'FAIL'}
      </div>
      <div style="color:#bbb; margin-bottom:8px;">Toolchain details:\n${formatPreflightReasons(toolchain.reasons)}</div>
      <div style="color:#00d4ff; margin-bottom:4px;">CUDA: ${backends?.cuda?.ok ? 'PASS' : (backends?.cuda?.detected ? 'DETECTED (not build-ready)' : 'NOT DETECTED')}</div>
      <div style="color:#ffb74d; margin-bottom:4px;">ROCm: ${backends?.rocm?.detected ? 'DETECTED (stubbed)' : 'NOT DETECTED'}</div>
      <div style="color:#ffb74d; margin-bottom:8px;">Vulkan: ${backends?.vulkan?.detected ? 'DETECTED (stubbed)' : 'NOT DETECTED'}</div>
      <div style="color:#ffb74d; margin-bottom:8px;">NPU: ${backends?.npu?.detected ? 'DETECTED (stubbed)' : 'NOT DETECTED'}</div>
      <div style="color:#bbb;">Selected profile checks:\n${formatPreflightReasons(selected.reasons)}</div>
    `;
  } catch (err) {
    statusDiv.innerHTML = `<span style="color:#ff6b6b;">❌ Error: ${err.message}</span>`;
  }
}

// Listen for download progress events
function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond < 1024) return bytesPerSecond.toFixed(0) + ' B/s';
  if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s';
  return (bytesPerSecond / (1024 * 1024)).toFixed(1) + ' MB/s';
}

// ============================================================================
