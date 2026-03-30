/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * MoE config constants and enum lists.
 */

const CONFIG_FILENAME = 'config/relay/moe-pipeline.json';
const LEGACY_CONFIG_FILENAME = 'moe-pipeline.json';
const PROFILES_DIRNAME = 'config/relay/moe-pipelines';
const LEGACY_PROFILES_DIRNAME = 'moe-pipelines';
const DEFAULT_PROFILE_NAME = 'default';
const CURRENT_SCHEMA_VERSION = '1.0';

const VALID_ITEM_TYPES = ['agent', 'channel', 'gateway', 'bindings', 'endpoint_registry', 'cli_agent'];
const VALID_ROUTING_MODES = ['dynamic', 'static'];
const VALID_CHANNEL_DIRECTIONS = ['bidirectional', 'unidirectional'];
const VALID_CHANNEL_FLOW_CONDITIONS = ['always', 'on_success', 'on_failure', 'on_match'];
const VALID_CHANNEL_FAILURE_POLICIES = ['stop', 'continue'];
const VALID_GATEWAY_POSITIONS = ['input', 'output'];

module.exports = {
  CONFIG_FILENAME,
  LEGACY_CONFIG_FILENAME,
  PROFILES_DIRNAME,
  LEGACY_PROFILES_DIRNAME,
  DEFAULT_PROFILE_NAME,
  CURRENT_SCHEMA_VERSION,
  VALID_ITEM_TYPES,
  VALID_ROUTING_MODES,
  VALID_CHANNEL_DIRECTIONS,
  VALID_CHANNEL_FLOW_CONDITIONS,
  VALID_CHANNEL_FAILURE_POLICIES,
  VALID_GATEWAY_POSITIONS
};
