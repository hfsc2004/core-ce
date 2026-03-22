/**
 * Settings Modal - System tab and GPU monitor controls
 * Extracted from settings-modal.js to reduce monolith size.
 *
 * @version 1.1.2 - March 5, 2026
 */

/**
 * Load system information
 */
async function loadAboutInfo() {
  const versionEl = document.getElementById('settings-about-version');
  const copyrightYearEl = document.getElementById('settings-about-copyright-year');
  const productEl = document.getElementById('settings-about-product-name');
  const companyNameEl = document.getElementById('settings-about-company-name');
  const companyLinkEl = document.getElementById('settings-about-company-link');
  const websiteBtn = document.getElementById('settings-about-website-link');
  const securityTagEl = document.getElementById('settings-about-security-tag');
  const proofTagEl = document.getElementById('settings-about-proof-tag');
  if (!versionEl) return;

  try {
    if (!window.electronAPI?.getCurrentVersion) {
      versionEl.textContent = 'Version unavailable';
      return;
    }
    const result = await window.electronAPI.getCurrentVersion();
    const version = (result?.success && result?.version)
      ? String(result.version)
      : 'Unknown';
    versionEl.textContent = `Version ${version}`;

    if (window.electronAPI?.getVersionStatus && copyrightYearEl) {
      const status = await window.electronAPI.getVersionStatus();
      const year = Number(status?.copyrightYear);
      if (Number.isInteger(year) && year >= 1900 && year <= 3000) {
        copyrightYearEl.textContent = String(year);
      }
      const branding = status?.branding || {};
      const company = String(branding.companyName || '').trim();
      const product = String(branding.productName || '').trim();
      const website = String(branding.website || '').trim();
      const security = String(branding.securityTag || '').trim();
      const proofState = String(branding.complianceProofState || 'UNVERIFIED').trim().toUpperCase();
      const proofSummary = String(branding.complianceProofSummary || '').trim();
      const proofEvidenceId = String(branding.complianceEvidenceId || '').trim();

      if (productEl && product) productEl.textContent = product;
      if (companyNameEl && company) companyNameEl.textContent = company;
      if (companyLinkEl && website) companyLinkEl.setAttribute('href', website);
      if (websiteBtn && website) {
        const safeWebsite = website.replace(/'/g, "\\'");
        websiteBtn.textContent = company || 'Website';
        websiteBtn.setAttribute('onclick', `openExternal('${safeWebsite}')`);
      }
      if (securityTagEl && security) {
        securityTagEl.textContent = security;
        const enforcement = String(branding.securityEnforcement || '').trim();
        if (enforcement) {
          securityTagEl.setAttribute('title', `Enforcement: ${enforcement}`);
        } else {
          securityTagEl.removeAttribute('title');
        }
      }
      if (proofTagEl) {
        proofTagEl.textContent = ` - PROOF:${proofState}`;
        const proofTitleParts = [];
        if (proofEvidenceId) proofTitleParts.push(`Evidence ID: ${proofEvidenceId}`);
        if (proofSummary) proofTitleParts.push(proofSummary);
        if (proofTitleParts.length > 0) {
          proofTagEl.setAttribute('title', proofTitleParts.join('\n'));
        } else {
          proofTagEl.removeAttribute('title');
        }
      }

      if (window.electronAPI?.getSettings && proofTagEl) {
        const settings = await window.electronAPI.getSettings();
        const showAboutProof = settings?.show_about_compliance_proof_badge !== false;
        proofTagEl.style.display = showAboutProof ? '' : 'none';
      }
    }
  } catch (_err) {
    versionEl.textContent = 'Version unavailable';
  }
}

async function loadSystemInfo() {
  try {
    const hardware = await window.electronAPI.detectHardware();
    settingsModalState.hardwareInfo = hardware;

    // Update display
    document.getElementById('settings-ram-info').textContent = `${hardware.ram_gb} GB`;
    document.getElementById('settings-cpu-info').textContent = `${hardware.cpu_count} cores`;

    if (hardware.gpu_detected) {
      document.getElementById('settings-gpu-info').textContent = `${hardware.gpu_vram} GB VRAM`;
    } else {
      document.getElementById('settings-gpu-info').textContent = 'Not detected';
    }

    // Get detailed GPU info
    const gpuInfo = await window.electronAPI.getGPUInfo();
    const detailsDiv = document.getElementById('settings-gpu-details');

    if (gpuInfo && gpuInfo.name) {
      detailsDiv.innerHTML = `
        <div style="color: var(--psf-accent, #00d4ff); font-weight: bold; margin-bottom: 10px;">${gpuInfo.name}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
          <div><span style="color: #888;">VRAM:</span> <span style="color: #fff;">${gpuInfo.vram || 'Unknown'} GB</span></div>
          <div><span style="color: #888;">Acceleration:</span> <span style="color: #00ff88;">${gpuInfo.accelerationType || 'Unknown'}</span></div>
          ${gpuInfo.cudaDeviceIndex !== undefined ? `<div><span style="color: #888;">CUDA Device:</span> <span style="color: #fff;">${gpuInfo.cudaDeviceIndex}</span></div>` : ''}
          ${gpuInfo.uuid ? `<div><span style="color: #888;">UUID:</span> <span style="color: #666; font-size: 11px;">${gpuInfo.uuid.substring(0, 20)}...</span></div>` : ''}
        </div>
      `;
    } else {
      detailsDiv.innerHTML = `<div style="color: #888;">No GPU acceleration available. Models will run on CPU.</div>`;
    }

    // Update GPU monitor button state
    updateGpuMonitorButtonState();
    await loadServiceNetworkPolicy();
    await loadRelayIngressBindSettings();
    await loadSessionMemorySettings();
    await loadAnimationSettings();
    await loadComplianceProofBadgeVisibilitySettings();
    await loadComplianceEvidenceManager();
    await loadSecurityStatusInfo();
  } catch (err) {
    console.error('[Settings Modal] Error loading system info:', err);
    document.getElementById('settings-gpu-details').innerHTML =
      `<div style="color: #ff6b6b;">Error loading system information</div>`;
  }
}

function applyAnimationPreference(enabled) {
  const on = enabled !== false;
  document.body.classList.toggle('animations-disabled', !on);
}

async function loadSessionMemorySettings() {
  const checkbox = document.getElementById('settings-session-memory-enabled');
  const status = document.getElementById('settings-session-memory-status');
  if (!checkbox) return;
  try {
    const settings = await window.electronAPI.getSettings();
    checkbox.checked = settings?.session_memory_enabled !== false;
    if (status) {
      status.textContent = checkbox.checked ? 'Enabled' : 'Disabled';
      status.style.color = checkbox.checked ? '#00ff88' : '#ffd400';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Load failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

async function saveSessionMemorySettings() {
  const checkbox = document.getElementById('settings-session-memory-enabled');
  const status = document.getElementById('settings-session-memory-status');
  if (!checkbox) return;
  try {
    const settings = await window.electronAPI.getSettings();
    const next = { ...(settings || {}), session_memory_enabled: !!checkbox.checked };
    const result = await window.electronAPI.saveSettings(next);
    if (!result?.success) {
      if (status) {
        status.textContent = `Save failed: ${result?.error || 'Unknown error'}`;
        status.style.color = '#ff6b6b';
      }
      return;
    }
    if (status) {
      status.textContent = checkbox.checked ? 'Saved: enabled' : 'Saved: disabled';
      status.style.color = '#00ff88';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Save failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

async function loadAnimationSettings() {
  const checkbox = document.getElementById('settings-animations-enabled');
  const status = document.getElementById('settings-animations-status');
  if (!checkbox) return;
  try {
    const settings = await window.electronAPI.getSettings();
    const enabled = settings?.animations_enabled !== false;
    checkbox.checked = enabled;
    applyAnimationPreference(enabled);
    if (status) {
      status.textContent = enabled ? 'Enabled' : 'Disabled';
      status.style.color = enabled ? '#00ff88' : '#ffd400';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Load failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

async function saveAnimationSettings() {
  const checkbox = document.getElementById('settings-animations-enabled');
  const status = document.getElementById('settings-animations-status');
  if (!checkbox) return;
  try {
    const settings = await window.electronAPI.getSettings();
    const next = { ...(settings || {}), animations_enabled: !!checkbox.checked };
    const result = await window.electronAPI.saveSettings(next);
    if (!result?.success) {
      if (status) {
        status.textContent = `Save failed: ${result?.error || 'Unknown error'}`;
        status.style.color = '#ff6b6b';
      }
      return;
    }
    applyAnimationPreference(checkbox.checked);
    if (status) {
      status.textContent = checkbox.checked ? 'Saved: enabled' : 'Saved: disabled';
      status.style.color = '#00ff88';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Save failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

async function clearSessionMemoryHistory() {
  const status = document.getElementById('settings-session-memory-status');
  if (!window.electronAPI?.sessionMemoryClear) return;
  const confirmed = window.confirm('Clear all terminal session memory history? This cannot be undone.');
  if (!confirmed) return;
  try {
    const result = await window.electronAPI.sessionMemoryClear({});
    if (status) {
      const removed = Number(result?.removed) || 0;
      status.textContent = `Cleared ${removed} entr${removed === 1 ? 'y' : 'ies'}`;
      status.style.color = '#00ff88';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Clear failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

async function loadServiceNetworkPolicy() {
  const select = document.getElementById('settings-network-policy');
  const status = document.getElementById('settings-network-policy-status');
  if (!select) return;
  try {
    const settings = await window.electronAPI.getSettings();
    const raw = String(settings?.service_network_policy || 'privacy').trim().toLowerCase();
    const mode = (raw === 'allow' || raw === 'strict-offline') ? raw : 'privacy';
    select.value = mode;
    if (status) {
      status.textContent = `Current: ${mode}`;
      status.style.color = '#888';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Load failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

async function saveServiceNetworkPolicy() {
  const select = document.getElementById('settings-network-policy');
  const status = document.getElementById('settings-network-policy-status');
  if (!select) return;

  const raw = String(select.value || 'privacy').trim().toLowerCase();
  const mode = (raw === 'allow' || raw === 'strict-offline') ? raw : 'privacy';

  try {
    const settings = await window.electronAPI.getSettings();
    const next = { ...(settings || {}), service_network_policy: mode };
    const result = await window.electronAPI.saveSettings(next);
    if (!result?.success) {
      if (status) {
        status.textContent = `Save failed: ${result?.error || 'Unknown error'}`;
        status.style.color = '#ff6b6b';
      }
      return;
    }
    if (status) {
      status.textContent = `Saved: ${mode}`;
      status.style.color = '#00ff88';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Save failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

async function loadRelayIngressBindSettings() {
  const select = document.getElementById('settings-relay-ingress-bind');
  const status = document.getElementById('settings-relay-ingress-bind-status');
  if (!select) return;
  try {
    const settings = await window.electronAPI.getSettings();
    const raw = String(settings?.relay_ingress_bind || 'localhost').trim().toLowerCase();
    const mode = raw === 'lan' ? 'lan' : 'localhost';
    select.value = mode;
    if (status) {
      status.textContent = `Current: ${mode}`;
      status.style.color = '#888';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Load failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

async function saveRelayIngressBindSettings() {
  const select = document.getElementById('settings-relay-ingress-bind');
  const status = document.getElementById('settings-relay-ingress-bind-status');
  if (!select) return;
  const raw = String(select.value || 'localhost').trim().toLowerCase();
  const mode = raw === 'lan' ? 'lan' : 'localhost';
  try {
    const settings = await window.electronAPI.getSettings();
    const next = { ...(settings || {}), relay_ingress_bind: mode };
    const result = await window.electronAPI.saveSettings(next);
    if (!result?.success) {
      if (status) {
        status.textContent = `Save failed: ${result?.error || 'Unknown error'}`;
        status.style.color = '#ff6b6b';
      }
      return;
    }
    if (status) {
      status.textContent = `Saved: ${mode} (redeploy Relay to apply)`;
      status.style.color = '#00ff88';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Save failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

/**
 * Refresh system information
 */
function refreshSystemInfo() {
  settingsModalState.hardwareInfo = null;
  document.getElementById('settings-ram-info').textContent = '--';
  document.getElementById('settings-cpu-info').textContent = '--';
  document.getElementById('settings-gpu-info').textContent = '--';
  document.getElementById('settings-gpu-details').innerHTML =
    '<div style="color: #888; font-size: 12px;">Loading GPU details...</div>';
  loadSystemInfo();
}

/**
 * Toggle GPU monitor on/off
 */
async function toggleGpuMonitor() {
  const btn = document.getElementById('gpu-monitor-toggle-btn');
  const status = document.getElementById('gpu-monitor-status');

  try {
    const isRunning = await window.electronAPI.isGpuMonitorRunning();

    if (isRunning) {
      // Stop the monitor
      const result = await window.electronAPI.stopGpuMonitor();
      await window.electronAPI.setGpuMonitorEnabled(false);

      if (result.success) {
        btn.textContent = '📊 Live Monitor';
        btn.style.background = '';
        status.textContent = 'Disabled';
        status.style.color = '#888';

        // Hide the widget
        if (typeof hideGpuMonitorWidget === 'function') {
          hideGpuMonitorWidget();
        }
      } else {
        status.textContent = result.message;
        status.style.color = '#ff6b6b';
      }
    } else {
      // Start the monitor
      const result = await window.electronAPI.startGpuMonitor();

      if (result.success) {
        await window.electronAPI.setGpuMonitorEnabled(true);
        btn.textContent = '⏹️ Stop Monitor';
        btn.style.background = 'rgba(0, 255, 136, 0.2)';
        status.textContent = 'Running';
        status.style.color = '#00ff88';

        // Show the widget
        if (typeof showGpuMonitorWidget === 'function') {
          showGpuMonitorWidget();
        }
      } else {
        status.textContent = result.message;
        status.style.color = '#ff6b6b';
      }
    }
  } catch (err) {
    console.error('[Settings Modal] GPU monitor toggle error:', err);
    status.textContent = 'Error: ' + err.message;
    status.style.color = '#ff6b6b';
  }
}

/**
 * Update GPU monitor button state based on current status
 */
async function updateGpuMonitorButtonState() {
  const btn = document.getElementById('gpu-monitor-toggle-btn');
  const status = document.getElementById('gpu-monitor-status');

  if (!btn || !status) return;

  try {
    const isRunning = await window.electronAPI.isGpuMonitorRunning();

    if (isRunning) {
      btn.textContent = '⏹️ Stop Monitor';
      btn.style.background = 'rgba(0, 255, 136, 0.2)';
      status.textContent = 'Running';
      status.style.color = '#00ff88';
    } else {
      btn.textContent = '📊 Live Monitor';
      btn.style.background = '';
      status.textContent = '';
    }
  } catch (err) {
    console.warn('[Settings Modal] Could not check GPU monitor state:', err.message);
  }
}

async function loadSecurityStatusInfo() {
  const editionEl = document.getElementById('settings-security-edition');
  const modelEl = document.getElementById('settings-security-model');
  const modeEl = document.getElementById('settings-security-mode');
  const clusterEl = document.getElementById('settings-security-cluster');

  if (!editionEl || !modelEl || !modeEl || !clusterEl) return;

  try {
    const info = await window.electronAPI.getSecurityStatus();
    if (!info || !info.success) {
      const err = (info && info.error) ? info.error : 'Unknown';
      editionEl.textContent = 'Unavailable';
      modelEl.textContent = 'Unavailable';
      modeEl.textContent = 'Unavailable';
      clusterEl.textContent = 'Blocked (' + err + ')';
      clusterEl.style.color = '#ff6b6b';
      return;
    }

    editionEl.textContent = String(info.edition || 'unknown');
    modelEl.textContent = String(info.securityModel || 'unknown');
    modeEl.textContent = String(info.securityMode || 'unknown');
    clusterEl.textContent = info.clusterJoinAllowed ? 'Allowed' : 'Blocked';
    clusterEl.style.color = info.clusterJoinAllowed ? '#00ff88' : '#ff6b6b';
  } catch (err) {
    editionEl.textContent = 'Unavailable';
    modelEl.textContent = 'Unavailable';
    modeEl.textContent = 'Unavailable';
    clusterEl.textContent = 'Blocked (' + (err && err.message ? err.message : String(err)) + ')';
    clusterEl.style.color = '#ff6b6b';
  }
}
