/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
'use strict';

const path = require('path');
const {
  MOD_API_MIN,
  MOD_API_MAX,
  SUPPORTED_EDITIONS,
  KNOWN_CAPABILITIES
} = require('./mod-constants');
const {
  isPlainObject,
  readJsonFile,
  normalizeStringArray,
  makeResult,
  fail
} = require('./mod-manager-common');

function parseManifest(input) {
  if (typeof input === 'string') {
    return JSON.parse(input);
  }
  if (!isPlainObject(input)) {
    throw new Error('manifest must be an object or JSON string');
  }
  return JSON.parse(JSON.stringify(input));
}

function validateManifest(manifestInput, options = {}) {
  const result = makeResult();
  const apiMin = Number.isInteger(options.apiMin) ? options.apiMin : MOD_API_MIN;
  const apiMax = Number.isInteger(options.apiMax) ? options.apiMax : MOD_API_MAX;
  const capabilitySet = new Set(options.knownCapabilities || KNOWN_CAPABILITIES);

  let manifest = null;
  try {
    manifest = parseManifest(manifestInput);
  } catch (err) {
    fail(result, `invalid manifest JSON: ${err.message}`);
    return { ...result, manifest: null };
  }

  if (!isPlainObject(manifest)) {
    fail(result, 'manifest must be an object');
    return { ...result, manifest: null };
  }

  validateRequiredString(result, manifest, 'id', /^[a-z0-9._-]+$/);
  validateRequiredString(result, manifest, 'name');
  validateRequiredString(result, manifest, 'version', /^\d+\.\d+\.\d+([.-][A-Za-z0-9]+)?$/);
  validateRequiredString(result, manifest, 'entrypoint');

  if (!Number.isInteger(manifest.apiVersion) || manifest.apiVersion < 1) {
    fail(result, 'apiVersion must be an integer >= 1');
  }

  if (!isPlainObject(manifest.apiRange)) {
    fail(result, 'apiRange is required and must be an object');
  } else {
    const min = manifest.apiRange.min;
    const max = manifest.apiRange.max;
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      fail(result, 'apiRange.min and apiRange.max must be integers');
    } else {
      if (min > max) fail(result, 'apiRange.min must be <= apiRange.max');
      if (max < apiMin || min > apiMax) {
        fail(result, `apiRange [${min}, ${max}] incompatible with host API [${apiMin}, ${apiMax}]`);
      }
    }
  }

  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    fail(result, 'capabilities must be a non-empty array');
  } else {
    const normalizedCapabilities = normalizeStringArray(manifest.capabilities);
    if (normalizedCapabilities.length !== manifest.capabilities.length) {
      fail(result, 'capabilities cannot include empty values');
    }
    for (const capability of normalizedCapabilities) {
      if (!capabilitySet.has(capability)) {
        fail(result, `unknown capability: ${capability}`);
      }
    }
    manifest.capabilities = Array.from(new Set(normalizedCapabilities));
  }

  if (manifest.editionSupport !== undefined) {
    if (!Array.isArray(manifest.editionSupport) || manifest.editionSupport.length === 0) {
      fail(result, 'editionSupport must be a non-empty array when provided');
    } else {
      const editions = normalizeStringArray(manifest.editionSupport).map((item) => item.toLowerCase());
      for (const edition of editions) {
        if (!SUPPORTED_EDITIONS.includes(edition)) {
          fail(result, `unsupported edition in editionSupport: ${edition}`);
        }
      }
      manifest.editionSupport = Array.from(new Set(editions));
    }
  } else {
    manifest.editionSupport = [...SUPPORTED_EDITIONS];
  }

  if (!path.basename(manifest.entrypoint || '').length) {
    fail(result, 'entrypoint must be a file path');
  }

  return { ...result, manifest: result.ok ? manifest : null };
}

function validateRequiredString(result, object, key, regex) {
  const value = object[key];
  if (typeof value !== 'string' || !value.trim()) {
    fail(result, `${key} is required and must be a non-empty string`);
    return;
  }
  if (regex && !regex.test(value.trim())) {
    fail(result, `${key} has invalid format`);
  }
}

function loadAndValidateManifest(manifestPath, options = {}) {
  const manifest = readJsonFile(manifestPath);
  const validation = validateManifest(manifest, options);
  return {
    ...validation,
    path: manifestPath
  };
}

module.exports = {
  parseManifest,
  validateManifest,
  loadAndValidateManifest
};

