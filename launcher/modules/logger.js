/**
 * ============================================================================
 * PSF ROBOTICS LOGGER
 * ============================================================================
 * 
 * Standardized logging for ALL modules.
 * 
 * REPLACES:
 * - console.log()
 * - console.warn()
 * - console.error()
 * - Manual timestamp formatting
 * - Inconsistent log formats
 * 
 * USE THIS IN EVERY MODULE.
 * 
 * Author: Pseudo Science Fiction
 * Version: 1.1.2
 * Created: December 21, 2025
 * Updated: December 30, 2025 - Added 100KB log file cap with auto-truncation
 * 
 * USAGE:
 * 
 * const logger = require('./logger');
 * 
 * logger.debug('Detailed diagnostic info', { key: 'value' });
 * logger.info('Normal operation', { port: 52434 });
 * logger.warn('Warning condition', { available: 2, total: 10 });
 * logger.error('Error occurred', { error: err, context: 'download' });
 * 
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Maximum log file size (100KB) - will truncate when exceeded
const MAX_LOG_SIZE = 100 * 1024; // 100KB in bytes

// Set via environment variable or default to 'info'
// NODE_ENV=development -> debug level
// NODE_ENV=production -> info level
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || 
  (process.env.NODE_ENV === 'development' ? 'debug' : 'info');

// Log file path (if file logging enabled)
const LOG_FILE = process.env.LOG_FILE || null;

// Console colors (for terminal output)
const COLORS = {
  debug: '\x1b[36m',  // Cyan
  info: '\x1b[32m',   // Green
  warn: '\x1b[33m',   // Yellow
  error: '\x1b[31m',  // Red
  reset: '\x1b[0m'
};

// ============================================================================
// CORE LOGGING FUNCTIONS
// ============================================================================

/**
 * Format a log message with timestamp, level, and optional metadata
 * 
 * @private
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} message - Log message
 * @param {Object} [metadata={}] - Additional context data
 * @returns {string} Formatted log message
 */
function formatMessage(level, message, metadata = {}) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const levelUpper = level.toUpperCase().padEnd(5);
  
  // Get caller module name (if available)
  const stack = new Error().stack;
  const callerLine = stack.split('\n')[4]; // 4th line has the actual caller
  const moduleMatch = callerLine ? callerLine.match(/at .*[\/\\]([^\/\\]+\.js)/) : null;
  const moduleName = moduleMatch ? moduleMatch[1].replace('.js', '') : 'unknown';
  
  // Build message
  let formatted = `[${timestamp}] [${levelUpper}] [${moduleName}] ${message}`;
  
  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    formatted += ' ' + JSON.stringify(metadata);
  }
  
  return formatted;
}

/**
 * Check and rotate log file if it exceeds MAX_LOG_SIZE
 * Keeps the last ~50% of the log to preserve recent history
 * 
 * @private
 * @param {string} logFile - Path to log file
 */
function checkLogSize(logFile) {
  try {
    if (!fs.existsSync(logFile)) return;
    
    const stats = fs.statSync(logFile);
    if (stats.size > MAX_LOG_SIZE) {
      // Read current content
      const content = fs.readFileSync(logFile, 'utf8');
      
      // Keep the last ~50% (find a newline boundary near the middle)
      const keepFrom = Math.floor(content.length * 0.5);
      const newlineIndex = content.indexOf('\n', keepFrom);
      
      if (newlineIndex !== -1) {
        const truncatedContent = '=== LOG TRUNCATED ===\n' + content.substring(newlineIndex + 1);
        fs.writeFileSync(logFile, truncatedContent, 'utf8');
      } else {
        // No newline found, just keep last half
        fs.writeFileSync(logFile, '=== LOG TRUNCATED ===\n' + content.substring(keepFrom), 'utf8');
      }
    }
  } catch (err) {
    // Silently fail - don't want to break logging
    console.error('Log rotation failed:', err.message);
  }
}

/**
 * Write log to console and/or file
 * 
 * @private
 * @param {string} level - Log level
 * @param {string} formattedMessage - Pre-formatted message
 */
function writeLog(level, formattedMessage) {
  // Console output (with colors)
  const color = COLORS[level] || COLORS.reset;
  console.log(color + formattedMessage + COLORS.reset);
  
  // File output (if enabled) - check process.env for dynamic updates
  const logFile = process.env.LOG_FILE;
  if (logFile) {
    try {
      // Check size before writing (every write)
      checkLogSize(logFile);
      
      fs.appendFileSync(logFile, formattedMessage + '\n', 'utf8');
    } catch (err) {
      // Can't log the error without causing recursion, so just console.error
      console.error('Failed to write to log file:', err.message);
    }
  }
}

/**
 * Generic log function
 * 
 * @private
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} [metadata={}] - Additional context
 */
function log(level, message, metadata = {}) {
  // Check if this level should be logged - use process.env for dynamic updates
  const currentLevel = process.env.LOG_LEVEL || CURRENT_LOG_LEVEL;
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return; // Skip this log
  }
  
  const formatted = formatMessage(level, message, metadata);
  writeLog(level, formatted);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Log debug message (detailed diagnostic info)
 * Only logged in development mode
 * 
 * @param {string} message - Debug message
 * @param {Object} [metadata={}] - Additional context
 * 
 * @example
 * logger.debug('GPU detection started', { platform: 'win32', arch: 'x64' });
 */
function debug(message, metadata = {}) {
  log('debug', message, metadata);
}

/**
 * Log info message (normal operational messages)
 * 
 * @param {string} message - Info message
 * @param {Object} [metadata={}] - Additional context
 * 
 * @example
 * logger.info('Ollama server started', { port: 52434, pid: 12345 });
 */
function info(message, metadata = {}) {
  log('info', message, metadata);
}

/**
 * Log warning message (warning conditions, recoverable issues)
 * 
 * @param {string} message - Warning message
 * @param {Object} [metadata={}] - Additional context
 * 
 * @example
 * logger.warn('Port allocation near limit', { available: 2, total: 10 });
 */
function warn(message, metadata = {}) {
  log('warn', message, metadata);
}

/**
 * Log error message (error conditions, failures)
 * 
 * @param {string} message - Error message
 * @param {Object} [metadata={}] - Additional context (should include error object)
 * 
 * @example
 * logger.error('Model download failed', { 
 *   error: err.message, 
 *   stack: err.stack,
 *   url: modelUrl 
 * });
 */
function error(message, metadata = {}) {
  log('error', message, metadata);
}

/**
 * Set log file path (enables file logging)
 * 
 * @param {string} filepath - Path to log file
 * 
 * @example
 * logger.setLogFile(path.join(__dirname, '..', 'logs', 'app.log'));
 */
function setLogFile(filepath) {
  // Ensure directory exists
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Set global LOG_FILE
  process.env.LOG_FILE = filepath;
  
  info('Log file set', { filepath: filepath });
}

/**
 * Set log level dynamically
 * 
 * @param {string} level - Log level (debug, info, warn, error)
 * 
 * @example
 * logger.setLogLevel('debug'); // Show all logs
 */
function setLogLevel(level) {
  if (!LOG_LEVELS.hasOwnProperty(level)) {
    warn('Invalid log level', { level: level, valid: Object.keys(LOG_LEVELS) });
    return;
  }
  
  process.env.LOG_LEVEL = level;
  info('Log level changed', { level: level });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Primary logging functions
  debug,
  info,
  warn,
  error,
  
  // Configuration
  setLogFile,
  setLogLevel
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * BASIC USAGE:
 * 
 * const logger = require('./logger');
 * 
 * logger.debug('Detailed info for debugging');
 * logger.info('Something happened');
 * logger.warn('Something might be wrong');
 * logger.error('Something went wrong');
 * 
 * 
 * WITH METADATA:
 * 
 * logger.info('Server started', { 
 *   port: 52434, 
 *   pid: process.pid,
 *   gpu: 'NVIDIA RTX 4090'
 * });
 * 
 * 
 * ERROR LOGGING:
 * 
 * try {
 *   await downloadModel();
 * } catch (err) {
 *   logger.error('Download failed', { 
 *     error: err.message,
 *     stack: err.stack,
 *     url: modelUrl,
 *     filepath: destPath
 *   });
 * }
 * 
 * 
 * ENABLE FILE LOGGING:
 * 
 * // In main.js startup
 * const logger = require('./modules/logger');
 * logger.setLogFile(path.join(__dirname, '..', 'logs', 'psf-archive.log'));
 * 
 * 
 * SET LOG LEVEL:
 * 
 * // Development: see all logs
 * logger.setLogLevel('debug');
 * 
 * // Production: only info and above
 * logger.setLogLevel('info');
 * 
 * 
 * ENVIRONMENT VARIABLES:
 * 
 * # Set via command line
 * LOG_LEVEL=debug node main.js
 * LOG_FILE=/path/to/app.log node main.js
 * 
 * # Or in code
 * process.env.LOG_LEVEL = 'debug';
 * process.env.LOG_FILE = '/path/to/app.log';
 * 
 * ============================================================================
 */
