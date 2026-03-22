/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function convertDigestFormat(digest, targetFormat = 'colon') {
  if (targetFormat === 'dash') {
    return String(digest || '').replace('sha256:', 'sha256-');
  }
  return String(digest || '').replace('sha256-', 'sha256:');
}

function getStatusIcon(status) {
  switch (status) {
    case 'complete': return '✔';
    case 'partial': return '⚠';
    case 'missing': return '✗';
    case 'error': return '⚡';
    default: return '?';
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'complete': return 'success';
    case 'partial': return 'warning';
    case 'missing': return 'danger';
    case 'error': return 'error';
    default: return 'unknown';
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  convertDigestFormat,
  getStatusIcon,
  getStatusColor,
  formatBytes
};
