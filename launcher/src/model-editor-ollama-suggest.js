/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Model Editor - Ollama name suggester
 * Kept separate from main renderer to reduce monolithic file size.
 */
(function() {
  'use strict';

  const MODEL_MAPPINGS = [
    { patterns: ['llama-3.2-vision', 'llama3.2-vision'], ollamaName: 'llama3.2-vision' },
    { patterns: ['llava-1.6', 'llava1.6', 'llava-v1.6'], ollamaName: 'llava' },
    { patterns: ['llava-1.5', 'llava1.5', 'llava-v1.5'], ollamaName: 'llava' },
    { patterns: ['bakllava'], ollamaName: 'bakllava' },
    { patterns: ['llava'], ollamaName: 'llava' },
    { patterns: ['llama-3.3', 'llama3.3', 'llama-3-3'], ollamaName: 'llama3.3' },
    { patterns: ['llama-3.2', 'llama3.2', 'llama-3-2'], ollamaName: 'llama3.2' },
    { patterns: ['llama-3.1', 'llama3.1', 'llama-3-1'], ollamaName: 'llama3.1' },
    { patterns: ['llama-3', 'llama3'], ollamaName: 'llama3' },
    { patterns: ['llama-2', 'llama2'], ollamaName: 'llama2' },
    { patterns: ['codellama', 'code-llama'], ollamaName: 'codellama' },
    { patterns: ['tinyllama'], ollamaName: 'tinyllama' },
    { patterns: ['gemma-3', 'gemma3'], ollamaName: 'gemma3' },
    { patterns: ['gemma-2', 'gemma2'], ollamaName: 'gemma2' },
    { patterns: ['gemma'], ollamaName: 'gemma' },
    { patterns: ['mistral-nemo'], ollamaName: 'mistral-nemo' },
    { patterns: ['mistral-small'], ollamaName: 'mistral-small' },
    { patterns: ['mistral-large'], ollamaName: 'mistral-large' },
    { patterns: ['mixtral'], ollamaName: 'mixtral' },
    { patterns: ['mistral'], ollamaName: 'mistral' },
    { patterns: ['qwen2.5-coder', 'qwen-2.5-coder'], ollamaName: 'qwen2.5-coder' },
    { patterns: ['qwen2.5', 'qwen-2.5', 'qwen-2-5'], ollamaName: 'qwen2.5' },
    { patterns: ['qwen2', 'qwen-2'], ollamaName: 'qwen2' },
    { patterns: ['qwen'], ollamaName: 'qwen' },
    { patterns: ['phi-4'], ollamaName: 'phi4' },
    { patterns: ['phi-3.5', 'phi3.5'], ollamaName: 'phi3.5' },
    { patterns: ['phi-3', 'phi3'], ollamaName: 'phi3' },
    { patterns: ['phi-2', 'phi2'], ollamaName: 'phi' },
    { patterns: ['deepseek-r1'], ollamaName: 'deepseek-r1' },
    { patterns: ['deepseek-coder-v2', 'deepseek-v2'], ollamaName: 'deepseek-coder-v2' },
    { patterns: ['deepseek-coder'], ollamaName: 'deepseek-coder' },
    { patterns: ['deepseek'], ollamaName: 'deepseek-llm' },
    { patterns: ['starcoder2', 'starcoder-2'], ollamaName: 'starcoder2' },
    { patterns: ['starcoder'], ollamaName: 'starcoder' },
    { patterns: ['wizardcoder-python'], ollamaName: 'wizardcoder-python' },
    { patterns: ['wizardcoder'], ollamaName: 'wizardcoder' },
    { patterns: ['phind-codellama'], ollamaName: 'phind-codellama' },
    { patterns: ['sqlcoder'], ollamaName: 'sqlcoder' },
    { patterns: ['yi-coder'], ollamaName: 'yi-coder' },
    { patterns: ['yi-1.5', 'yi-15'], ollamaName: 'yi' },
    { patterns: ['yi'], ollamaName: 'yi' },
    { patterns: ['smollm2', 'smollm-2'], ollamaName: 'smollm2' },
    { patterns: ['smollm'], ollamaName: 'smollm' },
    { patterns: ['stablelm-2', 'stablelm2'], ollamaName: 'stablelm2' },
    { patterns: ['stablelm'], ollamaName: 'stablelm' },
    { patterns: ['vicuna'], ollamaName: 'vicuna' },
    { patterns: ['openchat'], ollamaName: 'openchat' },
    { patterns: ['neural-chat'], ollamaName: 'neural-chat' },
    { patterns: ['orca-mini', 'orca2'], ollamaName: 'orca-mini' },
    { patterns: ['zephyr'], ollamaName: 'zephyr' },
    { patterns: ['solar'], ollamaName: 'solar' },
    { patterns: ['nous-hermes'], ollamaName: 'nous-hermes' },
    { patterns: ['dolphin-mixtral'], ollamaName: 'dolphin-mixtral' },
    { patterns: ['dolphin-phi'], ollamaName: 'dolphin-phi' },
    { patterns: ['dolphin'], ollamaName: 'dolphin-phi' },
    { patterns: ['biomistral'], ollamaName: 'biomistral' },
    { patterns: ['meditron'], ollamaName: 'meditron' },
    { patterns: ['bge-large'], ollamaName: 'bge-large' },
    { patterns: ['bge-m3'], ollamaName: 'bge-m3' },
    { patterns: ['nomic-embed'], ollamaName: 'nomic-embed-text' },
    { patterns: ['mxbai-embed'], ollamaName: 'mxbai-embed-large' },
    { patterns: ['all-minilm'], ollamaName: 'all-minilm' }
  ];

  function suggestOllamaModel() {
    const filename = document.getElementById('model-filename').value.trim().toLowerCase();
    const modelName = document.getElementById('model-name').value.trim().toLowerCase();
    if (!filename && !modelName) {
      alert('Please enter a filename or model name first.');
      return;
    }

    const source = filename || modelName;
    const sizeMatch = source.match(/(\d+\.?\d*)b(?![a-z])/i);
    const size = sizeMatch ? `${sizeMatch[1].toLowerCase()}b` : null;

    let ollamaName = null;
    for (const mapping of MODEL_MAPPINGS) {
      for (const pattern of mapping.patterns) {
        if (source.includes(pattern)) {
          ollamaName = mapping.ollamaName;
          break;
        }
      }
      if (ollamaName) break;
    }

    if (!ollamaName) {
      alert('Could not detect model family from filename.\n\nPlease enter manually (e.g., gemma3:4b, llama3.2:8b)');
      return;
    }

    const suggestion = size ? `${ollamaName}:${size}` : `${ollamaName}:latest`;
    document.getElementById('model-ollama-name').value = suggestion;

    const btn = document.getElementById('suggest-ollama-btn');
    if (btn) {
      const originalText = btn.innerHTML;
      btn.innerHTML = '&#10004; Suggested!';
      btn.style.background = '#00aa55';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = 'var(--psf-border, #0f3460)';
      }, 1500);
    }

    console.log(`[Model Editor] Suggested Ollama model: ${suggestion} (from: ${source})`);
  }

  window.suggestOllamaModel = suggestOllamaModel;
})();
