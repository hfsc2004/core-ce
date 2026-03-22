/**
 * ============================================================================
 * PSF ROBOTICS ERROR HANDLER
 * ============================================================================
 * 
 * Standardized error and success response format for ALL modules.
 * 
 * USE THIS FOR:
 * - All module function returns
 * - All IPC handler responses
 * - All async operations
 * 
 * REPLACES:
 * - Raw return values
 * - Throwing exceptions (except truly exceptional cases)
 * - Inconsistent {success, message} formats
 * 
 * Author: Pseudo Science Fiction
 * Version: 1.1.2
 * Created: December 21, 2025
 * 
 * USAGE EXAMPLES:
 * 
 * // Success with data
 * return createSuccess('Model downloaded successfully', { 
 *   filepath: '/models/llama.gguf',
 *   sizeMB: 4660
 * });
 * 
 * // Error with exception
 * try {
 *   await downloadModel();
 * } catch (err) {
 *   return createError('Failed to download model', err);
 * }
 * 
 * // Error without exception
 * if (!fs.existsSync(modelPath)) {
 *   return createError('Model file not found', null, { 
 *     expectedPath: modelPath 
 *   });
 * }
 * 
 * // Simple success
 * return createSuccess('Port released successfully');
 * 
 * ============================================================================
 */

/**
 * Standard response format for ALL PSF modules
 * 
 * @typedef {Object} StandardResponse
 * @property {boolean} success - Whether operation succeeded
 * @property {string} message - Human-readable message
 * @property {string} timestamp - ISO timestamp of response
 * @property {Object} [error] - Error details (only if success=false)
 * @property {string} [error.name] - Error name (e.g., "TypeError")
 * @property {string} [error.message] - Error message
 * @property {string} [error.stack] - Stack trace (development only)
 * @property {*} [...data] - Any additional data fields
 */

/**
 * Create a standardized response object
 * 
 * @private
 * @param {boolean} success - Whether operation succeeded
 * @param {string} message - Human-readable message
 * @param {Object} data - Additional data to include
 * @returns {StandardResponse}
 */
function createResponse(success, message, data = {}) {
  return {
    success: success,
    message: message,
    timestamp: new Date().toISOString(),
    ...data
  };
}

/**
 * Create a success response
 * 
 * @param {string} message - Success message
 * @param {Object} [data={}] - Additional data to include
 * @returns {StandardResponse}
 * 
 * @example
 * return createSuccess('Model launched successfully', { 
 *   modelName: 'llama3.2',
 *   hasVision: false,
 *   port: 52434
 * });
 */
function createSuccess(message, data = {}) {
  return createResponse(true, message, data);
}

/**
 * Create an error response
 * 
 * @param {string} message - Error message (user-friendly)
 * @param {Error|null} [error=null] - Original error object (optional)
 * @param {Object} [data={}] - Additional context data
 * @returns {StandardResponse}
 * 
 * @example
 * try {
 *   await fs.promises.readFile(path);
 * } catch (err) {
 *   return createError('Failed to read catalog file', err, { 
 *     filepath: path 
 *   });
 * }
 * 
 * @example
 * if (!modelExists) {
 *   return createError('Model not found in catalog', null, {
 *     modelId: 'llama-3.2-1b',
 *     collectionId: 'quick-start'
 *   });
 * }
 */
function createError(message, error = null, data = {}) {
  const errorData = { ...data };
  
  if (error) {
    errorData.error = {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      // Only include stack trace in development
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
  
  return createResponse(false, message, errorData);
}

/**
 * Create a validation error response
 * Specifically for input validation failures
 * 
 * @param {string} message - Validation error message
 * @param {Object} [validationErrors={}] - Field-specific validation errors
 * @returns {StandardResponse}
 * 
 * @example
 * if (!modelData.id || !modelData.name) {
 *   return createValidationError('Invalid model data', {
 *     id: !modelData.id ? 'ID is required' : null,
 *     name: !modelData.name ? 'Name is required' : null
 *   });
 * }
 */
function createValidationError(message, validationErrors = {}) {
  return createError(message, null, {
    validationType: 'validation',
    validationErrors: validationErrors
  });
}

/**
 * Wrap an async function with standardized error handling
 * Automatically converts thrown errors to error responses
 * 
 * @param {Function} fn - Async function to wrap
 * @param {string} errorMessage - Default error message
 * @returns {Function} Wrapped function
 * 
 * @example
 * const downloadModel = wrapAsync(async (url, path) => {
 *   const result = await fetch(url);
 *   // ... download logic
 *   return createSuccess('Download complete', { filepath: path });
 * }, 'Failed to download model');
 * 
 * // Caller doesn't need try/catch - errors are handled
 * const result = await downloadModel(url, path);
 * if (!result.success) {
 *   console.error(result.message);
 * }
 */
function wrapAsync(fn, errorMessage) {
  return async function(...args) {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[Error Handler] ${errorMessage}:`, err);
      return createError(errorMessage, err);
    }
  };
}

/**
 * Check if a response object indicates success
 * Useful for guard clauses
 * 
 * @param {StandardResponse} response - Response to check
 * @returns {boolean}
 * 
 * @example
 * const result = await downloadModel(url, path);
 * if (!isSuccess(result)) {
 *   console.error('Download failed:', result.message);
 *   return result; // Propagate error
 * }
 */
function isSuccess(response) {
  return response && response.success === true;
}

/**
 * Check if a response object indicates error
 * 
 * @param {StandardResponse} response - Response to check
 * @returns {boolean}
 */
function isError(response) {
  return response && response.success === false;
}

/**
 * Extract error message from response
 * Returns the message if error, empty string if success
 * 
 * @param {StandardResponse} response - Response object
 * @returns {string}
 * 
 * @example
 * const result = await someOperation();
 * const errorMsg = getErrorMessage(result);
 * if (errorMsg) {
 *   showUserAlert(errorMsg);
 * }
 */
function getErrorMessage(response) {
  return isError(response) ? response.message : '';
}

/**
 * Combine multiple responses into one
 * Success only if ALL operations succeeded
 * 
 * @param {StandardResponse[]} responses - Array of responses
 * @param {string} successMessage - Message if all succeeded
 * @param {string} errorMessage - Message if any failed
 * @returns {StandardResponse}
 * 
 * @example
 * const downloadResult = await downloadModel();
 * const verifyResult = await verifyChecksum();
 * const launchResult = await launchInOllama();
 * 
 * return combineResponses(
 *   [downloadResult, verifyResult, launchResult],
 *   'Model ready to use',
 *   'Model setup failed'
 * );
 */
function combineResponses(responses, successMessage, errorMessage) {
  const failures = responses.filter(r => !isSuccess(r));
  
  if (failures.length === 0) {
    return createSuccess(successMessage, {
      operations: responses.length
    });
  }
  
  return createError(errorMessage, null, {
    failedOperations: failures.length,
    totalOperations: responses.length,
    failures: failures.map(f => ({
      message: f.message,
      error: f.error
    }))
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Primary functions (use these 99% of the time)
  createSuccess,
  createError,
  createValidationError,
  
  // Utility functions
  wrapAsync,
  isSuccess,
  isError,
  getErrorMessage,
  combineResponses,
  
  // Advanced (rarely needed)
  createResponse
};

// ============================================================================
// MIGRATION GUIDE
// ============================================================================

/**
 * HOW TO MIGRATE EXISTING CODE:
 * 
 * BEFORE:
 * -------
 * function downloadModel(url, path) {
 *   try {
 *     const result = doDownload(url, path);
 *     return { success: true, filepath: path };
 *   } catch (err) {
 *     return { success: false, message: err.message };
 *   }
 * }
 * 
 * AFTER:
 * ------
 * const { createSuccess, createError } = require('./error-handler');
 * 
 * function downloadModel(url, path) {
 *   try {
 *     const result = doDownload(url, path);
 *     return createSuccess('Model downloaded successfully', { 
 *       filepath: path,
 *       sizeMB: result.size
 *     });
 *   } catch (err) {
 *     return createError('Failed to download model', err, { 
 *       url: url 
 *     });
 *   }
 * }
 * 
 * OR EVEN SIMPLER WITH wrapAsync:
 * --------------------------------
 * const { wrapAsync, createSuccess } = require('./error-handler');
 * 
 * const downloadModel = wrapAsync(async (url, path) => {
 *   const result = await doDownload(url, path);
 *   return createSuccess('Model downloaded successfully', { 
 *     filepath: path 
 *   });
 * }, 'Failed to download model');
 * 
 * ============================================================================
 * 
 * RENDERER SIDE USAGE:
 * --------------------
 * // Old way:
 * const result = await window.electronAPI.downloadModel(url, path);
 * if (result.success) {
 *   alert('Success!');
 * } else {
 *   alert(result.message || 'Error');
 * }
 * 
 * // New way (same, but guaranteed format):
 * const result = await window.electronAPI.downloadModel(url, path);
 * if (result.success) {
 *   console.log(`${result.message} at ${result.timestamp}`);
 *   console.log('Filepath:', result.filepath);
 * } else {
 *   console.error(`Error: ${result.message}`);
 *   if (result.error) {
 *     console.error('Details:', result.error.message);
 *   }
 * }
 * 
 * ============================================================================
 */
