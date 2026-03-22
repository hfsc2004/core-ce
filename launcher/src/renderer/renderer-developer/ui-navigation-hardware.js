/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

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
        html += '<h3 style="color: #00ff88; margin-top: 0;">⚡ GPU-Accelerated (Best Performance)</h3>';
        html += '<p style="color: #aaa; font-size: 14px; margin-bottom: 15px;">These models run efficiently on your GPU</p>';
        html += recommendations.gpu_accelerated.map(rec => `
          <div class="recommendation-item" style="border-left: 3px solid #00ff88;" data-rec-id="${rec.id}" data-rec-collection="${rec.collectionId}" data-rec-filename="${rec.filename}">
            <h4>${rec.name} ${rec.supports_vision ? '👁️' : ''}</h4>
            <p class="model-size">${rec.model_size_gb.toFixed(1)} GB model • ${rec.compatibility.requirements.baseline_gb.toFixed(1)} GB baseline</p>
            <p style="color: #00ff88;">${rec.reason}</p>
            <p style="color: #888; font-size: 12px;">Min: ${rec.compatibility.requirements.min_vram_gb}GB VRAM | Rec: ${rec.compatibility.requirements.recommended_vram_gb}GB VRAM</p>
            <button class="btn-primary btn-sm rec-download-btn" id="rec-download-${rec.id}" onclick="downloadModel('${rec.id}', '${rec.url}', '${rec.collectionId}', '${rec.filename}', '${rec.projector_url}', '${rec.projector_filename}', '${rec.sha256}')">
              Download${rec.supports_vision ? ' + Projector' : ''}
            </button>
            <button class="btn-primary btn-sm rec-launch-btn" id="rec-launch-${rec.id}" style="display: none; background: rgba(0,255,136,0.2); border-color: #00ff88;" onclick="launchInOllama('${rec.collectionId}','${rec.filename}','${rec.projector_filename}')">
              🚀 Launch in Ollama
            </button>
          </div>
        `).join('');
      }

      if (recommendations.cpu_capable.length > 0) {
        html += '<h3 style="color: var(--psf-accent, #00d4ff); margin-top: 25px;">💻 CPU Mode (Slower but Capable)</h3>';
        html += '<p style="color: #aaa; font-size: 14px; margin-bottom: 15px;">These models run on system RAM - performance varies</p>';
        html += recommendations.cpu_capable.map(rec => `
          <div class="recommendation-item" style="border-left: 3px solid var(--psf-accent, #00d4ff);" data-rec-id="${rec.id}" data-rec-collection="${rec.collectionId}" data-rec-filename="${rec.filename}">
            <h4>${rec.name} ${rec.supports_vision ? '👁️' : ''}</h4>
            <p class="model-size">${rec.model_size_gb.toFixed(1)} GB model</p>
            <p style="color: var(--psf-accent, #00d4ff);">${rec.reason}</p>
            <p style="color: #888; font-size: 12px;">Min: ${rec.compatibility.requirements.min_ram_gb}GB RAM | Max context: ${Math.round(rec.compatibility.cpu.max_context / 1000)}K</p>
            <button class="btn-primary btn-sm rec-download-btn" id="rec-download-${rec.id}" onclick="downloadModel('${rec.id}', '${rec.url}', '${rec.collectionId}', '${rec.filename}', '${rec.projector_url}', '${rec.projector_filename}', '${rec.sha256}')">
              Download${rec.supports_vision ? ' + Projector' : ''}
            </button>
            <button class="btn-primary btn-sm rec-launch-btn" id="rec-launch-${rec.id}" style="display: none; background: rgba(0,255,136,0.2); border-color: #00ff88;" onclick="launchInOllama('${rec.collectionId}','${rec.filename}','${rec.projector_filename}')">
              🚀 Launch in Ollama
            </button>
          </div>
        `).join('');
      }

      if (recommendations.insufficient.length > 0) {
        html += '<h3 style="color: #ff6b6b; margin-top: 25px;">🚫 Does Not Meet Specifications</h3>';
        html += '<p style="color: #aaa; font-size: 14px; margin-bottom: 15px;">These models exceed your current hardware capabilities</p>';
        html += recommendations.insufficient.map(rec => `
          <div class="recommendation-item" style="border-left: 3px solid #ff6b6b; opacity: 0.7;">
            <h4 style="color: #ff6b6b;">${rec.name} ${rec.supports_vision ? '👁️' : ''}</h4>
            <p class="model-size">${rec.model_size_gb.toFixed(1)} GB model</p>
            <p style="color: #ff6b6b;">${rec.compatibility.message}</p>
            <div style="color: #888; font-size: 12px; margin-top: 8px;">
              <div><strong>Requirements:</strong></div>
              <div>• GPU: ${rec.compatibility.requirements.min_vram_gb}GB VRAM min (${rec.compatibility.requirements.recommended_vram_gb}GB recommended)</div>
              <div>• CPU: ${rec.compatibility.requirements.min_ram_gb}GB RAM min (${rec.compatibility.requirements.recommended_ram_gb}GB recommended)</div>
              <div>• Context: ${Math.round(rec.compatibility.requirements.max_context / 1000)}K max supported</div>
            </div>
            <button class="btn-secondary btn-sm" style="width: 100%; margin-top: 10px; opacity: 0.6;" onclick="openExternal('${rec.url}')">
              View on HuggingFace
            </button>
          </div>
        `).join('');
      }

      recDiv.innerHTML = html;

      await checkRecommendationStatus();

      loadingDiv.style.display = 'none';
      displayDiv.style.display = 'grid';
    } catch (err) {
      console.error('Hardware detection failed:', err);
      loadingDiv.innerHTML = '<p style="color: #ff6b6b;">Hardware detection failed. Check console for details.</p>';
    }
  }

  async function getRecommendations(hardware) {
    try {
      const catalog = await window.electronAPI.getMasterCatalog();

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

      const modelCompatibilities = await Promise.all(
        allModels.map(async model => {
          const compat = await window.electronAPI.getModelCompatibility(model);
          return { ...model, compatibility: compat };
        })
      );

      const compatibleModels = modelCompatibilities.filter(m => m.compatibility.canRun);

      const scoredModels = compatibleModels.map(model => {
        let score = 0;
        const compat = model.compatibility;

        if (compat.verdict === 'excellent') score += 200;
        else if (compat.verdict === 'good') score += 150;
        else if (compat.verdict === 'marginal') score += 50;
        else if (compat.verdict === 'cpu_recommended') score += 75;

        if (compat.gpu.verdict === 'excellent' || compat.gpu.verdict === 'good') {
          score += 100;
        }

        score += Math.min(50, compat.gpu.max_context / 1000);

        if (model.collection.includes('quick-start') || model.collection.includes('daily-driver')) {
          score += 30;
        }

        if (model.use_cases && model.use_cases.includes('general chat')) {
          score += 20;
        }

        return { ...model, score };
      });

      scoredModels.sort((a, b) => b.score - a.score);

      const recommendations = {
        gpu_accelerated: [],
        cpu_capable: [],
        insufficient: []
      };

      for (const model of scoredModels) {
        const compat = model.compatibility;
        const modelSizeGB = model.size_mb ? model.size_mb / 1024 : 0;

        let reason = compat.message;
        if (compat.gpu.max_context > 0 && compat.gpu.verdict !== 'insufficient') {
          reason += ` • Max ${Math.round(compat.gpu.max_context / 1000)}K context on GPU`;
        }

        const recommendation = {
          id: model.id,
          name: model.name,
          url: model.download_url || model.url,
          reason,
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

        if (compat.gpu.verdict === 'excellent' || compat.gpu.verdict === 'good' || compat.gpu.verdict === 'marginal') {
          recommendations.gpu_accelerated.push(recommendation);
        } else {
          recommendations.cpu_capable.push(recommendation);
        }
      }

      const incompatibleModels = modelCompatibilities
        .filter(m => !m.compatibility.canRun)
        .sort((a, b) => (a.size_mb || 0) - (b.size_mb || 0));

      for (const model of incompatibleModels) {
        const compat = model.compatibility;
        const modelSizeGB = model.size_mb ? model.size_mb / 1024 : 0;

        recommendations.insufficient.push({
          id: model.id,
          name: model.name,
          url: model.download_url || model.url,
          collection: model.collection,
          collectionId: model.collection,
          collection_name: model.collection_name,
          model_size_gb: modelSizeGB,
          supports_vision: model.supports_vision || false,
          compatibility: compat
        });
      }

      return recommendations;
    } catch (err) {
      console.error('Failed to load catalog for recommendations:', err);
      return { gpu_accelerated: [], cpu_capable: [], insufficient: [] };
    }
  }

  async function checkRecommendationStatus() {
    const recItems = document.querySelectorAll('[data-rec-id]');
    const getMergedFilename = window.UINavigationShared?.getMergedFilename || ((v) => v);

    for (const item of recItems) {
      const modelId = item.getAttribute('data-rec-id');
      const collection = item.getAttribute('data-rec-collection');
      const filename = item.getAttribute('data-rec-filename');

      if (!modelId || !collection || !filename) continue;

      const actualFilename = getMergedFilename(filename);
      const modelPath = `models/${collection}/${actualFilename}`;
      const exists = await window.electronAPI.checkFileExists(modelPath);

      const downloadBtn = document.getElementById(`rec-download-${modelId}`);
      const launchBtn = document.getElementById(`rec-launch-${modelId}`);

      if (exists) {
        if (downloadBtn) downloadBtn.style.display = 'none';
        if (launchBtn) launchBtn.style.display = 'inline-block';
      } else {
        if (downloadBtn) downloadBtn.style.display = 'inline-block';
        if (launchBtn) launchBtn.style.display = 'none';
      }
    }
  }

  window.UINavigationHardware = {
    detectHardware,
    getRecommendations,
    checkRecommendationStatus
  };
})();
