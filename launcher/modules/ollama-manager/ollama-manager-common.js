/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Pseudo Science Fiction Core Collection - Ollama Manager Common
 * Shared HTTP operations for Ollama across platforms.
 */

const helpers = require('./ollama-manager-common-helpers');
const createCommonChatApi = require('./ollama-manager-common-chat');
const createCommonLaunchApi = require('./ollama-manager-common-launch');

let platformModule;
function getPlatformModule() {
  if (!platformModule) {
    const index = require('./ollama-manager');
    platformModule = index;
  }
  return platformModule;
}

const chatApi = createCommonChatApi({ getPlatformModule });
const launchApi = createCommonLaunchApi({
  getPlatformModule,
  checkOllamaRunning: chatApi.checkOllamaRunning,
  listModels: chatApi.listModels,
  helpers
});

module.exports = {
  checkOllamaRunning: chatApi.checkOllamaRunning,
  sendMessage: chatApi.sendMessage,
  sendMessageStream: chatApi.sendMessageStream,
  stopMessageStream: chatApi.stopMessageStream,
  listModels: chatApi.listModels,
  launchModelInOllama: launchApi.launchModelInOllama
};
