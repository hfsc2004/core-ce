/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * MoE config templates and defaulting logic.
 */

const { CURRENT_SCHEMA_VERSION } = require('./moe-config-constants');

function ensureItemDefaults(item) {
  const defaults = {
    agent: {
      enabled: true,
      modelId: null,
      modelName: null,
      systemPrompt: '',
      routingMode: 'dynamic',
      routingRules: [],
      rlmAssist: false,
      rlmAttachmentSessionId: '',
      tools: []
    },
    channel: {
      enabled: true,
      direction: 'bidirectional',
      flowCondition: 'always',
      retryCount: 0,
      timeoutMs: 120000,
      onFailure: 'stop',
      label: ''
    },
    gateway: {
      enabled: true,
      position: 'input',
      sources: {
        api: { enabled: false, port: 52434, endpoint: '/v1/chat' },
        terminal: { enabled: true },
        serial: { enabled: false, port: 'auto', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' }
      },
      irg: {
        enabled: true,
        executeMode: 'live',
        entryMode: 'deterministic-first',
        deterministicFallbackMode: 'on-gaps-or-low-confidence',
        deterministicConfidenceThreshold: 0.9,
        autoExecuteLive: false,
        requireLlmPlanForLive: false,
        live: {
          executor: 'mpremote',
          timeoutMs: 60000
        },
        targets: ['raspberry-pi-pico', 'esp32'],
        pico: {
          allowedGpioMin: 0,
          allowedGpioMax: 28,
          minPeriodMs: 50,
          maxPeriodMs: 10000,
          defaultGpio: 25,
          defaultPeriodMs: 500,
          defaultIterations: 20,
          maxIterations: 10000,
          defaultSequenceCycles: 5,
          colorPins: {
            red: 2,
            blue: 3,
            green: 4
          }
        },
        esp32: {
          fqbn: 'esp32:esp32:esp32',
          sketchName: 'psf_irg_esp32',
          compileTimeoutMs: 180000,
          uploadTimeoutMs: 120000,
          monitorBaudRate: 115200
        }
      }
    },
    bindings: {
      enabled: true,
      name: 'Runtime Bindings',
      entries: []
    },
    endpoint_registry: {
      enabled: true,
      name: 'Distributed Endpoint Registry'
    }
  };

  const typeDefaults = defaults[item.type] || {};

  return {
    ...typeDefaults,
    ...item
  };
}

function createEmptyConfig() {
  return {
    version: CURRENT_SCHEMA_VERSION,
    lastModified: new Date().toISOString(),
    items: []
  };
}

function createStarterPipeline() {
  return {
    version: CURRENT_SCHEMA_VERSION,
    lastModified: new Date().toISOString(),
    items: [
      {
        id: `gateway-${Date.now()}-input`,
        type: 'gateway',
        name: 'User Input',
        position: 'input',
        enabled: true,
        sources: {
          api: { enabled: false, port: 52434, endpoint: '/v1/chat' },
          terminal: { enabled: true },
          serial: { enabled: false, port: 'auto', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' }
        },
        irg: {
          enabled: true,
          executeMode: 'live',
          entryMode: 'deterministic-first',
          deterministicFallbackMode: 'on-gaps-or-low-confidence',
          deterministicConfidenceThreshold: 0.9,
          autoExecuteLive: false,
          requireLlmPlanForLive: false,
          live: {
            executor: 'mpremote',
            timeoutMs: 60000
          },
          targets: ['raspberry-pi-pico', 'esp32'],
          pico: {
            allowedGpioMin: 0,
            allowedGpioMax: 28,
            minPeriodMs: 50,
            maxPeriodMs: 10000,
            defaultGpio: 25,
            defaultPeriodMs: 500,
            defaultIterations: 20,
            maxIterations: 10000,
            defaultSequenceCycles: 5,
            colorPins: {
              red: 2,
              blue: 3,
              green: 4
            }
          },
          esp32: {
            fqbn: 'esp32:esp32:esp32',
            sketchName: 'psf_irg_esp32',
            compileTimeoutMs: 180000,
            uploadTimeoutMs: 120000,
            monitorBaudRate: 115200
          }
        }
      },
      {
        id: `bindings-${Date.now()}-vars`,
        type: 'bindings',
        name: 'Runtime Bindings',
        entries: [
          { key: 'gpio.red', value: '2' },
          { key: 'gpio.blue', value: '3' },
          { key: 'gpio.green', value: '4' }
        ],
        enabled: true
      },
      {
        id: `channel-${Date.now()}-1`,
        type: 'channel',
        direction: 'bidirectional',
        flowCondition: 'always',
        retryCount: 0,
        timeoutMs: 120000,
        onFailure: 'stop',
        label: '',
        enabled: true
      },
      {
        id: `agent-${Date.now()}-main`,
        type: 'agent',
        name: 'Main Agent',
        modelId: null,
        modelName: null,
        systemPrompt: 'You are a helpful assistant.',
        routingMode: 'dynamic',
        routingRules: [],
        rlmAssist: false,
        rlmAttachmentSessionId: '',
        tools: [],
        enabled: true
      }
    ]
  };
}

module.exports = {
  ensureItemDefaults,
  createEmptyConfig,
  createStarterPipeline
};
