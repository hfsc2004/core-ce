/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
// ============================================================================
// PSF OFFLINE ARCHIVE COLLECTION
// Renderer - Hardware Detection
// ============================================================================
// Shared by both Standard and Developer Editions
// ============================================================================

async function detectHardware() {
  const loadingDiv = document.querySelector('.info-loading');
  const displayDiv = document.querySelector('.info-display');
  
  loadingDiv.style.display = 'block';
  displayDiv.style.display = 'none';
  
  try {
    const hardware = await window.electronAPI.detectHardware();
    
    document.getElementById('ram-info').textContent = `${hardware.ram_gb} GB`;
    document.getElementById('cpu-info').textContent = `${hardware.cpu_count} cores`;
    
    if (hardware.gpu_detected) {
      document.getElementById('gpu-info').textContent = `${hardware.gpu_vram} GB VRAM`;
    } else {
      document.getElementById('gpu-info').textContent = 'Not detected';
    }
    
    const recommendations = await getRecommendations(hardware);
    const recDiv = document.getElementById('recommended-models');
    
    let html = '';
    
    if (recommendations.gpu_accelerated.length > 0) {
      html += '<h3 style="color: #00ff88; margin-top: 0;">⚡ Best Performance (GPU-Accelerated)</h3>';
      html += '<p style="color: #aaa; font-size: 14px; margin-bottom: 15px;">These models fit in your GPU VRAM for maximum speed</p>';
      html += recommendations.gpu_accelerated.map(rec => `
        <div class="recommendation-item" style="border-left: 3px solid #00ff88;" data-rec-id="${rec.id}" data-rec-collection="${rec.collectionId}" data-rec-filename="${rec.filename}">
          <h4>${rec.name}</h4>
          <p class="model-size">${rec.model_size_gb.toFixed(2)} GB - Fits in ${hardware.gpu_vram}GB VRAM</p>
          <p>${rec.reason}</p>
          <button class="btn-primary btn-sm rec-launch-btn" id="rec-launch-${rec.id}" style="background: rgba(0,255,136,0.2); border-color: #00ff88;" onclick="launchInOllama('${rec.collectionId}','${rec.filename}','${rec.projector_filename}')">
            🚀 Launch in Ollama
          </button>
        </div>
      `).join('');
    }
    
    if (recommendations.cpu_capable.length > 0) {
      html += '<h3 style="color: var(--psf-accent, #00d4ff); margin-top: 25px;">💻 Also Compatible (CPU Inference)</h3>';
      html += '<p style="color: #aaa; font-size: 14px; margin-bottom: 15px;">These models run on system RAM - slower but still capable</p>';
      html += recommendations.cpu_capable.map(rec => `
        <div class="recommendation-item" style="border-left: 3px solid var(--psf-accent, #00d4ff);" data-rec-id="${rec.id}" data-rec-collection="${rec.collectionId}" data-rec-filename="${rec.filename}">
          <h4>${rec.name}</h4>
          <p class="model-size">${rec.model_size_gb.toFixed(2)} GB</p>
          <p>${rec.reason}</p>
          <button class="btn-primary btn-sm rec-launch-btn" id="rec-launch-${rec.id}" style="background: rgba(0,255,136,0.2); border-color: #00ff88;" onclick="launchInOllama('${rec.collectionId}','${rec.filename}','${rec.projector_filename}')">
            🚀 Launch in Ollama
          </button>
        </div>
      `).join('');
    }
    
    if (recommendations.gpu_accelerated.length === 0 && recommendations.cpu_capable.length === 0) {
      html = '<p style="color: #aaa; text-align: center;">No compatible models found in your catalog.</p>';
    }

    recDiv.innerHTML = html;
    
    loadingDiv.style.display = 'none';
    displayDiv.style.display = 'grid';
  } catch (err) {
    console.error('Hardware detection failed:', err);
    loadingDiv.innerHTML = '<p style="color: #ff6b6b;">Hardware detection failed. Check console for details.</p>';
  }
}

async function getRecommendations(hardware) {
  try {
    const catalog = await window.electronAPI.getCatalog();
    
    const allModels = [];
    for (const collectionKey in catalog.collections) {
      const collection = catalog.collections[collectionKey];
      collection.models.forEach(model => {
        allModels.push({
          ...model,
          collection: collectionKey,
          collection_name: collection.name
        });
      });
    }
    
    // Get compatibility for each model using the calculation engine
    const modelCompatibilities = await Promise.all(
      allModels.map(async model => {
        const compat = await window.electronAPI.getModelCompatibility(model);
        return { ...model, compatibility: compat };
      })
    );
    
    // Filter to only models that can run
    const compatibleModels = modelCompatibilities.filter(m => m.compatibility.canRun);
    
    // Score models based on compatibility verdict
    const scoredModels = compatibleModels.map(model => {
      let score = 0;
      const compat = model.compatibility;
      
      // Score by verdict
      if (compat.verdict === 'excellent') score += 200;
      else if (compat.verdict === 'good') score += 150;
      else if (compat.verdict === 'marginal') score += 50;
      else if (compat.verdict === 'cpu_recommended') score += 75;
      
      // Bonus for GPU-capable models on GPU systems
      if (compat.gpu.verdict === 'excellent' || compat.gpu.verdict === 'good') {
        score += 100;
      }
      
      // Bonus for higher max context
      score += Math.min(50, compat.gpu.max_context / 1000);
      
      // Bonus for quick-start collections
      if (model.collection.includes('quick-start') || model.collection.includes('daily-driver')) {
        score += 30;
      }
      
      // Bonus for general chat use cases
      if (model.use_cases && model.use_cases.includes('general chat')) {
        score += 20;
      }
      
      return { ...model, score };
    });
    
    scoredModels.sort((a, b) => b.score - a.score);
    
    const recommendations = {
      gpu_accelerated: [],
      cpu_capable: []
    };
    
    for (const model of scoredModels) {
      const compat = model.compatibility;
      const modelSizeGB = model.size_mb ? model.size_mb / 1024 : 0;
      
      // Build reason string from compatibility data
      let reason = compat.message;
      if (compat.gpu.max_context > 0 && compat.gpu.verdict !== 'insufficient') {
        reason += ` • Max ${Math.round(compat.gpu.max_context / 1000)}K context on GPU`;
      }
      
      const recommendation = {
        id: model.id,
        name: model.name,
        url: model.download_url || model.url,
        reason: reason,
        collection: model.collection,
        collectionId: model.collection,
        collection_name: model.collection_name,
        fits_in_vram: compat.gpu.verdict === 'excellent' || compat.gpu.verdict === 'good',
        model_size_gb: modelSizeGB,
        filename: model.filename || '',
        projector_url: model.projector_url || '',
        projector_filename: model.projector_filename || '',
        sha256: model.sha256 || '',
        supports_vision: model.supports_vision || false,
        compatibility: compat
      };
      
      // Categorize by GPU vs CPU
      if (compat.gpu.verdict === 'excellent' || compat.gpu.verdict === 'good' || compat.gpu.verdict === 'marginal') {
        recommendations.gpu_accelerated.push(recommendation);
      } else {
        recommendations.cpu_capable.push(recommendation);
      }
    }
    
    return recommendations;
    
  } catch (err) {
    console.error('Failed to load catalog for recommendations:', err);
    return { gpu_accelerated: [], cpu_capable: [] };
  }
}

// ============================================================================
