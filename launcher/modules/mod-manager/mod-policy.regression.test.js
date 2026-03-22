'use strict';

const assert = require('assert');

const {
  resolveProfile,
  isCapabilityAllowed,
  requiresSignature,
  evaluateCapabilities,
  getProfileRule
} = require('./mod-policy');

function testProfileResolution() {
  assert.equal(resolveProfile({ edition: 'standard' }), 'standard-default');
  assert.equal(resolveProfile({ edition: 'enterprise' }), 'enterprise-managed');
  assert.equal(resolveProfile({ edition: 'datacenter' }), 'datacenter-managed');
  assert.equal(resolveProfile({ edition: 'government' }), 'government-baseline');
  assert.equal(resolveProfile({ edition: 'government', preset: 'dod-hardened' }), 'government-dod-hardened');
}

function testCapabilityPolicy() {
  assert.equal(isCapabilityAllowed('standard-default', 'voice.capture'), true);
  assert.equal(isCapabilityAllowed('enterprise-managed', 'voice.capture'), false);
  assert.equal(isCapabilityAllowed('government-baseline', 'voice.stt'), false);
  assert.equal(isCapabilityAllowed('government-dod-hardened', 'network.http'), false);
  assert.equal(isCapabilityAllowed('government-dod-hardened', 'ui.panel'), true);
}

function testSignatureRequirements() {
  assert.equal(requiresSignature('standard-default'), true);
  assert.equal(requiresSignature('enterprise-managed'), true);
  assert.equal(requiresSignature('government-baseline'), true);
}

function testProfileRulesPresence() {
  assert.ok(getProfileRule('standard-default'));
  assert.ok(getProfileRule('government-dod-hardened'));
  assert.equal(getProfileRule('unknown-profile'), null);
}

function testEvaluateCapabilities() {
  const gov = evaluateCapabilities('government-baseline', ['ui.panel', 'voice.stt']);
  assert.equal(gov.ok, true);
  assert.deepEqual(gov.allowed, ['ui.panel']);
  assert.deepEqual(gov.denied, ['voice.stt']);

  const enterprise = evaluateCapabilities('enterprise-managed', ['commands.register', 'voice.capture']);
  assert.equal(enterprise.ok, true);
  assert.deepEqual(enterprise.allowed, ['commands.register']);
  assert.deepEqual(enterprise.denied, ['voice.capture']);

  const unknown = evaluateCapabilities('nope', ['ui.panel']);
  assert.equal(unknown.ok, false);
}

function run() {
  testProfileResolution();
  testCapabilityPolicy();
  testSignatureRequirements();
  testProfileRulesPresence();
  testEvaluateCapabilities();
  process.stdout.write('mod-policy regression tests passed\n');
}

run();
