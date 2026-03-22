/**
 * ============================================================================
 * IPC HANDLERS REGISTRY
 * ============================================================================
 *
 * Central registration point that composes domain-specific handler maps.
 *
 * @module ipc-handlers
 * @version 1.1.2 - March 5, 2026
 * ============================================================================
 */

const { createHardwareHandlers } = require('./ipc-handlers/hardware');
const { createHuggingFaceHandlers } = require('./ipc-handlers/huggingface');
const { createAttachmentHandlers } = require('./ipc-handlers/attachments');
const { createCatalogHandlers } = require('./ipc-handlers/catalog');
const { createVersionHandlers } = require('./ipc-handlers/version');
const { createModelFileHandlers } = require('./ipc-handlers/modelfile');
const { createFileOpsHandlers } = require('./ipc-handlers/fileops');
const { createOllamaHandlers } = require('./ipc-handlers/ollama');
const { createWebStackHandlers } = require('./ipc-handlers/web-stack');
const { createCompileHandlers } = require('./ipc-handlers/compile');
const { createLicenseDocHandlers } = require('./ipc-handlers/license-docs');
const { createBlobModelHandlers } = require('./ipc-handlers/blob-models');
const { createModelOrderingHandlers } = require('./ipc-handlers/model-ordering');
const { createBinaryVersionHandlers } = require('./ipc-handlers/binary-versions');
const { createSettingsHandlers } = require('./ipc-handlers/settings');
const { createShellHandlers } = require('./ipc-handlers/shell');
const { createMoEHandlers } = require('./ipc-handlers/moe');
const { createDeterministicToolHandlers } = require('./ipc-handlers/deterministic-tools');
const { createSessionMemoryHandlers } = require('./ipc-handlers/session-memory');
const { createTerminalExportHandlers } = require('./ipc-handlers/terminal-export');
const { createRlmHandlers } = require('./ipc-handlers/rlm');
const { createVoiceToTextHandlers } = require('./ipc-handlers/voice-to-text');
const { createModHandlers } = require('./ipc-handlers/mods');

const handlers = {
  ...createHardwareHandlers(),
  ...createHuggingFaceHandlers(),
  ...createAttachmentHandlers(),
  ...createCatalogHandlers(),
  ...createVersionHandlers(),
  ...createModelFileHandlers(),
  ...createFileOpsHandlers(),
  ...createOllamaHandlers(),
  ...createWebStackHandlers(),
  ...createCompileHandlers(),
  ...createLicenseDocHandlers(),
  ...createBlobModelHandlers(),
  ...createModelOrderingHandlers(),
  ...createBinaryVersionHandlers(),
  ...createSettingsHandlers(),
  ...createShellHandlers(),
  ...createMoEHandlers(),
  ...createDeterministicToolHandlers(),
  ...createSessionMemoryHandlers(),
  ...createTerminalExportHandlers(),
  ...createRlmHandlers(),
  ...createVoiceToTextHandlers(),
  ...createModHandlers()
};

function registerAll(ipcMain, context) {
  const registeredCount = Object.keys(handlers).length;
  console.log(`[IPC Handlers] Registering ${registeredCount} handlers...`);

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(context, event, ...args);
      } catch (err) {
        console.error(`[IPC:${channel}] Error:`, err);
        return { success: false, error: err.message };
      }
    });
  }

  console.log(`[IPC Handlers] ✅ Registered ${registeredCount} handlers`);
  return registeredCount;
}

function getChannels() {
  return Object.keys(handlers);
}

function getStats() {
  const channels = Object.keys(handlers);
  const domains = {};

  for (const channel of channels) {
    const domain = channel.split('-')[0];
    domains[domain] = (domains[domain] || 0) + 1;
  }

  return {
    total: channels.length,
    byDomain: domains
  };
}

module.exports = {
  handlers,
  registerAll,
  getChannels,
  getStats
};
