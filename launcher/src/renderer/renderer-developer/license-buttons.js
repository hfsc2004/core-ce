/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// DYNAMIC LICENSE BUTTONS
// ============================================================================

async function loadLicenseButtons() {
  const container = document.getElementById('license-buttons');
  
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
      <div id="license-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); display: flex; justify-content: center; align-items: center; z-index: 1000;">
        <div style="background: #1a1a2e; padding: 30px; border-radius: 15px; border: 2px solid #0f3460; max-width: 800px; width: 90%; max-height: 80vh; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="color: var(--psf-accent, #00d4ff); margin: 0;">Ã°Å¸â€œâ€ž ${label}</h3>
            <button onclick="closeModal('license-modal')" style="background: none; border: none; color: #fff; font-size: 24px; cursor: pointer;">×</button>
          </div>
          <div style="flex: 1; overflow-y: auto; background: rgba(0,0,0,0.4); padding: 20px; border-radius: 10px; font-family: monospace; font-size: 13px; line-height: 1.6; color: #ccc; white-space: pre-wrap;">${escapeHtml(result.content)}</div>
          <div style="margin-top: 20px; text-align: right;">
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
