/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// PYTHON WEBUI BUILD MANAGEMENT
// ============================================================================

// Track build progress
let buildStartTime = 0;
let currentPhase = 'starting';

// Phase progress ranges (percentage)
const PHASE_RANGES = {
  'starting': { min: 0, max: 5 },
  'creating-venv': { min: 5, max: 15 },
  'upgrading-pip': { min: 15, max: 20 },
  'installing-uv': { min: 20, max: 25 },
  'installing-openwebui': { min: 25, max: 90 },
  'post-install': { min: 90, max: 95 },
  'creating-launcher': { min: 95, max: 98 },
  'complete': { min: 100, max: 100 }
};

// Detect phase from build output line
function detectPhase(line) {
  const lowerLine = line.toLowerCase();
  
  if (line.includes('Creating bundle directory') || line.includes('Target platform')) return 'starting';
  if (line.includes('Creating virtual environment')) return 'creating-venv';
  if (line.includes('Upgrading pip')) return 'upgrading-pip';
  if (line.includes('Installing uv') || lowerLine.includes('pip install uv')) return 'installing-uv';
  if (line.includes('Installing Open WebUI') || lowerLine.includes('uv pip install')) return 'installing-openwebui';
  if (line.includes('Installing voice runtime dependencies') || lowerLine.includes('transformers') || lowerLine.includes('torch')) return 'installing-openwebui';
  if (line.includes('Open WebUI') && line.includes('installed')) return 'post-install';
  if (line.includes('Making venv relocatable')) return 'post-install';
  if (line.includes('Creating launcher script')) return 'creating-launcher';
  if (line.includes('Build Complete')) return 'complete';
  
  return null;
}

// Estimate progress within the installing-openwebui phase based on output
function estimateInstallProgress(line, currentProgress) {
  const lowerLine = line.toLowerCase();
  const range = PHASE_RANGES['installing-openwebui'];
  
  // uv output patterns
  if (lowerLine.includes('resolved') && lowerLine.includes('packages')) {
    return range.min + (range.max - range.min) * 0.1; // 10% into install
  }
  if (lowerLine.includes('prepared') && lowerLine.includes('packages')) {
    return range.min + (range.max - range.min) * 0.3; // 30% into install
  }
  if (lowerLine.includes('installed') && lowerLine.includes('packages')) {
    return range.min + (range.max - range.min) * 0.95; // 95% into install
  }
  
  // pip output patterns (fallback)
  if (lowerLine.includes('collecting')) {
    return Math.min(currentProgress + 0.3, range.min + (range.max - range.min) * 0.4);
  }
  if (lowerLine.includes('downloading')) {
    return Math.min(currentProgress + 0.5, range.min + (range.max - range.min) * 0.7);
  }
  if (lowerLine.includes('installing collected packages')) {
    return range.min + (range.max - range.min) * 0.85;
  }
  if (lowerLine.includes('successfully installed')) {
    return range.min + (range.max - range.min) * 0.95;
  }
  
  return currentProgress;
}

// Get progress percentage based on phase
function getPhaseProgress(phase) {
  const range = PHASE_RANGES[phase] || PHASE_RANGES['starting'];
  return range.min;
}

async function checkPythonWebUI() {
  const statusDiv = document.getElementById('python-webui-status');
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<p style="color: #aaa;">⏳ Checking...</p>';
  
  try {
    const result = await window.electronAPI.checkPythonWebUI();
    
    if (result.success) {
      const msg = String(result.message || '');
      const hasOptionalWarning = /optional packages not installed/i.test(msg);
      const color = hasOptionalWarning ? '#f59e0b' : '#4ade80';
      statusDiv.innerHTML = `<p style="color: ${color};">${result.message}</p>`;
    } else {
      statusDiv.innerHTML = `<p style="color: #ff6b6b;">${result.message}</p>`;
    }
  } catch (err) {
    statusDiv.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message}</p>`;
  }
}

async function buildPythonWebUI() {
  // Reset state
  buildStartTime = Date.now();
  currentPhase = 'starting';
  let currentProgress = 0;
  
  const statusDiv = document.getElementById('python-webui-status');
  statusDiv.style.display = 'block';
  
  // Create progress UI with bar AND output log
  statusDiv.innerHTML = `
    <div style="margin-bottom: 15px;">
      <p style="color: var(--psf-accent, #00d4ff); margin-bottom: 10px;">🔨 Building Python WebUI environment...</p>
      
      <!-- Progress Bar -->
      <div style="background: rgba(0,0,0,0.5); border-radius: 5px; padding: 3px; margin-bottom: 8px;">
        <div id="webui-progress-bar" style="height: 20px; background: linear-gradient(90deg, var(--psf-success, #4ecdc4), var(--psf-accent, #00d4ff)); border-radius: 3px; width: 0%; transition: width 0.3s ease;"></div>
      </div>
      
      <!-- Progress Info -->
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #aaa; margin-bottom: 10px;">
        <span id="webui-progress-text">0%</span>
        <span id="webui-progress-status">Starting...</span>
        <span id="webui-elapsed-time">0:00</span>
      </div>
    </div>
    
    <!-- Build Output Log -->
    <details open style="margin-top: 10px;">
      <summary style="cursor: pointer; color: #888; font-size: 12px;">Build log</summary>
      <pre id="build-output" style="margin-top: 10px; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 5px; font-size: 10px; white-space: pre-wrap; word-wrap: break-word;"></pre>
    </details>
  `;
  
  const progressBar = document.getElementById('webui-progress-bar');
  const progressText = document.getElementById('webui-progress-text');
  const progressStatus = document.getElementById('webui-progress-status');
  const elapsedTime = document.getElementById('webui-elapsed-time');
  const buildOutput = document.getElementById('build-output');
  
  // Update elapsed time every second
  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - buildStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    elapsedTime.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }, 1000);
  
  // Listen for build output
  window.electronAPI.onPythonWebUIBuildOutput((line) => {
    // Add to log
    buildOutput.textContent += line;
    buildOutput.scrollTop = buildOutput.scrollHeight;
    
    // Detect phase change
    const detectedPhase = detectPhase(line);
    if (detectedPhase && detectedPhase !== currentPhase) {
      currentPhase = detectedPhase;
      currentProgress = getPhaseProgress(currentPhase);
    }
    
    // Estimate progress within install phase
    if (currentPhase === 'installing-openwebui') {
      currentProgress = estimateInstallProgress(line, currentProgress);
    }
    
    // Update progress bar
    progressBar.style.width = `${Math.round(currentProgress)}%`;
    progressText.textContent = `${Math.round(currentProgress)}%`;
    
    // Update status text based on what's happening
    if (line.includes('Creating bundle directory')) {
      progressStatus.textContent = 'Creating directories...';
    } else if (line.includes('Creating virtual environment')) {
      progressStatus.textContent = 'Creating Python venv...';
    } else if (line.includes('Upgrading pip')) {
      progressStatus.textContent = 'Upgrading pip...';
    } else if (line.includes('Installing uv')) {
      progressStatus.textContent = 'Installing uv (fast installer)...';
    } else if (line.includes('Installing Open WebUI')) {
      progressStatus.textContent = 'Installing Open WebUI...';
    } else if (line.includes('Installing voice runtime dependencies')) {
      progressStatus.textContent = 'Installing voice runtime packages...';
    } else if (line.toLowerCase().includes('resolved') && line.toLowerCase().includes('packages')) {
      progressStatus.textContent = 'Resolving dependencies...';
    } else if (line.toLowerCase().includes('prepared') && line.toLowerCase().includes('packages')) {
      progressStatus.textContent = 'Downloading packages...';
    } else if (line.toLowerCase().includes('collecting')) {
      const match = line.match(/Collecting\s+(\S+)/i);
      if (match) {
        progressStatus.textContent = `Collecting: ${match[1].substring(0, 30)}`;
      }
    } else if (line.toLowerCase().includes('downloading')) {
      const match = line.match(/Downloading\s+(\S+)/i);
      if (match) {
        const pkg = match[1].split('/').pop().split('-')[0];
        progressStatus.textContent = `Downloading: ${pkg.substring(0, 30)}`;
      }
    } else if (line.toLowerCase().includes('installing collected packages')) {
      progressStatus.textContent = 'Installing packages...';
    } else if (line.includes('Making venv relocatable')) {
      progressStatus.textContent = 'Making portable...';
    } else if (line.includes('Creating launcher script')) {
      progressStatus.textContent = 'Creating launcher...';
    } else if (line.includes('Build Complete')) {
      progressStatus.textContent = 'Complete!';
    }
  });
  
  try {
    const result = await window.electronAPI.buildPythonWebUI();
    
    clearInterval(timerInterval);
    
    if (result.success) {
      // Ensure progress shows 100%
      progressBar.style.width = '100%';
      progressText.textContent = '100%';
      progressStatus.textContent = 'Build complete!';
      progressBar.style.background = 'linear-gradient(90deg, #4ade80, #22c55e)';
      
      // Show elapsed time
      const elapsed = Math.floor((Date.now() - buildStartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      
      setTimeout(() => {
        statusDiv.innerHTML = `<p style="color: #4ade80;">✅ ${result.message} (${mins}:${secs.toString().padStart(2, '0')})</p>`;
      }, 1500);
      
      alert('✅ Python WebUI built successfully!');
    } else {
      progressBar.style.background = '#ff6b6b';
      progressStatus.textContent = 'Build failed!';
      
      // Show error with full log visible
      statusDiv.innerHTML = `
        <p style="color: #ff6b6b;">${result.message}</p>
        <pre style="margin-top: 10px; max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 5px; font-size: 10px; white-space: pre-wrap;">${result.output || ''}</pre>
      `;
      alert(`❌ Build failed:\n${result.message}`);
    }
  } catch (err) {
    clearInterval(timerInterval);
    progressBar.style.background = '#ff6b6b';
    progressStatus.textContent = 'Error!';
    statusDiv.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message}</p>`;
    alert(`❌ Build error:\n${err.message}`);
  }
}

function getVoiceRuntimeStatusElement(profile) {
  const key = String(profile || 'base').trim().toLowerCase() === 'chatterbox' ? 'chatterbox' : 'base';
  return document.getElementById(`voice-runtime-${key}-status`);
}

async function checkVoiceRuntime(profile = 'base') {
  const statusDiv = getVoiceRuntimeStatusElement(profile);
  if (!statusDiv) return;
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<p style="color: #aaa;">⏳ Checking...</p>';
  try {
    const result = await window.electronAPI.checkVoiceRuntime({ profile });
    if (result?.success) {
      const color = result.ready ? '#4ade80' : '#f59e0b';
      const details = [
        `Profile: ${String(result.profile || profile)}`,
        result.runtimeDir ? `Path: ${result.runtimeDir}` : '',
        result.pythonBin ? `Python: ${result.pythonBin}` : '',
        String(result.message || ''),
        `Debug: ${JSON.stringify(result)}`,
      ].filter(Boolean).join('\n');
      statusDiv.innerHTML = `<p style="color: ${color}; white-space: pre-wrap;">${details}</p>`;
    } else {
      statusDiv.innerHTML = `<p style="color: #ff6b6b; white-space: pre-wrap;">${result?.message || 'Check failed.'}</p>`;
    }
  } catch (err) {
    statusDiv.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message || String(err)}</p>`;
  }
}

async function installVoiceRuntime(profile = 'base') {
  const statusDiv = getVoiceRuntimeStatusElement(profile);
  if (!statusDiv) return;
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<p style="color: #ffd400;">⏳ Installing / repairing runtime (this can take several minutes)...</p>';
  try {
    const result = await window.electronAPI.installVoiceRuntime({ profile });
    if (result?.success) {
      const details = [
        `Profile: ${String(result.profile || profile)}`,
        result.runtimeDir ? `Path: ${result.runtimeDir}` : '',
        result.pythonBin ? `Python: ${result.pythonBin}` : '',
        String(result.message || ''),
        result.created ? 'Created: yes' : 'Created: no',
        result.repaired ? 'Repaired: yes' : 'Repaired: no',
        `Debug: ${JSON.stringify(result)}`
      ].filter(Boolean).join('\n');
      statusDiv.innerHTML = `<p style="color: #4ade80; white-space: pre-wrap;">${details}</p>`;
      await checkVoiceRuntime(profile);
    } else {
      statusDiv.innerHTML = `<p style="color: #ff6b6b; white-space: pre-wrap;">${result?.message || 'Install failed.'}</p>`;
    }
  } catch (err) {
    statusDiv.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message || String(err)}</p>`;
  }
}

async function deleteVoiceRuntime(profile = 'base') {
  const statusDiv = getVoiceRuntimeStatusElement(profile);
  if (!statusDiv) return;
  statusDiv.style.display = 'block';
  statusDiv.innerHTML = '<p style="color: #aaa;">⏳ Deleting runtime...</p>';
  try {
    const result = await window.electronAPI.deleteVoiceRuntime({ profile });
    if (result?.success) {
      statusDiv.innerHTML = `<p style="color: #4ade80;">${result.message || 'Deleted.'}</p>`;
      await checkVoiceRuntime(profile);
    } else {
      statusDiv.innerHTML = `<p style="color: #ff6b6b;">${result?.message || 'Delete failed.'}</p>`;
    }
  } catch (err) {
    statusDiv.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message || String(err)}</p>`;
  }
}

// Delete binary
async function deleteBinary(type) {
  // Use Electron's dialog API instead of confirm() to avoid GLib-GObject signal handler errors on Linux
  const confirmed = await window.electronAPI.showConfirmDialog({
    type: 'question',
    title: 'Delete Binaries',
    message: `Delete ${type} binaries?`,
    detail: 'This will remove all downloaded/built files. You can re-download/rebuild later.'
  });
  
  if (!confirmed) {
    return;
  }
  
  const statusDiv = document.getElementById(`${type}-status`) || document.getElementById('python-webui-status');
  if (statusDiv) {
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '<p style="color: #aaa;">⏳ Deleting...</p>';
  }
  
  try {
    const result = await window.electronAPI.deleteBinaries(type);
    
    if (statusDiv) {
      if (result.success) {
        statusDiv.innerHTML = `<p style="color: #4ade80;">${result.message}</p>`;
        
        // Clear update notices if exists
        const updateNotice = document.getElementById(`${type}-update-notice`);
        if (updateNotice) updateNotice.style.display = 'none';
        
        setTimeout(() => {
          if (statusDiv) statusDiv.style.display = 'none';
        }, 3000);
      } else {
        statusDiv.innerHTML = `<p style="color: #ff6b6b;">${result.message}</p>`;
      }
    }
  } catch (err) {
    if (statusDiv) {
      statusDiv.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message}</p>`;
    }
  }
}

// Kill all running Ollama services
async function killOllamaService() {
  if (!confirm('This will stop ALL running Ollama services (system and bundled).\n\nContinue?')) {
    return;
  }
  
  const statusDiv = document.getElementById('ollama-status');
  if (statusDiv) {
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '<p style="color: #aaa;">⏳ Stopping Ollama services...</p>';
  }
  
  try {
    const result = await window.electronAPI.killOllamaService();
    
    if (statusDiv) {
      if (result.success) {
        statusDiv.innerHTML = `<p style="color: #4ade80;">✅ ${result.message}</p>`;
        
        // Auto-refresh status after killing
        setTimeout(() => {
          checkOllamaStatus();
          statusDiv.style.display = 'none';
        }, 2000);
      } else {
        statusDiv.innerHTML = `<p style="color: #ff6b6b;">❌ ${result.message}</p>`;
      }
    }
  } catch (err) {
    if (statusDiv) {
      statusDiv.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message}</p>`;
    }
  }
}

// Check Ollama service status
async function checkOllamaStatus() {
  const serviceStatusDiv = document.getElementById('ollama-service-status');
  if (!serviceStatusDiv) return;
  
  serviceStatusDiv.style.display = 'block';
  serviceStatusDiv.innerHTML = '<p style="color: #aaa; margin: 0;">⏳ Checking PSF Ollama...</p>';
  
  try {
    const result = await window.electronAPI.checkOllamaStatus();
    
    let html = '<div style="display: flex; flex-direction: column; gap: 6px;">';
    
    if (result.bundled.running) {
      html += `<div style="color: #4ade80;">✅ PSF Ollama: <strong>Running</strong> (port ${result.bundled.port})</div>`;
    } else {
      html += `<div style="color: #666;">⭕ PSF Ollama: <strong>Not running</strong> (port ${result.bundled.port})</div>`;
    }
    
    html += '</div>';
    serviceStatusDiv.innerHTML = html;
    
  } catch (err) {
    serviceStatusDiv.innerHTML = `<p style="color: #ff6b6b; margin: 0;">❌ Error: ${err.message}</p>`;
  }
}

// ============================================================================
