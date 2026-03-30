/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const SPLIT_FILE_PATTERN = /-(\d{5})-of-(\d{5})\.gguf$/i;

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    })
  ]);
}

function getMergedFilename(filename) {
  if (SPLIT_FILE_PATTERN.test(filename)) {
    return filename.replace(SPLIT_FILE_PATTERN, '.gguf');
  }
  return filename;
}

module.exports = {
  withTimeout,
  getMergedFilename
};
