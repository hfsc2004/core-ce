/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// COMPILE FINAL PROJECT
// ============================================================================

// Store custom collections for compile
window.customCollections = [];
window.availableModelsForCompile = [];
window.currentConfigName = null;
window.currentCompileEdition = 'standard';
window.availableConfigs = [];

const compileTimerController = window.CompileProjectTimer && typeof window.CompileProjectTimer.createTimerController === 'function'
  ? window.CompileProjectTimer.createTimerController()
  : null;

function startCompileTimer() {
  if (!compileTimerController) return;
  compileTimerController.start();
}

function stopCompileTimer(success = true) {
  if (!compileTimerController) return '00:00:00';
  return compileTimerController.stop(success);
}

async function loadCompileProject() {
  // Load available configurations
  await loadConfigList();
  
  // Load available models (downloaded only with blobs)
  await loadAvailableModelsForCompile();
  
  // Check compiled binary status
  await checkCompiledBinaries();
  
  // Update summary
  updateCompileSummary();
}

let compileConfigsController = null;
function getCompileConfigsController() {
  if (!compileConfigsController &&
      window.CompileProjectConfigs &&
      typeof window.CompileProjectConfigs.createConfigsController === 'function') {
    compileConfigsController = window.CompileProjectConfigs.createConfigsController({
      closeModal,
      renderCustomCollections,
      loadAvailableModelsForCompile,
      updateCompileSummary
    });
  }
  return compileConfigsController;
}

async function loadConfigList() {
  const controller = getCompileConfigsController();
  if (!controller) return;
  await controller.loadConfigList();
}

function showNewConfigForm() {
  const controller = getCompileConfigsController();
  if (!controller) return;
  controller.showNewConfigForm();
}

async function createNewConfig() {
  const controller = getCompileConfigsController();
  if (!controller) return;
  await controller.createNewConfig();
}

async function loadSelectedConfig() {
  const controller = getCompileConfigsController();
  if (!controller) return;
  await controller.loadSelectedConfig();
}

async function saveCurrentConfig() {
  const controller = getCompileConfigsController();
  if (!controller) return;
  await controller.saveCurrentConfig();
}

async function deleteCurrentConfig() {
  const controller = getCompileConfigsController();
  if (!controller) return;
  await controller.deleteCurrentConfig();
}

async function loadAvailableModelsForCompile() {
  const container = document.getElementById('available-models-for-compile');
  
  try {
    // Get list of models that have blobs in Ollama
    const result = await window.electronAPI.getDownloadedModelsWithBlobs();
    
    if (!result.success) {
      container.innerHTML = `<p style="color: #ff6b6b;">Error: ${result.message}</p>`;
      return;
    }
    
    window.availableModelsForCompile = result.models;
    
    if (result.models.length === 0) {
      container.innerHTML = `
        <p style="color: #aaa; text-align: center;">
          No models found with Ollama blobs.<br>
          <small>Download models and launch them in Ollama to create blobs.</small>
        </p>
      `;
      return;
    }
    
    // Sort by size
    result.models.sort((a, b) => a.size_mb - b.size_mb);
    
    let html = `
      <p style="color: #aaa; margin-bottom: 15px;">${result.models.length} models available with Ollama blobs</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;">
    `;
    
    for (const model of result.models) {
      const sizeGB = (model.size_mb / 1024).toFixed(2);
      const isAssigned = isModelAssignedToCollection(model.id);
      
      html += `
        <div class="available-model-card" style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; border: 1px solid ${isAssigned ? 'var(--psf-success, #00ff88)' : 'var(--psf-border, #0f3460)'};">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <strong style="color: #fff;">${model.name}</strong>
              <p style="color: #888; font-size: 12px; margin: 5px 0 0 0;">${sizeGB} GB • ${model.quantization || 'N/A'}</p>
            </div>
            <span style="color: ${isAssigned ? 'var(--psf-success, #00ff88)' : '#666'}; font-size: 20px;">${isAssigned ? '✓' : '○'}</span>
          </div>
        </div>
      `;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
  } catch (err) {
    container.innerHTML = `<p style="color: #ff6b6b;">Error loading models: ${err.message}</p>`;
  }
}

let compileCollectionsController = null;
function getCompileCollectionsController() {
  if (!compileCollectionsController &&
      window.CompileProjectCollections &&
      typeof window.CompileProjectCollections.createCollectionsController === 'function') {
    compileCollectionsController = window.CompileProjectCollections.createCollectionsController({
      getCustomCollections: () => window.customCollections,
      setCustomCollections: (collections) => { window.customCollections = collections; },
      getAvailableModels: () => window.availableModelsForCompile,
      closeModal,
      loadAvailableModelsForCompile
    });
  }
  return compileCollectionsController;
}

function isModelAssignedToCollection(modelId) {
  const controller = getCompileCollectionsController();
  if (!controller) return false;
  return controller.isModelAssignedToCollection(modelId);
}

function showAddCustomCollectionForm() {
  const controller = getCompileCollectionsController();
  if (!controller) return;
  controller.showAddCustomCollectionForm();
}

async function createCustomCollection() {
  const controller = getCompileCollectionsController();
  if (!controller) return;
  await controller.createCustomCollection();
}

function renderCustomCollections() {
  const controller = getCompileCollectionsController();
  if (!controller) return;
  controller.renderCustomCollections();
}

function editCustomCollection(collectionId) {
  const controller = getCompileCollectionsController();
  if (!controller) return;
  controller.editCustomCollection(collectionId);
}

async function saveCustomCollectionEdit(collectionId) {
  const controller = getCompileCollectionsController();
  if (!controller) return;
  await controller.saveCustomCollectionEdit(collectionId);
}

async function deleteCustomCollection(collectionId) {
  const controller = getCompileCollectionsController();
  if (!controller) return;
  await controller.deleteCustomCollection(collectionId);
}

function updateCompileSummary() {
  const controller = getCompileCollectionsController();
  if (!controller) return;
  controller.updateCompileSummary();
}

async function startCompile() {
  if (!window.currentConfigName) {
    alert('Please select or create a configuration first.');
    return;
  }
  
  if (window.customCollections.length === 0) {
    alert('Please create at least one collection with models before compiling.');
    return;
  }
  
  // Auto-save before compiling
  await saveCurrentConfig();
  
  const config = {
    name: window.currentConfigName,
    productName: document.getElementById('compile-product-name').value,
    version: document.getElementById('compile-version').value,
    outputFolder: document.getElementById('compile-output-folder').value,
    storageLabel: document.getElementById('compile-storage-label').value,
    edition: window.currentCompileEdition || 'standard',
    collections: window.customCollections,
    models: window.availableModelsForCompile
  };
  
  // Show progress
  const progressDiv = document.getElementById('compile-progress');
  const statusDiv = document.getElementById('compile-status');
  const progressBar = document.getElementById('compile-progress-bar');
  const logDiv = document.getElementById('compile-log');
  const mainContent = document.getElementById('main-content');
  
  progressDiv.style.display = 'block';
  progressBar.style.width = '0%';
  
  // Start the timer
  startCompileTimer();
  logDiv.innerHTML = '';
  
  // Scroll main content to show progress section
  if (mainContent) {
    const progressTop = progressDiv.offsetTop - 100;
    mainContent.scrollTo({ top: progressTop, behavior: 'smooth' });
  }
  
  const addLog = (msg) => {
    logDiv.innerHTML += msg + '<br>';
    logDiv.scrollTop = logDiv.scrollHeight;
  };
  
  try {
    addLog('Starting compilation...');
    statusDiv.textContent = 'Initializing...';
    
    // Listen for progress updates
    window.electronAPI.onCompileProgress((data) => {
      statusDiv.textContent = data.status;
      progressBar.style.width = data.progress + '%';
      if (data.log) {
        addLog(data.log);
      }
    });
    
    const result = await window.electronAPI.compileProject(config);
    
    if (result.success) {
      // Stop timer and get final time
      const finalTime = stopCompileTimer(true);
      
      progressBar.style.width = '100%';
      statusDiv.textContent = 'Compilation complete!';
      addLog('');
      addLog('Compilation successful!');
      addLog('Total time: ' + finalTime);
      addLog('Output: ' + result.outputPath);
      addLog(result.modelCount + ' models in ' + result.collectionCount + ' collections');
      addLog(result.blobsCopied + ' blob files copied');
      addLog('');
      addLog('Product is ready to run!');
      
      // Refresh binary status
      await checkCompiledBinaries();
      
      alert('Compilation complete!\n\nTotal time: ' + finalTime + '\nOutput folder: ' + result.outputPath + '\n\nYour product is ready to run.');
    } else {
      // Stop timer on failure
      const finalTime = stopCompileTimer(false);
      
      statusDiv.textContent = 'Compilation failed';
      addLog('');
      addLog('Error: ' + result.message);
      addLog('Failed after: ' + finalTime);
      alert('Compilation failed after ' + finalTime + ':\n\n' + result.message);
    }
  } catch (err) {
    // Stop timer on error
    const finalTime = stopCompileTimer(false);
    
    statusDiv.textContent = 'Compilation error';
    addLog('Error: ' + err.message);
    addLog('Failed after: ' + finalTime);
    alert('Compilation error after ' + finalTime + ':\n\n' + err.message);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.remove();
}

// ============================================================================
// COMPILED BINARY MANAGEMENT
// ============================================================================

const compileBinariesController = window.CompileProjectBinaries &&
  typeof window.CompileProjectBinaries.createBinariesController === 'function'
  ? window.CompileProjectBinaries.createBinariesController({ closeModal })
  : null;

async function checkCompiledBinaries() {
  if (!compileBinariesController) return;
  await compileBinariesController.checkCompiledBinaries();
}

async function deleteCompiledBinary(binaryType) {
  if (!compileBinariesController) return;
  await compileBinariesController.deleteCompiledBinary(binaryType);
}

async function confirmDeleteBinary(binaryType) {
  if (!compileBinariesController) return;
  await compileBinariesController.confirmDeleteBinary(binaryType);
}

window.checkCompiledBinaries = checkCompiledBinaries;
window.deleteCompiledBinary = deleteCompiledBinary;
window.confirmDeleteBinary = confirmDeleteBinary;

// ============================================================================
