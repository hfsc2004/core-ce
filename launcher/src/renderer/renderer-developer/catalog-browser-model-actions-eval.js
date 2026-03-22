/**
 * Catalog browser evaluation action helper.
 */
(function() {
  'use strict';

  async function evaluateModelFromCatalogBrowser(options = {}) {
    const { modelId, modelName, onErrorDialog } = options;
    const evalBtn = document.getElementById(`cb-eval-btn-${modelId}`);
    const resultDiv = document.getElementById(`cb-eval-result-${modelId}`);
    const verboseToggle = document.getElementById(`cb-eval-verbose-${modelId}`);
    const logPanel = document.getElementById(`cb-eval-log-${modelId}`);
    if (!evalBtn || !resultDiv || !logPanel) return;

    const appendLog = (line) => {
      const text = String(line || '');
      if (!text) return;
      logPanel.textContent += text.endsWith('\n') ? text : `${text}\n`;
      logPanel.scrollTop = logPanel.scrollHeight;
    };

    logPanel.textContent = '';
    appendLog(`[eval] starting ${modelName || modelId}`);
    if (verboseToggle && verboseToggle.checked) {
      appendLog('[eval] verbose prompts/responses enabled');
    }

    evalBtn.disabled = true;
    evalBtn.textContent = '⏳ Evaluating...';
    resultDiv.style.display = 'block';
    resultDiv.style.background = 'var(--psf-accent-medium, rgba(0,212,255,0.2))';
    resultDiv.style.color = 'var(--psf-accent, #00d4ff)';
    const startedAt = Date.now();
    let statusLine = `Running benchmark for ${modelName || modelId}...`;
    resultDiv.textContent = statusLine;
    const elapsedTimer = setInterval(() => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      resultDiv.textContent = `${statusLine} (${elapsedSec}s)`;
    }, 1000);

    const removeProgressListener = window.electronAPI.onCatalogEvaluateProgress((payload) => {
      if (!payload || String(payload.modelId || '') !== String(modelId || '')) return;
      const stage = String(payload.stage || '').trim();
      const message = String(payload.message || '');
      if (!message) return;
      if (stage === 'evaluate-log') {
        appendLog(message);
        return;
      }
      appendLog(`[${stage || 'progress'}] ${message}`);
      statusLine = message;
    });

    try {
      const result = await window.electronAPI.evaluateCatalogModel({
        modelId,
        verbose: true
      });
      if (result?.success) {
        resultDiv.style.background = 'rgba(0,255,136,0.2)';
        resultDiv.style.color = '#00ff88';
        statusLine = `✅ ${result.message || 'Evaluation complete.'}`;
        resultDiv.textContent = statusLine;
        appendLog(`[done] ${result.message || 'Evaluation complete.'}`);
        appendLog('[done] Log preserved. Click Refresh when you want score cards reloaded.');
      } else {
        const details = String(result?.details || result?.message || 'Unknown evaluation failure.');
        resultDiv.style.background = 'rgba(255,107,107,0.2)';
        resultDiv.style.color = '#ff6b6b';
        statusLine = `❌ ${result?.message || 'Evaluation failed.'}`;
        resultDiv.textContent = statusLine;
        appendLog(`[error] ${result?.message || 'Evaluation failed.'}`);
        if (typeof onErrorDialog === 'function') onErrorDialog('Model evaluation failed', details);
      }
    } catch (err) {
      resultDiv.style.background = 'rgba(255,107,107,0.2)';
      resultDiv.style.color = '#ff6b6b';
      statusLine = `❌ Evaluation error: ${err.message}`;
      resultDiv.textContent = statusLine;
      appendLog(`[error] ${err.message}`);
      if (typeof onErrorDialog === 'function') onErrorDialog('Model evaluation error', err.message || String(err));
    } finally {
      clearInterval(elapsedTimer);
      if (removeProgressListener && typeof removeProgressListener === 'function') {
        removeProgressListener();
      }
      evalBtn.disabled = false;
      evalBtn.textContent = '🧪 Evaluate';
    }
  }

  window.CatalogBrowserModelEvalActions = { evaluateModelFromCatalogBrowser };
})();
