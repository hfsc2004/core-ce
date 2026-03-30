/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * MoE configuration validation logic.
 */

const {
  VALID_ITEM_TYPES,
  VALID_ROUTING_MODES,
  VALID_CHANNEL_DIRECTIONS,
  VALID_CHANNEL_FLOW_CONDITIONS,
  VALID_CHANNEL_FAILURE_POLICIES,
  VALID_GATEWAY_POSITIONS
} = require('./moe-config-constants');

function validateConfig(config) {
  const errors = [];

  if (!config) {
    return { valid: false, errors: ['Configuration is null'] };
  }

  if (!Array.isArray(config.items)) {
    return { valid: false, errors: ['Configuration must have items array'] };
  }

  config.items.forEach((item, index) => {
    const itemErrors = validateItem(item, index);
    errors.push(...itemErrors);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateItem(item, index) {
  const errors = [];
  const prefix = `Item[${index}]`;

  if (!item.id) {
    errors.push(`${prefix}: missing id`);
  }

  if (!VALID_ITEM_TYPES.includes(item.type)) {
    errors.push(`${prefix}: invalid type '${item.type}'`);
  }

  switch (item.type) {
    case 'agent':
      if (!item.name) {
        errors.push(`${prefix}: agent missing name`);
      }
      if (item.provider != null) {
        const provider = String(item.provider).trim().toLowerCase();
        if (provider !== 'ollama' && provider !== 'llama.cpp') {
          errors.push(`${prefix}: invalid provider '${item.provider}'`);
        }
      }
      if (item.routingMode && !VALID_ROUTING_MODES.includes(item.routingMode)) {
        errors.push(`${prefix}: invalid routingMode '${item.routingMode}'`);
      }
      if (item.rlmAssist != null && typeof item.rlmAssist !== 'boolean') {
        errors.push(`${prefix}: rlmAssist must be boolean`);
      }
      if (item.rlmAttachmentSessionId != null && typeof item.rlmAttachmentSessionId !== 'string') {
        errors.push(`${prefix}: rlmAttachmentSessionId must be string`);
      }
      if (item.groups != null && !Array.isArray(item.groups)) {
        errors.push(`${prefix}: groups must be array`);
      }
      if (Array.isArray(item.groups)) {
        item.groups.forEach((groupId, groupIndex) => {
          if (typeof groupId !== 'string') {
            errors.push(`${prefix}: groups[${groupIndex}] must be string`);
          }
        });
      }
      break;

    case 'channel':
      if (item.mode != null) {
        const mode = String(item.mode).trim().toLowerCase();
        if (!['direct', 'broadcast', 'group'].includes(mode)) {
          errors.push(`${prefix}: invalid mode '${item.mode}'`);
        }
      }
      if (item.direction && !VALID_CHANNEL_DIRECTIONS.includes(item.direction)) {
        errors.push(`${prefix}: invalid direction '${item.direction}'`);
      }
      const flowCondition = String(item.when || item.flowCondition || '').trim();
      if (flowCondition && !VALID_CHANNEL_FLOW_CONDITIONS.includes(flowCondition)) {
        errors.push(`${prefix}: invalid flow/when '${flowCondition}'`);
      }
      if (item.onFailure && !VALID_CHANNEL_FAILURE_POLICIES.includes(item.onFailure)) {
        errors.push(`${prefix}: invalid onFailure '${item.onFailure}'`);
      }
      if (item.fromAgentId != null && typeof item.fromAgentId !== 'string') {
        errors.push(`${prefix}: fromAgentId must be string`);
      }
      if (item.toAgentId != null && typeof item.toAgentId !== 'string') {
        errors.push(`${prefix}: toAgentId must be string`);
      }
      if (item.matchRule != null && typeof item.matchRule !== 'string') {
        errors.push(`${prefix}: matchRule must be string`);
      }
      if (item.groupId != null && typeof item.groupId !== 'string') {
        errors.push(`${prefix}: groupId must be string`);
      }
      if (flowCondition === 'on_match' && !String(item.matchRule || '').trim()) {
        errors.push(`${prefix}: matchRule is required when flow/when is 'on_match'`);
      }
      if (String(item.mode || '').toLowerCase() === 'group' && !String(item.groupId || '').trim()) {
        errors.push(`${prefix}: groupId is required when mode is 'group'`);
      }
      if (item.retryCount != null) {
        const retry = Number(item.retryCount);
        if (!Number.isInteger(retry) || retry < 0 || retry > 10) {
          errors.push(`${prefix}: retryCount must be integer 0-10`);
        }
      }
      if (item.timeoutMs != null) {
        const timeout = Number(item.timeoutMs);
        if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 600000) {
          errors.push(`${prefix}: timeoutMs must be between 1000 and 600000`);
        }
      }
      break;

    case 'gateway':
      if (!item.name) {
        errors.push(`${prefix}: gateway missing name`);
      }
      if (item.position && !VALID_GATEWAY_POSITIONS.includes(item.position)) {
        errors.push(`${prefix}: invalid position '${item.position}'`);
      }
      if (item.irg) {
        const mode = String(item.irg.executeMode || 'live').toLowerCase();
        if (!['simulate', 'live', 'disabled'].includes(mode)) {
          errors.push(`${prefix}: invalid IRG executeMode '${item.irg.executeMode}'`);
        }
        const entryMode = String(item.irg.entryMode || 'deterministic-first').toLowerCase();
        if (!['deterministic-first', 'llm-plan-first'].includes(entryMode)) {
          errors.push(`${prefix}: invalid IRG entryMode '${item.irg.entryMode}'`);
        }
        if (item.irg.deterministicFallbackMode != null) {
          const fallbackMode = String(item.irg.deterministicFallbackMode).toLowerCase();
          if (!['off', 'on-gaps', 'on-gaps-or-low-confidence'].includes(fallbackMode)) {
            errors.push(`${prefix}: invalid IRG deterministicFallbackMode '${item.irg.deterministicFallbackMode}'`);
          }
        }
        if (item.irg.deterministicConfidenceThreshold != null) {
          const threshold = Number(item.irg.deterministicConfidenceThreshold);
          if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
            errors.push(`${prefix}: IRG deterministicConfidenceThreshold must be between 0 and 1`);
          }
        }
        if (item.irg.requireLlmPlanForLive != null && typeof item.irg.requireLlmPlanForLive !== 'boolean') {
          errors.push(`${prefix}: IRG requireLlmPlanForLive must be boolean`);
        }
        if (item.irg.autoExecuteLive != null && typeof item.irg.autoExecuteLive !== 'boolean') {
          errors.push(`${prefix}: IRG autoExecuteLive must be boolean`);
        }
        if (item.irg.live?.timeoutMs != null) {
          const timeout = Number(item.irg.live.timeoutMs);
          if (!Number.isFinite(timeout) || timeout < 2000 || timeout > 300000) {
            errors.push(`${prefix}: IRG live timeoutMs must be between 2000 and 300000`);
          }
        }
      }
      if (item.sources?.serial) {
        const baudRate = Number(item.sources.serial.baudRate);
        if (!Number.isFinite(baudRate) || baudRate < 300 || baudRate > 2000000) {
          errors.push(`${prefix}: serial baudRate must be between 300 and 2000000`);
        }
        const serialPort = String(item.sources.serial.port || '').trim();
        if (!serialPort) {
          errors.push(`${prefix}: serial port must be non-empty or 'auto'`);
        }
      }
      break;

    case 'bindings':
      if (!item.name) {
        errors.push(`${prefix}: bindings missing name`);
      }
      if (item.entries != null && !Array.isArray(item.entries)) {
        errors.push(`${prefix}: bindings entries must be an array`);
      }
      if (Array.isArray(item.entries)) {
        item.entries.forEach((entry, entryIndex) => {
          const key = String(entry?.key || '').trim();
          if (!key) {
            errors.push(`${prefix}: bindings entry[${entryIndex}] missing key`);
          }
        });
      }
      break;

    case 'endpoint_registry':
      if (!item.name) {
        errors.push(`${prefix}: endpoint registry missing name`);
      }
      break;
    case 'cli_agent':
      if (!item.name) {
        errors.push(`${prefix}: cli_agent missing name`);
      }
      if (item.ownerAgentId != null && typeof item.ownerAgentId !== 'string') {
        errors.push(`${prefix}: ownerAgentId must be string`);
      }
      if (item.executionMode != null) {
        const mode = String(item.executionMode).trim().toLowerCase();
        if (!['on-tool', 'on-control', 'auto', 'manual'].includes(mode)) {
          errors.push(`${prefix}: invalid executionMode '${item.executionMode}'`);
        }
      }
      if (item.policyProfile != null) {
        const profile = String(item.policyProfile).trim().toLowerCase();
        if (!['read-only', 'workspace-write', 'privileged-approval'].includes(profile)) {
          errors.push(`${prefix}: invalid policyProfile '${item.policyProfile}'`);
        }
      }
      if (item.stepBudget != null) {
        const stepBudget = Number(item.stepBudget);
        if (!Number.isInteger(stepBudget) || stepBudget < 1 || stepBudget > 500) {
          errors.push(`${prefix}: stepBudget must be integer 1-500`);
        }
      }
      if (item.tokenBudget != null) {
        const tokenBudget = Number(item.tokenBudget);
        if (!Number.isInteger(tokenBudget) || tokenBudget < 256 || tokenBudget > 200000) {
          errors.push(`${prefix}: tokenBudget must be integer 256-200000`);
        }
      }
      if (item.timeoutMs != null) {
        const timeout = Number(item.timeoutMs);
        if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 3600000) {
          errors.push(`${prefix}: timeoutMs must be between 1000 and 3600000`);
        }
      }
      if (item.hooks != null && typeof item.hooks !== 'object') {
        errors.push(`${prefix}: hooks must be object`);
      }
      break;
  }

  return errors;
}

module.exports = {
  validateConfig
};
