/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// BUILD TOOLS
// ============================================================================

async function buildSKUCatalogs() {
  const outputDiv = document.getElementById('build-output');
  const buildBtn = event.target;
  
  outputDiv.style.display = 'block';
  outputDiv.innerHTML = '🔧 Starting build process...\n';
  buildBtn.disabled = true;
  buildBtn.textContent = 'Building...';
  
  // Listen for progress updates
  window.electronAPI.onBuildProgress((data) => {
    outputDiv.innerHTML += data;
    // Auto-scroll to bottom
    outputDiv.scrollTop = outputDiv.scrollHeight;
  });
  
  try {
    const result = await window.electronAPI.buildSKUCatalogs();
    
    if (result.success) {
      outputDiv.innerHTML += '\n✅ BUILD COMPLETE!\n';
      outputDiv.innerHTML += `\nAll SKU catalogs have been regenerated successfully.\n`;
      alert('✅ SKU Catalogs built successfully!');
    } else {
      outputDiv.innerHTML += `\n❌ BUILD FAILED!\n`;
      outputDiv.innerHTML += `Error: ${result.message}\n`;
      if (result.error) {
        outputDiv.innerHTML += `\n${result.error}\n`;
      }
      alert(`❌ Build failed:\n${result.message}`);
    }
  } catch (err) {
    console.error('Build error:', err);
    outputDiv.innerHTML += `\n❌ BUILD ERROR!\n`;
    outputDiv.innerHTML += `${err.message}\n`;
    alert(`❌ Build error:\n${err.message}`);
  } finally {
    buildBtn.disabled = false;
    buildBtn.textContent = '🔧 Build All SKU Catalogs';
  }
}

// ============================================================================
