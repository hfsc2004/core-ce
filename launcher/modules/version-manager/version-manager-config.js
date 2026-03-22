/**
 * Pseudo Science Fiction Core Collection - Version Manager Configuration
 * Configuration constants for version management
 * 
 * @module version-manager-config
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 * @license SEE LICENSE.txt
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// File extensions that can have version tags
const TAGGABLE_EXTENSIONS = ['.js', '.json', '.html', '.css', '.sh', '.bat', '.py', '.md'];

// Default copyright year (can be overridden in UI)
const DEFAULT_COPYRIGHT_YEAR = new Date().getFullYear();

// Files to always skip
const SKIP_FILES = [
  'package-lock.json',
  'binary-versions.json'  // This tracks external binary versions, not our app version
];

// File-path patterns to skip (third-party/vendor/minified artifacts)
const SKIP_PATH_PATTERNS = [
  /[/\\]src[/\\]lib[/\\]/i,
  /\.min\.(js|css)$/i
];

// Exclude these files from fallback header insertion (but still allow normal tag updates)
const HEADER_INSERT_EXCLUDE_PATH_PATTERNS = [
  /regression\.test\.js$/i,
  /(^|[/\\])FilePaths_\d+_\d+_\d+[a-z]?\.md$/i,
  /(^|[/\\])ProjectFiles_\d+_\d+_\d+[a-z]?\.md$/i
];

// Directories to always skip
const SKIP_DIRECTORIES = [
  'node_modules',
  '.git',
  'blobs',
  'manifests'
];

// JSON files that should have version field updated
const VERSIONED_JSON_FILES = [
  'package.json',
  'sku-config.json',
  'catalog.json',
  'catalog-master.json'
  // catalog-sku-*.json files are handled dynamically
];

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  TAGGABLE_EXTENSIONS,
  SKIP_FILES,
  SKIP_PATH_PATTERNS,
  HEADER_INSERT_EXCLUDE_PATH_PATTERNS,
  SKIP_DIRECTORIES,
  VERSIONED_JSON_FILES,
  DEFAULT_COPYRIGHT_YEAR
};
