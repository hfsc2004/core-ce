const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadModelHelpers() {
  const sourcePath = path.join(__dirname, 'terminal-renderer-commands-models.js');
  const context = {
    window: {},
    console,
    localStorage: {
      setItem() {},
      getItem() { return ''; }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.window.TerminalCommandsModels.createModelCommandHelpers;
}

function testLlamaCppModelChangePersistsProviderDefaults() {
  const createModelCommandHelpers = loadModelHelpers();
  let currentModel = '';
  let llamaPath = '';
  let providerModel = '';
  let persisted = 0;
  let cleared = 0;
  const helpers = createModelCommandHelpers({
    getProvider: () => 'llama.cpp',
    getTerminalPort: () => 52454,
    getCurrentModel: () => currentModel,
    setCurrentModel: (value) => { currentModel = value; },
    setProviderModelId: (value) => { providerModel = value; },
    getLlamaCppModelPath: () => llamaPath,
    setLlamaCppModelPath: (value) => { llamaPath = value; },
    persistTerminalModelConfig: () => { persisted += 1; },
    clearConversationHistory: () => { cleared += 1; },
    addSystemMessage: () => {},
    addErrorMessage: () => {}
  });

  helpers.handleModelChange({
    target: {
      value: 'gemma-3-4b-it-mm',
      selectedOptions: [{ dataset: { llamaPath: '/models/gemma-3-4b-it-mm.gguf' } }]
    }
  });

  assert.strictEqual(currentModel, 'gemma-3-4b-it-mm');
  assert.strictEqual(providerModel, 'gemma-3-4b-it-mm');
  assert.strictEqual(llamaPath, '/models/gemma-3-4b-it-mm.gguf');
  assert.strictEqual(persisted, 1);
  assert.strictEqual(cleared, 1);
}

testLlamaCppModelChangePersistsProviderDefaults();
console.log('terminal-renderer-commands-models regression tests passed');
