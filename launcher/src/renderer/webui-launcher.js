/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// ============================================================================
// PSF CORE COMMUNITY EDITION
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
      const launchOptions = (() => {
        try {
          const raw = localStorage.getItem('psf_terminal_provider_defaults');
          const parsed = raw ? JSON.parse(raw) : null;
          if (!parsed || typeof parsed !== 'object') return null;
          return {
            provider: String(parsed.provider || '').trim(),
            baseUrl: String(parsed.provider_base_url || '').trim(),
            providerModel: String(parsed.provider_model_id || '').trim(),
            llamaCppModelPath: String(parsed.llama_cpp_model_path || '').trim()
          };
        } catch (_) {
          return null;
        }
      })();
      const provider = String(launchOptions?.provider || '').trim().toLowerCase();

      if (provider === 'llama.cpp') {
        const terminalResult = await window.electronAPI.openOllamaTerminal('', 0, null, '', '', launchOptions);
        if (!terminalResult?.success) {
          alert(`Failed to start llama.cpp terminal session:\n${terminalResult?.message || 'Unknown error'}`);
        }
      } else {
        // Launch PSF Terminal through existing Ollama path.
        const ollamaResult = await window.electronAPI.launchModelInOllama('', '', 'default', false);
        if (ollamaResult.success) {
          await window.electronAPI.openOllamaTerminal('', 0, ollamaResult.port, '', '', launchOptions);
        } else {
          alert(`Failed to start Ollama:\n${ollamaResult.message}`);
        }
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
