/**
 * Pseudo Science Fiction Core Collection - Linux Binary Downloader
 *
 * Facade module that composes Linux download handlers.
 *
 * @module binary-download-linux
 * @version 1.1.3 - March 5, 2026
 */

const { downloadOllama, extractOllamaTarball } = require('./binary-download-linux-ollama');
const { downloadNodeJS } = require('./binary-download-linux-node');
const { downloadArduinoCli } = require('./binary-download-linux-arduino');
const { downloadEsptool } = require('./binary-download-linux-esptool');

module.exports = {
  downloadOllama,
  extractOllamaTarball,
  downloadNodeJS,
  downloadArduinoCli,
  downloadEsptool
};
