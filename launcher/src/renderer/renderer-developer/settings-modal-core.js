/**
 * Settings Modal - modal lifecycle/core behavior
 * Extracted from settings-modal.js to reduce monolith size.
 *
 * @version 1.1.3 - March 5, 2026
 */

async function showSettingsModal(initialTab = 'huggingface') {
  // Remove existing modal if any
  const existing = document.getElementById('settings-modal-overlay');
  if (existing) existing.remove();
  
  // Load current settings
  let settings = { huggingface_token: '' };
  try {
    if (window.electronAPI && window.electronAPI.getSettings) {
      settings = await window.electronAPI.getSettings();
    }
  } catch (err) {
    console.error('[Settings Modal] Error loading settings:', err);
  }
  
  // Insert modal HTML
  document.body.insertAdjacentHTML('beforeend', getSettingsModalHTML(settings));
  const overlay = document.getElementById('settings-modal-overlay');
  const inlineSlideMode = !window.__SETTINGS_STANDALONE__ && Boolean(document.getElementById('main-content'));
  if (overlay && inlineSlideMode) {
    overlay.classList.add('settings-inline-slide');
    const headerEl = document.querySelector('.app-header');
    const headerBottom = headerEl ? Math.max(0, Math.round(headerEl.getBoundingClientRect().bottom)) : 0;
    overlay.style.setProperty('--settings-inline-top', `${headerBottom}px`);
    requestAnimationFrame(() => overlay.classList.add('open'));
  }
  
  // Initialize draggable
  initSettingsModalDrag();
  
  // Switch to initial tab
  settingsModalState.activeTab = initialTab;
  switchSettingsTab(initialTab);
  
  // Load system info if on that tab
  if (initialTab === 'system') {
    loadSystemInfo();
  }
}

/**
 * Toggle settings modal open/closed
 */
function toggleSettingsModal(initialTab = 'huggingface') {
  const overlay = document.getElementById('settings-modal-overlay');
  if (overlay) {
    closeSettingsModal();
    return;
  }
  return showSettingsModal(initialTab);
}

/**
 * Close the settings modal
 */
function closeSettingsModal(event) {
  if (event && event.target !== event.currentTarget) return;

  if (typeof stopHardwareMicrophoneTest === 'function') {
    stopHardwareMicrophoneTest();
  }
  
  const overlay = document.getElementById('settings-modal-overlay');
  if (overlay) {
    if (overlay.classList.contains('settings-inline-slide')) {
      overlay.classList.remove('open');
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 180);
    } else {
      overlay.remove();
    }
  }
  
  // Clear cached state so it reloads fresh next time
  settingsModalState.hardwareInfo = null;
  settingsModalState.workspaceGitStatus = null;
  settingsModalState.workspaceGitLoaded = false;

  // In standalone settings window mode, close the window entirely.
  if (window.__SETTINGS_STANDALONE__) {
    window.close();
  }
}

/**
 * Switch between tabs
 */
function switchSettingsTab(tabId) {
  if (tabId === 'theme') {
    tabId = 'huggingface';
  }

  const previousTab = settingsModalState.activeTab;
  settingsModalState.activeTab = tabId;

  if (previousTab === 'hardware' && tabId !== 'hardware' && typeof stopHardwareMicrophoneTest === 'function') {
    stopHardwareMicrophoneTest();
  }
  
  // Update tab buttons
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });
  
  // Update tab content
  document.querySelectorAll('.settings-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `settings-tab-${tabId}`);
  });
  
  // Load data for specific tabs
  if (tabId === 'system' && !settingsModalState.hardwareInfo) {
    loadSystemInfo();
  }

  if (tabId === 'mods' && typeof loadModsSettings === 'function') {
    loadModsSettings();
  }

  if (tabId === 'speech' && typeof loadSpeechSettings === 'function') {
    loadSpeechSettings();
  }

  if (tabId === 'hardware' && typeof loadHardwareSettings === 'function') {
    loadHardwareSettings();
  }

  if (tabId === 'about' && typeof loadAboutInfo === 'function') {
    loadAboutInfo();
  }
  
}

// ============================================================================
// HUGGINGFACE TAB FUNCTIONS
// ============================================================================


function initSettingsModalDrag() {
  if (window.__SETTINGS_STANDALONE__) return;

  const overlay = document.getElementById('settings-modal-overlay');
  if (overlay?.classList?.contains('settings-inline-slide')) return;

  const modal = document.getElementById('settings-modal');
  const header = document.getElementById('settings-modal-header');
  
  if (!modal || !header) return;
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    
    settingsModalState.isDragging = true;
    
    const rect = modal.getBoundingClientRect();
    settingsModalState.offsetX = e.clientX - rect.left;
    settingsModalState.offsetY = e.clientY - rect.top;
    
    modal.style.transform = 'none';
    modal.style.left = rect.left + 'px';
    modal.style.top = rect.top + 'px';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!settingsModalState.isDragging) return;
    
    e.preventDefault();
    
    let newX = e.clientX - settingsModalState.offsetX;
    let newY = e.clientY - settingsModalState.offsetY;
    
    const maxX = window.innerWidth - modal.offsetWidth;
    const maxY = window.innerHeight - modal.offsetHeight;
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));
    
    modal.style.left = newX + 'px';
    modal.style.top = newY + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    settingsModalState.isDragging = false;
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { showSettingsModal, closeSettingsModal };
}
