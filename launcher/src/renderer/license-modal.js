/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// ============================================================================
// PSF CORE COMMUNITY EDITION
// Renderer - License Modal
// ============================================================================
// Shared by both Standard and Community Editions
// ============================================================================

async function loadLicenseButtons() {
  const container = document.getElementById('license-buttons');
  
  if (!container) return;
  
  try {
    const result = await window.electronAPI.getLicenseFiles();
    
    if (!result.success || result.files.length === 0) {
      container.innerHTML = '<p style="color: #666;">No license files found in licenses/ folder.</p>';
      return;
    }
    
    let html = '';
    for (const file of result.files) {
      // Remove .txt extension for button label
      const label = file.replace('.txt', '');
      html += `<button class="btn-secondary" onclick="showLicenseModal('${file}')">${label}</button>\n`;
    }
    
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color: #ff6b6b;">Error loading licenses: ${err.message}</p>`;
  }
}

async function showLicenseModal(filename) {
  try {
    const result = await window.electronAPI.getLicenseContent(filename);
    
    if (!result.success) {
      alert('Error loading license: ' + result.message);
      return;
    }
    
    const label = filename.replace('.txt', '');
    
    const modalHtml = `
      <div class="license-modal-overlay" id="license-modal" onclick="closeLicenseModalOnOverlay(event)">
        <div class="license-modal" onclick="event.stopPropagation()">
          <div class="license-modal-header">
            <h3>📄 ${label}</h3>
            <button class="license-modal-close" onclick="closeModal('license-modal')">×</button>
          </div>
          <div class="license-modal-content">${escapeHtml(result.content)}</div>
          <div class="license-modal-footer">
            <button class="btn-primary" onclick="closeModal('license-modal')">Close</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function closeLicenseModalOnOverlay(event) {
  if (event.target.classList.contains('license-modal-overlay')) {
    closeModal('license-modal');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.remove();
  }
}

// ============================================================================
