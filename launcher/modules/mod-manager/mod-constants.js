/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const MOD_API_MIN = 1;
const MOD_API_MAX = 1;

const SUPPORTED_EDITIONS = Object.freeze([
  'standard',
  'enterprise',
  'datacenter',
  'government'
]);

const KNOWN_CAPABILITIES = Object.freeze([
  'ui.panel',
  'commands.register',
  'events.subscribe.session',
  'events.subscribe.models',
  'events.emit.custom',
  'pipeline.stage',
  'storage.scoped',
  'network.http',
  'voice.capture',
  'voice.stt',
  'voice.tts'
]);

module.exports = {
  MOD_API_MIN,
  MOD_API_MAX,
  SUPPORTED_EDITIONS,
  KNOWN_CAPABILITIES
};

