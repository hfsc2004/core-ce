/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * ============================================================================
 * MOE PIPELINE OPS - Save/Load Operations
 * ============================================================================
 *
 * Extracted from moe-pipeline-ops.js to keep files focused.
 * No behavior changes.
 * ============================================================================
 */

const LAST_LOADED_MOE_PROFILE_KEY = 'moe:last_loaded_profile';

function reportMoeStatus(message, level = 'info', summary = '') {
  const text = String(message || '');
  if (typeof window.appendMoeDeployStatusLine === 'function') {
    window.appendMoeDeployStatusLine(text, level);
  } else {
    console.log(`[MoE:${level}] ${text}`);
  }
  if (summary && typeof window.setMoeDeployStatusSummary === 'function') {
    window.setMoeDeployStatusSummary(String(summary));
  }
}

async function saveMoePipeline() {
  try {
    const pipelineData = buildMoePipelineData();
    const result = await window.electronAPI.saveMoEPipeline(pipelineData);
    if (result.success) {
      console.log('[MoE] Pipeline saved successfully');
      reportMoeStatus('Pipeline saved successfully (profile: default).', 'success', 'Saved');
    } else {
      throw new Error(result.message || 'Save failed');
    }
  } catch (err) {
    console.error('[MoE] Failed to save pipeline:', err);
    reportMoeStatus(`Failed to save pipeline: ${err.message}`, 'error', 'Save failed');
  }
}

async function loadMoePipelineFromDisk() {
  try {
    const config = await window.electronAPI.loadMoEPipeline();
    
    if (config && config.items) {
      window.modelOrderingState.moeItems = config.items;
      window.modelOrderingState.endpointRegistry = (config.endpointRegistry && typeof config.endpointRegistry === 'object')
        ? config.endpointRegistry
        : ensureEndpointRegistryState();
      console.log('[MoE] Pipeline loaded:', config.items.length, 'items');
      renderModelOrdering();
      reportMoeStatus(`Pipeline loaded: ${config.items.length} items.`, 'success', 'Loaded');
    } else {
      reportMoeStatus('No saved pipeline found.', 'warn', 'No save found');
    }
  } catch (err) {
    console.error('[MoE] Failed to load pipeline:', err);
    reportMoeStatus(`Failed to load pipeline: ${err.message}`, 'error', 'Load failed');
  }
}

function buildMoePipelineData() {
  const endpointRegistry = ensureEndpointRegistryState();
  return {
    version: "1.0",
    lastModified: new Date().toISOString(),
    items: window.modelOrderingState.moeItems,
    endpointRegistry
  };
}

async function saveMoePipelineAs() {
  try {
    const list = await listMoeProfiles();
    const suggested = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    openMoeProfileModal({
      mode: 'saveAs',
      title: 'Save Pipeline Profile',
      profiles: list,
      suggestedName: `profile-${suggested}`,
      confirmText: 'Save',
      onConfirm: async ({ profileName }) => {
        const result = await window.electronAPI.saveMoEPipelineProfile(
          buildMoePipelineData(),
          profileName
        );
        if (!result?.success) {
          throw new Error(result?.message || 'Save profile failed');
        }
        reportMoeStatus(`Pipeline saved as profile: ${result.profileName || profileName}`, 'success', 'Profile saved');
      }
    });
  } catch (err) {
    console.error('[MoE] Save profile failed:', err);
    reportMoeStatus(`Failed to save profile: ${err.message}`, 'error', 'Save failed');
  }
}

async function loadMoePipelineProfile() {
  try {
    const list = await listMoeProfiles();
    if (!Array.isArray(list) || list.length === 0) {
      reportMoeStatus('No saved pipeline profiles found.', 'warn', 'No profiles');
      return;
    }
    const lastLoadedProfile = getLastLoadedMoeProfile();
    openMoeProfileModal({
      mode: 'pick',
      title: 'Load Pipeline Profile',
      profiles: list,
      selectedProfileName: lastLoadedProfile || '',
      confirmText: 'Load',
      onConfirm: async ({ profileName }) => {
        const config = await window.electronAPI.loadMoEPipelineProfile(profileName);
        if (config && config.items) {
          window.modelOrderingState.moeItems = config.items;
          window.modelOrderingState.endpointRegistry = (config.endpointRegistry && typeof config.endpointRegistry === 'object')
            ? config.endpointRegistry
            : ensureEndpointRegistryState();
          renderModelOrdering();
          if (typeof window.activateMoeChatInput === 'function') {
            requestAnimationFrame(() => window.activateMoeChatInput());
          }
          setLastLoadedMoeProfile(profileName);
          reportMoeStatus(`Pipeline profile loaded: ${profileName}`, 'success', 'Profile loaded');
          return;
        }
        reportMoeStatus(`Profile not found: ${profileName}`, 'warn', 'Load failed');
      }
    });
  } catch (err) {
    console.error('[MoE] Load profile failed:', err);
    reportMoeStatus(`Failed to load profile: ${err.message}`, 'error', 'Load failed');
  }
}

async function deleteMoePipelineProfile() {
  try {
    const list = await listMoeProfiles();
    if (!Array.isArray(list) || list.length === 0) {
      reportMoeStatus('No saved pipeline profiles found.', 'warn', 'No profiles');
      return;
    }
    openMoeProfileModal({
      mode: 'pick',
      title: 'Delete Pipeline Profile',
      profiles: list,
      confirmText: 'Delete',
      danger: true,
      onConfirm: async ({ profileName }) => {
        const ok = await window.electronAPI.deleteMoEPipelineProfile(profileName);
        if (!ok) {
          reportMoeStatus(`Profile not found: ${profileName}`, 'warn', 'Delete failed');
          return;
        }
        reportMoeStatus(`Pipeline profile deleted: ${profileName}`, 'success', 'Profile deleted');
      }
    });
  } catch (err) {
    console.error('[MoE] Delete profile failed:', err);
    reportMoeStatus(`Failed to delete profile: ${err.message}`, 'error', 'Delete failed');
  }
}

async function listMoeProfiles() {
  if (!window.electronAPI?.listMoEPipelineProfiles) return [];
  const list = await window.electronAPI.listMoEPipelineProfiles();
  return Array.isArray(list) ? list : [];
}

function openMoeProfileModal(options = {}) {
  closeMoeProfileModal();
  const mode = String(options.mode || 'pick');
  const title = String(options.title || 'Pipeline Profiles');
  const profiles = Array.isArray(options.profiles) ? options.profiles : [];
  const confirmText = String(options.confirmText || 'OK');
  const danger = options.danger === true;
  const profileOptions = profiles
    .map((p) => ({
      profileName: String(p?.profileName || '').trim(),
      itemCount: Number.isFinite(Number(p?.itemCount)) ? Number(p.itemCount) : null,
      lastModified: String(p?.lastModified || '').trim() || null
    }))
    .filter((p) => p.profileName);
  const profileMap = new Map(profileOptions.map((p) => [p.profileName, p]));

  const overlay = document.createElement('div');
  overlay.id = 'moe-profile-modal';
  overlay.style.cssText = [
    'position: fixed',
    'inset: 0',
    'background: rgba(0,0,0,0.75)',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'z-index: 10001'
  ].join(';');

  const defaultProfile = profileOptions[0]?.profileName || 'default';
  const requestedProfile = String(options.selectedProfileName || '').trim();
  const initialProfile = profileMap.has(requestedProfile) ? requestedProfile : defaultProfile;
  const escapedOptions = profileOptions
    .map((p) => {
      const modified = p.lastModified ? ` • ${new Date(p.lastModified).toLocaleString()}` : '';
      const count = p.itemCount === null ? '' : ` • ${p.itemCount} items`;
      const selected = p.profileName === initialProfile ? ' selected' : '';
      return `<option value="${escapeHtml(p.profileName)}"${selected}>${escapeHtml(p.profileName + count + modified)}</option>`;
    })
    .join('');
  const needsNameInput = mode === 'saveAs';

  overlay.innerHTML = `
    <div style="width: 520px; max-width: 92vw; background: #1a1a2e; border: 1px solid #444; border-radius: 10px; color: #fff; box-shadow: 0 16px 40px rgba(0,0,0,0.4);">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #333;">
        <div style="font-size:16px; font-weight:700;">${escapeHtml(title)}</div>
        <button id="moe-profile-close" style="border:none; background:transparent; color:#aaa; cursor:pointer; font-size:18px;">×</button>
      </div>
      <div style="padding:16px; display:flex; flex-direction:column; gap:12px;">
        <label style="font-size:12px; color:#9aa;">Saved Profiles</label>
        <select id="moe-profile-select" style="padding:10px; background:#111827; color:#fff; border:1px solid #4b5563; border-radius:6px;">
          ${escapedOptions || '<option value="default">default</option>'}
        </select>
        <div id="moe-profile-meta" style="font-size:12px; color:#9aa; min-height:18px;"></div>
        ${needsNameInput ? `
          <label style="font-size:12px; color:#9aa;">Profile Name</label>
          <input id="moe-profile-name" type="text" value="${escapeHtml(String(options.suggestedName || initialProfile))}" style="padding:10px; background:#111827; color:#fff; border:1px solid #4b5563; border-radius:6px;" />
          <div style="font-size:11px; color:#778;">
            Tip: select an existing profile above to overwrite it, or type a new name.
          </div>
        ` : ''}
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-end; padding:12px 16px; border-top:1px solid #333;">
        <button id="moe-profile-confirm" style="padding:8px 14px; background:${danger ? 'rgba(255,107,107,0.25)' : 'rgba(0,212,255,0.2)'}; border:1px solid ${danger ? '#ff6b6b' : '#00d4ff'}; color:${danger ? '#ff9b9b' : '#9fe8ff'}; border-radius:6px; cursor:pointer;">${escapeHtml(confirmText)}</button>
        <button id="moe-profile-cancel" style="padding:8px 14px; background:rgba(255,255,255,0.1); border:1px solid #666; color:#ddd; border-radius:6px; cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => closeMoeProfileModal();
  overlay.querySelector('#moe-profile-close')?.addEventListener('click', close);
  overlay.querySelector('#moe-profile-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#moe-profile-confirm')?.addEventListener('click', async () => {
    try {
      const selected = String(overlay.querySelector('#moe-profile-select')?.value || defaultProfile).trim();
      const typed = String(overlay.querySelector('#moe-profile-name')?.value || '').trim();
      const profileName = needsNameInput ? typed : selected;
      if (!profileName) {
        reportMoeStatus('Profile name is required.', 'warn', 'Blocked');
        return;
      }
      if (typeof options.onConfirm === 'function') {
        await options.onConfirm({ profileName });
      }
      close();
    } catch (err) {
      console.error('[MoE] Profile modal action failed:', err);
      reportMoeStatus(err.message || 'Profile action failed.', 'error', 'Error');
    }
  });

  const profileSelect = overlay.querySelector('#moe-profile-select');
  const profileNameInput = overlay.querySelector('#moe-profile-name');
  const profileMeta = overlay.querySelector('#moe-profile-meta');
  let profileNameDirty = false;
  if (profileNameInput) {
    profileNameInput.addEventListener('input', () => {
      profileNameDirty = true;
    });
  }
  const updateMeta = () => {
    if (!profileMeta || !profileSelect) return;
    const selected = String(profileSelect.value || '').trim();
    const meta = profileMap.get(selected);
    if (!meta) {
      profileMeta.textContent = '';
      return;
    }
    const count = meta.itemCount === null ? 'items: n/a' : `items: ${meta.itemCount}`;
    const modified = meta.lastModified
      ? `last modified: ${new Date(meta.lastModified).toLocaleString()}`
      : 'last modified: n/a';
    profileMeta.textContent = `${count} • ${modified}`;
    if (needsNameInput && profileNameInput && (!profileNameDirty || !String(profileNameInput.value || '').trim())) {
      profileNameInput.value = selected;
    }
  };
  profileSelect?.addEventListener('change', updateMeta);
  updateMeta();
}

function closeMoeProfileModal() {
  const modal = document.getElementById('moe-profile-modal');
  if (modal) modal.remove();
}

function getLastLoadedMoeProfile() {
  try {
    return String(localStorage.getItem(LAST_LOADED_MOE_PROFILE_KEY) || '').trim();
  } catch (_) {
    return '';
  }
}

function setLastLoadedMoeProfile(profileName) {
  const value = String(profileName || '').trim();
  if (!value) return;
  try {
    localStorage.setItem(LAST_LOADED_MOE_PROFILE_KEY, value);
  } catch (_) {
    // no-op
  }
}

window.saveMoePipeline = saveMoePipeline;
window.saveMoePipelineAs = saveMoePipelineAs;
window.loadMoePipelineFromDisk = loadMoePipelineFromDisk;
window.loadMoePipelineProfile = loadMoePipelineProfile;
window.deleteMoePipelineProfile = deleteMoePipelineProfile;
