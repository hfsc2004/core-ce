/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const fs = require('fs');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function makeResult() {
  return {
    ok: true,
    errors: [],
    warnings: []
  };
}

function fail(result, message) {
  result.ok = false;
  result.errors.push(message);
}

module.exports = {
  isPlainObject,
  readJsonFile,
  normalizeStringArray,
  makeResult,
  fail
};

