'use strict';
const crypto = require('node:crypto');
const { INSTRUCTIONS, settings } = require('./moe-kt-emulator');
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = value => typeof value === 'string' && value.trim() && value.length <= 200;
const SHAPES = {
  subject: ['role', 'runtime', 'persistent'], observation: ['id', 'version'],
  projection: ['id', 'version', 'seed'], delta: ['id', 'version', 'parameters'],
  mapping: ['id', 'version', 'parameters'],
  drive: ['mode', 'positiveInstruction', 'negativeInstruction', 'noise', 'zeroPolicy'],
  trigger: ['id'], reset: ['modelState', 'emulator', 'baseline', 'emulatorSettings'],
  logging: ['enabled', 'maxRecords', 'fields']
};
const LOG_FIELDS = ['observation', 'projection', 'delta', 'drive', 'emulator', 'errors', 'lifecycle'];
function defaults() {
  return { subject: { role: 'subject', runtime: 'llama.cpp', persistent: true },
    observation: { id: null, version: null }, projection: { id: null, version: null, seed: 1 },
    delta: { id: null, version: null, parameters: {} }, mapping: { id: null, version: null, parameters: {} },
    drive: { mode: 'single-instruction', positiveInstruction: null, negativeInstruction: null, noise: 0, zeroPolicy: 'skip' },
    trigger: { id: 'manual' }, reset: { modelState: 'preserve', emulator: 'preserve', baseline: 'new-on-start',
      emulatorSettings: { seed: 1, model: 'float', init: 'medium', read_noise: 0.02 } },
    logging: { enabled: true, maxRecords: 1000, fields: [...LOG_FIELDS] } };
}
function checkKeys(value, allowed, label) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`Unknown or invalid ${label} fields`);
}
function checkNumbers(value, label) {
  if (!plain(value) || Object.keys(value).length > 32 || Object.entries(value).some(([key, v]) =>
    !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`${label} parameters must be named finite numbers`);
}
function merge(definition, patch) {
  checkKeys(patch, Object.keys(SHAPES), 'experiment');
  const next = clone(definition);
  for (const [section, values] of Object.entries(patch)) {
    checkKeys(values, SHAPES[section], section);
    next[section] = { ...next[section], ...clone(values) };
  }
  validateShape(next);
  return next;
}
function validateShape(d) {
  checkKeys(d, Object.keys(SHAPES), 'experiment');
  for (const [section, keys] of Object.entries(SHAPES)) checkKeys(d[section], keys, section);
  if (d.subject.role !== 'subject' || d.subject.runtime !== 'llama.cpp' || d.subject.persistent !== true) throw new Error('Subject requires persistent llama.cpp');
  for (const key of ['observation', 'projection', 'delta', 'mapping']) {
    for (const field of ['id', 'version']) if (d[key][field] !== null && !text(d[key][field])) throw new Error(`Invalid ${key} ${field}`);
  }
  if (!Number.isSafeInteger(d.projection.seed) || d.projection.seed < 0) throw new Error('Projection seed must be a non-negative safe integer');
  checkNumbers(d.delta.parameters, 'Delta'); checkNumbers(d.mapping.parameters, 'Mapping');
  if (!['single-instruction', 'read-feedback'].includes(d.drive.mode === undefined ? 'single-instruction' : d.drive.mode)) throw new Error('Invalid drive mode');
  for (const key of ['positiveInstruction', 'negativeInstruction']) if (d.drive[key] !== null && !INSTRUCTIONS.includes(d.drive[key])) throw new Error(`Invalid ${key}`);
  if (!Number.isFinite(d.drive.noise) || d.drive.noise < 0 || d.drive.noise > 1) throw new Error('Drive noise must be between 0 and 1');
  if (d.drive.zeroPolicy !== 'skip') throw new Error('Only declared zero policy skip is available');
  if (!['manual', 'after-persistent-turn'].includes(d.trigger.id)) throw new Error('Invalid trigger');
  for (const key of ['modelState', 'emulator']) if (!['preserve', 'reset-before-run'].includes(d.reset[key])) throw new Error(`Invalid reset ${key} policy`);
  if (d.reset.baseline !== 'new-on-start') throw new Error('Baseline must be new-on-start');
  checkKeys(d.reset.emulatorSettings, ['seed','model','init','read_noise','start_y'], 'emulator reset');
  if (['seed','model','init','read_noise'].some(key => !Object.hasOwn(d.reset.emulatorSettings, key))) throw new Error('Declare complete emulator reset settings');
  settings({ ...d.reset.emulatorSettings });
  if (typeof d.logging.enabled !== 'boolean' || !Number.isInteger(d.logging.maxRecords) || d.logging.maxRecords < 1 || d.logging.maxRecords > 10000) throw new Error('Invalid logging configuration');
  if (!Array.isArray(d.logging.fields) || d.logging.fields.some(field => !LOG_FIELDS.includes(field))) throw new Error('Invalid logging fields');
}
function completeness(d) {
  validateShape(d); const errors = [];
  for (const key of ['observation', 'projection', 'delta', 'mapping']) {
    if (!text(d[key].id) || !text(d[key].version)) errors.push(`Declare ${key} id and version`);
  }
  if (!d.drive.positiveInstruction || !d.drive.negativeInstruction) errors.push('Configure positive and negative kT instructions');
  return errors;
}
function manifest(definition, experimentId) {
  validateShape(definition);
  return { schemaVersion: '1.0', experimentId, definition: clone(definition) };
}
function loadManifest(value) {
  checkKeys(value, ['schemaVersion', 'experimentId', 'definition'], 'manifest');
  if (value.schemaVersion !== '1.0' || !text(value.experimentId)) throw new Error('Unsupported manifest schema or experiment ID');
  validateShape(value.definition);
  const loaded = clone(value);
  loaded.definition.drive.mode ??= 'single-instruction';
  return loaded;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function capabilities(native = {}) {
  const { PROJECTION, DELTA } = require('../session-manager-rwkv-observation');
  return { observations:native.observations || [], projections:[PROJECTION], deltas:[DELTA],
    mappings:[require('./moe-ngi-mapping').CAPABILITY], runtimeExecution:native.available === true,
    nativeError:native.error || null };
}
module.exports = { defaults, merge, validateShape, completeness, manifest, loadManifest, hash, capabilities, LOG_FIELDS };
