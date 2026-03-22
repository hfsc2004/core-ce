/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Settings Modal - System tab compliance helpers
 * Extracted from settings-modal-system.js (structural split only).
 */

function setComplianceStatus(elId, text, color = '#888') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
}

async function loadComplianceEvidenceManager() {
  if (!window.electronAPI?.getComplianceEvidenceStatus) return;
  try {
    const result = await window.electronAPI.getComplianceEvidenceStatus();
    if (!result?.success) {
      setComplianceStatus('settings-compliance-evidence-status', `Load failed: ${result?.message || 'Unknown error'}`, '#ff6b6b');
      return;
    }
    const e = result.evidence || {};
    const setVal = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.value = String(value || '');
    };
    setVal('settings-compliance-standard', e.standard);
    setVal('settings-compliance-baseline', e.baseline);
    setVal('settings-compliance-profile', e.profile);
    setVal('settings-compliance-evidence-id', e.evidenceId);
    setVal('settings-compliance-assessor', e.assessor);
    setVal('settings-compliance-assessment-date', e.assessmentDate);
    setVal('settings-compliance-expires-on', e.expiresOn);
    setVal('settings-compliance-attestation', e.attestation);
    setVal('settings-compliance-key-id', e.signature?.keyId || '');
    setVal('settings-compliance-public-key-pem', e.signature?.publicKeyPem || '');

    const trustedKeysEl = document.getElementById('settings-compliance-trusted-keys');
    if (trustedKeysEl) {
      const ids = Array.isArray(result.trustedKeyIds) ? result.trustedKeyIds : [];
      trustedKeysEl.textContent = ids.length > 0
        ? `Trusted keys: ${ids.join(', ')}`
        : 'Trusted keys: (none)';
    }

    setComplianceStatus(
      'settings-compliance-evidence-status',
      `Loaded (${result.proofState || 'UNVERIFIED'})`,
      '#888'
    );
  } catch (err) {
    setComplianceStatus('settings-compliance-evidence-status', `Load failed: ${err.message || String(err)}`, '#ff6b6b');
  }
}

async function saveComplianceEvidenceManager() {
  if (!window.electronAPI?.saveComplianceEvidence) return;
  const getVal = (id) => String(document.getElementById(id)?.value || '').trim();
  const payload = {
    standard: getVal('settings-compliance-standard'),
    baseline: getVal('settings-compliance-baseline'),
    profile: getVal('settings-compliance-profile'),
    evidenceId: getVal('settings-compliance-evidence-id'),
    assessor: getVal('settings-compliance-assessor'),
    assessmentDate: getVal('settings-compliance-assessment-date'),
    expiresOn: getVal('settings-compliance-expires-on'),
    attestation: getVal('settings-compliance-attestation')
  };
  try {
    const result = await window.electronAPI.saveComplianceEvidence(payload);
    if (!result?.success) {
      setComplianceStatus('settings-compliance-evidence-status', `Save failed: ${result?.message || 'Unknown error'}`, '#ff6b6b');
      return;
    }
    setComplianceStatus('settings-compliance-evidence-status', result.message || 'Saved', '#00ff88');
    await loadComplianceEvidenceManager();
    if (typeof window.refreshAppVersionDisplay === 'function') {
      await window.refreshAppVersionDisplay();
    }
    await loadAboutInfo();
  } catch (err) {
    setComplianceStatus('settings-compliance-evidence-status', `Save failed: ${err.message || String(err)}`, '#ff6b6b');
  }
}

async function addComplianceTrustedKey() {
  if (!window.electronAPI?.addComplianceTrustedKey) return;
  const keyId = String(document.getElementById('settings-compliance-key-id')?.value || '').trim();
  const publicKeyPem = String(document.getElementById('settings-compliance-public-key-pem')?.value || '').trim();
  try {
    const result = await window.electronAPI.addComplianceTrustedKey(keyId, publicKeyPem);
    if (!result?.success) {
      setComplianceStatus('settings-compliance-key-status', `Add key failed: ${result?.message || 'Unknown error'}`, '#ff6b6b');
      return;
    }
    setComplianceStatus('settings-compliance-key-status', result.message || 'Trusted key saved', '#00ff88');
    await loadComplianceEvidenceManager();
  } catch (err) {
    setComplianceStatus('settings-compliance-key-status', `Add key failed: ${err.message || String(err)}`, '#ff6b6b');
  }
}

async function removeComplianceTrustedKey() {
  if (!window.electronAPI?.removeComplianceTrustedKey) return;
  const keyId = String(document.getElementById('settings-compliance-key-id')?.value || '').trim();
  try {
    const result = await window.electronAPI.removeComplianceTrustedKey(keyId);
    if (!result?.success) {
      setComplianceStatus('settings-compliance-key-status', `Remove key failed: ${result?.message || 'Unknown error'}`, '#ff6b6b');
      return;
    }
    setComplianceStatus('settings-compliance-key-status', result.message || 'Trusted key removed', '#00ff88');
    await loadComplianceEvidenceManager();
    if (typeof window.refreshAppVersionDisplay === 'function') {
      await window.refreshAppVersionDisplay();
    }
    await loadAboutInfo();
  } catch (err) {
    setComplianceStatus('settings-compliance-key-status', `Remove key failed: ${err.message || String(err)}`, '#ff6b6b');
  }
}

async function pickCompliancePrivateKeyPath() {
  if (!window.electronAPI?.selectImportFile) return;
  try {
    const picked = await window.electronAPI.selectImportFile({ mode: 'file', title: 'Select Compliance Private Key' });
    if (!picked?.success || picked?.canceled || !picked.filePath) return;
    const input = document.getElementById('settings-compliance-private-key-path');
    if (input) input.value = String(picked.filePath);
  } catch (err) {
    setComplianceStatus('settings-compliance-sign-status', `Pick failed: ${err.message || String(err)}`, '#ff6b6b');
  }
}

async function pickCompliancePublicKeyPath() {
  if (!window.electronAPI?.selectImportFile) return;
  try {
    const picked = await window.electronAPI.selectImportFile({ mode: 'file', title: 'Select Compliance Public Key' });
    if (!picked?.success || picked?.canceled || !picked.filePath) return;
    const input = document.getElementById('settings-compliance-public-key-path');
    if (input) input.value = String(picked.filePath);
  } catch (err) {
    setComplianceStatus('settings-compliance-sign-status', `Pick failed: ${err.message || String(err)}`, '#ff6b6b');
  }
}

async function signComplianceEvidence() {
  if (!window.electronAPI?.signComplianceEvidence) return;
  const keyId = String(document.getElementById('settings-compliance-key-id')?.value || '').trim();
  const privateKeyPath = String(document.getElementById('settings-compliance-private-key-path')?.value || '').trim();
  const publicKeyPath = String(document.getElementById('settings-compliance-public-key-path')?.value || '').trim();
  const approve = !!document.getElementById('settings-compliance-approve-key')?.checked;

  try {
    const result = await window.electronAPI.signComplianceEvidence({ keyId, privateKeyPath, publicKeyPath, approve });
    if (!result?.success) {
      setComplianceStatus('settings-compliance-sign-status', `Sign failed: ${result?.message || 'Unknown error'}`, '#ff6b6b');
      return;
    }
    setComplianceStatus('settings-compliance-sign-status', result.message || 'Signed', '#00ff88');
    await loadComplianceEvidenceManager();
    if (typeof window.refreshAppVersionDisplay === 'function') {
      await window.refreshAppVersionDisplay();
    }
    await loadAboutInfo();
  } catch (err) {
    setComplianceStatus('settings-compliance-sign-status', `Sign failed: ${err.message || String(err)}`, '#ff6b6b');
  }
}

async function loadComplianceProofBadgeVisibilitySettings() {
  const mainCheckbox = document.getElementById('settings-show-main-proof-badge');
  const aboutCheckbox = document.getElementById('settings-show-about-proof-badge');
  const status = document.getElementById('settings-compliance-proof-badge-status');
  if (!mainCheckbox || !aboutCheckbox) return;
  try {
    const settings = await window.electronAPI.getSettings();
    mainCheckbox.checked = settings?.show_main_compliance_proof_badge !== false;
    aboutCheckbox.checked = settings?.show_about_compliance_proof_badge !== false;
    if (status) {
      status.textContent = 'Loaded';
      status.style.color = '#888';
    }
  } catch (err) {
    if (status) {
      status.textContent = `Load failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}

async function saveComplianceProofBadgeVisibility() {
  const mainCheckbox = document.getElementById('settings-show-main-proof-badge');
  const aboutCheckbox = document.getElementById('settings-show-about-proof-badge');
  const status = document.getElementById('settings-compliance-proof-badge-status');
  if (!mainCheckbox || !aboutCheckbox) return;
  try {
    const settings = await window.electronAPI.getSettings();
    const next = {
      ...(settings || {}),
      show_main_compliance_proof_badge: !!mainCheckbox.checked,
      show_about_compliance_proof_badge: !!aboutCheckbox.checked
    };
    const result = await window.electronAPI.saveSettings(next);
    if (!result?.success) {
      if (status) {
        status.textContent = `Save failed: ${result?.error || 'Unknown error'}`;
        status.style.color = '#ff6b6b';
      }
      return;
    }
    if (status) {
      status.textContent = 'Saved';
      status.style.color = '#00ff88';
    }
    if (typeof window.refreshAppVersionDisplay === 'function') {
      await window.refreshAppVersionDisplay();
    }
    await loadAboutInfo();
  } catch (err) {
    if (status) {
      status.textContent = `Save failed: ${err.message || String(err)}`;
      status.style.color = '#ff6b6b';
    }
  }
}
