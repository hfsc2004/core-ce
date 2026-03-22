/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// ============================================================================
// PSF OFFLINE ARCHIVE COLLECTION
// Renderer - WebUI Launcher
// ============================================================================
// Shared by both Standard and Community Editions
// ============================================================================

/**
 * Launch interface - called from Launch Interfaces screen buttons
 * @param {string} type - 'terminal', 'openwebui', or 'anythingllm'
 */
async function launchInterface(type) {
  try {
    console.log(`[launchInterface] Launching ${type}...`);
    
    if (type === 'terminal') {
      // Launch PSF Terminal - need to start Ollama first, then show terminal dialog
      const ollamaResult = await window.electronAPI.launchModelInOllama('', '', 'default', false);
      
      if (ollamaResult.success) {
        // Show terminal instructions
        await window.electronAPI.openOllamaTerminal('', 0, ollamaResult.port, '', '');
      } else {
        alert(`Failed to start Ollama:\n${ollamaResult.message}`);
      }
      
    } else if (type === 'openwebui') {
      // Launch Open WebUI via BMOC-Lite
      const result = await window.electronAPI.startWebUI();
      
      if (result.success) {
        console.log('Open WebUI launched on port', result.port);
      } else {
        alert(`Failed to launch Open WebUI:\n${result.message}`);
      }
      
    } else if (type === 'anythingllm') {
      // Launch AnythingLLM via BMOC-Lite
      const result = await window.electronAPI.startAnythingLLM();
      
      if (result.success) {
        console.log('AnythingLLM launched on port', result.port);
      } else {
        alert(`Failed to launch AnythingLLM:\n${result.message}`);
      }
    }
    
  } catch (err) {
    console.error('[launchInterface] Error:', err);
    alert(`Failed to launch interface:\n${err.message}`);
  }
}

/**
 * Legacy function for Core-CE compatibility
 */
async function launchWebUI(type) {
  try {
    console.log(`Launching ${type}...`);
    
    // Start Ollama first
    await window.electronAPI.launchOllama();
    
    // Wait for Ollama to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (type === 'open-webui') {
      // Launch Open WebUI
      const result = await window.electronAPI.launchOpenWebUI();
      
      if (result.success) {
        // Open in browser
        await window.electronAPI.openURL(result.url || 'http://localhost:8080');
        console.log('Open WebUI launched successfully');
      } else {
        alert(`Failed to launch Open WebUI:\n${result.message}`);
      }
    } else if (type === 'anythingllm') {
      // Launch AnythingLLM
      const result = await window.electronAPI.launchAnythingLLM();
      
      if (result.success) {
        await window.electronAPI.openURL(result.url || 'http://localhost:3001');
        console.log('AnythingLLM launched successfully');
      } else {
        alert(`Failed to launch AnythingLLM:\n${result.message}`);
      }
    }
    
  } catch (err) {
    console.error('Launch failed:', err);
    alert(`Failed to launch interface:\n${err.message}`);
  }
}

// ============================================================================
