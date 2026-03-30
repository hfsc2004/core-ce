/**
 * Settings Modal - Mods tab behavior
 *
 * @version 1.1.3 - March 5, 2026
 */

function setModsStatus(message, isError = false) {
  const el = document.getElementById('settings-mods-status');
  if (!el) return;
  el.style.color = isError ? '#ff8a80' : '#9ccc65';
  el.textContent = String(message || '');
}

function renderModsList(mods = []) {
  const container = document.getElementById('settings-mods-list');
  if (!container) return;

  if (!Array.isArray(mods) || mods.length === 0) {
    container.innerHTML = '<div style="color:#888; font-size:12px;">No mods installed.</div>';
    return;
  }

  const rows = mods.map((entry) => {
    const modId = String(entry?.modId || '');
    const version = String(entry?.installedVersion || '');
    const enabled = entry?.enabled === true;
    const quarantined = entry?.quarantined === true;
    const caps = Array.isArray(entry?.manifest?.capabilities) ? entry.manifest.capabilities.join(', ') : '';
    const stateText = quarantined ? 'quarantined' : (enabled ? 'enabled' : 'disabled');
    const stateColor = quarantined ? '#ffab91' : (enabled ? '#a5d6a7' : '#b0bec5');
    return `
      <div style="padding:8px; border-bottom:1px solid #2a2a2a;">
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <strong style="color:#ddd;">${modId}</strong>
          <span style="color:${stateColor}; font-size:12px;">${stateText}</span>
        </div>
        <div style="color:#999; font-size:12px;">version: ${version || 'n/a'}</div>
        <div style="color:#777; font-size:11px; margin-top:3px;">capabilities: ${caps || 'none'}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = rows;
}

function renderTrustedKeys(keys = {}) {
  const container = document.getElementById('settings-mods-trusted-keys');
  if (!container) return;
  const entries = Object.entries(keys || {});
  if (entries.length === 0) {
    container.textContent = 'No trusted signer keys yet.';
    return;
  }
  container.innerHTML = entries.map(([keyId, pem]) => {
    const preview = String(pem || '').split('\n').find((line) => line.includes('BEGIN')) || 'public key loaded';
    return `<div style="padding:4px 0; border-bottom:1px solid #1f1f1f;"><code>${keyId}</code> <span style="color:#777;">(${preview})</span></div>`;
  }).join('');
}

async function loadModsSettings() {
  if (!window.electronAPI?.modsListInstalled) {
    setModsStatus('Mods API unavailable in this build.', true);
    return;
  }
  try {
    setModsStatus('Loading mods...');
    const [result, trusted] = await Promise.all([
      window.electronAPI.modsListInstalled(),
      window.electronAPI.modsListTrustedKeys ? window.electronAPI.modsListTrustedKeys() : Promise.resolve({ ok: true, keys: {} })
    ]);
    if (!result?.ok) {
      setModsStatus(`Failed to load mods: ${result?.error || 'unknown error'}`, true);
      return;
    }
    renderModsList(result.mods || []);
    renderTrustedKeys(trusted?.keys || {});
    setModsStatus('Mods loaded.');
  } catch (err) {
    setModsStatus(`Failed to load mods: ${err.message}`, true);
  }
}

async function installModDirectory() {
  const input = document.getElementById('settings-mods-source-dir');
  const sourceDir = String(input?.value || '').trim();
  if (!sourceDir) {
    setModsStatus('Enter a mod source directory first.', true);
    return;
  }
  try {
    setModsStatus('Installing mod...');
    const result = await window.electronAPI.modsInstallDirectory({ sourceDir });
    if (!result?.ok) {
      setModsStatus(`Install failed (${result?.stage || 'unknown'}): ${(result?.errors || [result?.error]).filter(Boolean).join('; ')}`, true);
      return;
    }
    setModsStatus(`Installed ${result.modId}@${result.version}`);
    await loadModsSettings();
  } catch (err) {
    setModsStatus(`Install failed: ${err.message}`, true);
  }
}

async function pickModsSourceDirectory() {
  if (!window.electronAPI?.modsPickDirectory) {
    return setModsStatus('Directory picker unavailable in this build.', true);
  }
  try {
    const result = await window.electronAPI.modsPickDirectory();
    if (!result?.ok) {
      setModsStatus(`Browse failed: ${result?.error || 'unknown error'}`, true);
      return;
    }
    if (result.canceled) return;
    const input = document.getElementById('settings-mods-source-dir');
    if (input) input.value = String(result.sourceDir || '');
    setModsStatus('Selected mod source directory.');
  } catch (err) {
    setModsStatus(`Browse failed: ${err.message}`, true);
  }
}

async function pickModsPrivateKeyFile() {
  if (!window.electronAPI?.modsPickKeyFile) {
    return setModsStatus('Private key picker unavailable in this build.', true);
  }
  try {
    const result = await window.electronAPI.modsPickKeyFile();
    if (!result?.ok) {
      setModsStatus(`Key browse failed: ${result?.error || 'unknown error'}`, true);
      return;
    }
    if (result.canceled) return;
    const input = document.getElementById('settings-mods-private-key-path');
    if (input) input.value = String(result.filePath || '');
    setModsStatus('Selected private key file.');
  } catch (err) {
    setModsStatus(`Key browse failed: ${err.message}`, true);
  }
}

async function createModsKeypair() {
  if (!window.electronAPI?.modsCreateKeypair) {
    return setModsStatus('Keypair API unavailable in this build.', true);
  }
  try {
    const keyId = String(document.getElementById('settings-mods-key-id')?.value || '').trim() || 'ed25519:local-dev-signer';
    const result = await window.electronAPI.modsCreateKeypair({ keyId });
    if (!result?.ok) {
      setModsStatus(`Keypair creation failed: ${result?.error || 'unknown error'}`, true);
      return;
    }
    const input = document.getElementById('settings-mods-private-key-path');
    if (input) input.value = String(result.privateKeyPath || '');
    setModsStatus(`Keypair created: ${result.privateKeyPath}`);
    await refreshTrustedModKeys();
  } catch (err) {
    setModsStatus(`Keypair creation failed: ${err.message}`, true);
  }
}

async function signModDirectory() {
  if (!window.electronAPI?.modsSignDirectory) {
    return setModsStatus('Sign API unavailable in this build.', true);
  }
  const sourceDir = String(document.getElementById('settings-mods-source-dir')?.value || '').trim();
  const privateKeyPath = String(document.getElementById('settings-mods-private-key-path')?.value || '').trim();
  const keyId = String(document.getElementById('settings-mods-key-id')?.value || '').trim();
  if (!sourceDir) return setModsStatus('Select a mod source directory first.', true);
  if (!privateKeyPath) return setModsStatus('Select a private key file first.', true);
  if (!keyId) return setModsStatus('Enter a signer key ID.', true);

  try {
    setModsStatus('Signing and approving mod...');
    const result = await window.electronAPI.modsSignDirectory({ sourceDir, privateKeyPath, keyId });
    if (!result?.ok) {
      setModsStatus(`Sign failed: ${result?.error || 'unknown error'}`, true);
      return;
    }
    setModsStatus(`Signed + approved (${result.keyId}).`);
    await refreshTrustedModKeys();
  } catch (err) {
    setModsStatus(`Sign failed: ${err.message}`, true);
  }
}

async function refreshTrustedModKeys() {
  if (!window.electronAPI?.modsListTrustedKeys) return;
  try {
    const result = await window.electronAPI.modsListTrustedKeys();
    if (result?.ok) renderTrustedKeys(result.keys || {});
  } catch (_err) {
    // best effort
  }
}

function getSelectedModId() {
  const input = document.getElementById('settings-mods-selected-id');
  return String(input?.value || '').trim();
}

async function enableSelectedMod() {
  const modId = getSelectedModId();
  if (!modId) return setModsStatus('Enter Selected Mod ID.', true);
  const result = await window.electronAPI.modsEnable({ modId });
  if (!result?.ok) {
    setModsStatus(`Enable failed: ${result?.error || result?.reason || 'unknown error'}`, true);
    return;
  }
  setModsStatus(`Enabled ${modId}`);
  await loadModsSettings();
}

async function disableSelectedMod() {
  const modId = getSelectedModId();
  if (!modId) return setModsStatus('Enter Selected Mod ID.', true);
  const result = await window.electronAPI.modsDisable({ modId });
  if (!result?.ok) {
    setModsStatus(`Disable failed: ${result?.error || result?.reason || 'unknown error'}`, true);
    return;
  }
  setModsStatus(`Disabled ${modId}`);
  await loadModsSettings();
}

async function removeSelectedMod() {
  const modId = getSelectedModId();
  if (!modId) return setModsStatus('Enter Selected Mod ID.', true);
  const result = await window.electronAPI.modsRemove({ modId, purge: true });
  if (!result?.ok) {
    setModsStatus(`Remove failed: ${result?.error || result?.reason || 'unknown error'}`, true);
    return;
  }
  setModsStatus(`Removed ${modId}`);
  await loadModsSettings();
}

async function attestSelectedMod() {
  const modId = getSelectedModId();
  if (!modId) return setModsStatus('Enter Selected Mod ID.', true);
  const result = await window.electronAPI.modsAttest({ modId });
  if (!result?.ok) {
    setModsStatus(`Attestation failed: ${result?.error || 'unknown error'}`, true);
    return;
  }
  setModsStatus(`Attestation generated: ${result.filePath || 'ok'}`);
}

async function attestVoiceAbsence() {
  const result = await window.electronAPI.modsAttest({ capabilityPrefix: 'voice.' });
  if (!result?.ok) {
    setModsStatus(`Attestation failed: ${result?.error || 'unknown error'}`, true);
    return;
  }
  const absent = result?.report?.absent === true;
  setModsStatus(`Voice absence attestation: ${absent ? 'ABSENT' : 'PRESENT'} (${result.filePath || 'no file'})`, !absent);
}
