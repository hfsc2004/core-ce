/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// ============================================================================
// PSF ROBOTICS ARCHIVE COLLECTION - DEVELOPER EDITION
// Renderer Process - Main UI Controller
// ============================================================================

// Store global state
window.catalogData = null;
window.skuConfig = null;
window.currentEditingModel = null;

// ============================================================================
// SCROLLABLE MODAL DIALOG
// ============================================================================

/**
 * Show a scrollable modal dialog for long content
 * @param {string} title - Modal title
 * @param {string} content - Content to display (can include newlines)
 * @param {string} type - 'success', 'error', or 'info' (default)
 */
function showScrollableModal(title, content, type = 'info') {
  // Remove existing modal if any
  const existingModal = document.getElementById('scrollable-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Determine icon and color based on type
  let icon, borderColor;
  switch (type) {
    case 'success':
      icon = '✅';
      borderColor = '#4CAF50';
      break;
    case 'error':
      icon = '❌';
      borderColor = '#f44336';
      break;
    default:
      icon = 'ℹ️';
      borderColor = '#2196F3';
  }
  
  // Create modal HTML
  const modalHTML = `
    <div id="scrollable-modal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    ">
      <div style="
        background: #1a1a2e;
        border: 2px solid ${borderColor};
        border-radius: 10px;
        max-width: 600px;
        max-height: 80vh;
        width: 90%;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      ">
        <div style="
          padding: 15px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 18px;
          font-weight: bold;
          color: #fff;
        ">
          ${icon} ${title}
        </div>
        <div style="
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          max-height: 60vh;
          color: #e0e0e0;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 13px;
          white-space: pre-wrap;
          line-height: 1.5;
        ">${escapeHtml(content)}</div>
        <div style="
          padding: 15px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          text-align: right;
        ">
          <button onclick="closeScrollableModal()" style="
            background: ${borderColor};
            color: white;
            border: none;
            padding: 10px 30px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
          ">OK</button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to document
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Focus the OK button
  const okButton = document.querySelector('#scrollable-modal button');
  if (okButton) {
    okButton.focus();
  }
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeScrollableModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

/**
 * Close the scrollable modal
 */
function closeScrollableModal() {
  const modal = document.getElementById('scrollable-modal');
  if (modal) {
    modal.remove();
  }
}

/**
 * Show a scrollable modal dialog with HTML content
 * @param {string} title - Modal title
 * @param {string} htmlContent - HTML content to render
 * @param {string} type - 'success', 'error', 'warning', or 'info' (default)
 */
function showScrollableModalHtml(title, htmlContent, type = 'info') {
  // Remove existing modal if any
  const existingModal = document.getElementById('scrollable-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Determine icon and color based on type
  let icon, borderColor;
  switch (type) {
    case 'success':
      icon = '✅';
      borderColor = '#4CAF50';
      break;
    case 'error':
      icon = '❌';
      borderColor = '#f44336';
      break;
    case 'warning':
      icon = '⚠️';
      borderColor = '#ffaa00';
      break;
    default:
      icon = 'ℹ️';
      borderColor = '#2196F3';
  }
  
  // Create modal HTML - note: htmlContent is NOT escaped
  const modalHTML = `
    <div id="scrollable-modal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    ">
    <div id="scrollable-modal-container" style="
        position: relative;
        background: #1a1a2e;
        border: 2px solid ${borderColor};
        border-radius: 10px;
        min-width: 400px;
        max-width: 90vw;
        width: 850px;
        min-height: 200px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        resize: both;
        overflow: hidden;
      ">
<div id="scrollable-modal-header" style="
          padding: 15px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 18px;
          font-weight: bold;
          color: #fff;
          cursor: move;
          user-select: none;
        ">
          ${icon} ${title}
        </div>
        <div style="
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          color: #e0e0e0;
          font-size: 13px;
          line-height: 1.5;
        ">${htmlContent}</div>
        <div style="
          padding: 15px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          text-align: right;
        ">
          <button onclick="closeScrollableModal()" style="
            background: ${borderColor};
            color: white;
            border: none;
            padding: 10px 30px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
          ">OK</button>
        </div>
      </div>
    </div>
  `;
  
// Add modal to document
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Make modal draggable by header
  const modalContainer = document.getElementById('scrollable-modal-container');
  const modalHeader = document.getElementById('scrollable-modal-header');
  
  if (modalContainer && modalHeader) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    
    modalHeader.addEventListener('mousedown', (e) => {
      isDragging = true;
      const rect = modalContainer.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      modalContainer.style.position = 'fixed';
      modalContainer.style.margin = '0';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      modalContainer.style.left = `${x}px`;
      modalContainer.style.top = `${y}px`;
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }
    
  // Focus the OK button
  const okButton = document.querySelector('#scrollable-modal button');
  if (okButton) {
    okButton.focus();
  }
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeScrollableModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

/**
 * Escape HTML characters to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// ============================================================================
