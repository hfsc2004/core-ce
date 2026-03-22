/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// WEBUI LAUNCHERS
// ============================================================================

async function launchWebUI(type) {
  try {
    console.log(`Launching ${type}...`);
    
    await window.electronAPI.launchOllama();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (type === 'open-webui') {
      await window.electronAPI.openURL('http://localhost:8080');
    } else {
      await window.electronAPI.openURL('http://localhost:3001');
    }
    
    alert(`${type === 'open-webui' ? 'Open WebUI' : 'AnythingLLM'} is launching...\n\nCheck your browser!`);
  } catch (err) {
    console.error('Launch failed:', err);
    alert('Failed to launch. Check console for details.');
  }
}

// ============================================================================
