const assert = require('assert');
const registryModule = require('./moe-endpoint-registry');

function makeLocalAgent(id, name, port, modelId) {
  return {
    id,
    name,
    modelId,
    modelName: modelId,
    endpoint: {
      type: 'local',
      host: '127.0.0.1',
      port,
      protocol: 'http'
    }
  };
}

function testDisabledRegistryFallsBack() {
  const registry = registryModule.createEndpointRegistry({ enabled: false }, [
    makeLocalAgent('agent-a', 'Navigator', 11434, 'gemma:4b')
  ]);
  assert.strictEqual(registry.enabled, false);
  assert.strictEqual(registry.resolveForAgent({ id: 'agent-a', name: 'Navigator' }), null);
}

function testPrefersConfiguredRemoteThenFailsOver() {
  const registry = registryModule.createEndpointRegistry({
    enabled: true,
    includeLocalAgents: true,
    maxConsecutiveFailures: 2,
    cooldownMs: 60000,
    agentRoleMap: {
      'agent-nav': 'navigator'
    },
    roles: {
      navigator: [
        {
          id: 'nav-remote',
          name: 'Navigator Remote',
          endpoint: { type: 'remote', host: '10.0.0.22', port: 52455, protocol: 'http' },
          modelId: 'qwen2.5-vl:3b',
          priority: 10
        }
      ]
    }
  }, [
    makeLocalAgent('agent-nav', 'Navigator', 11435, 'gemma:4b')
  ]);

  const firstPick = registry.resolveForAgent({ id: 'agent-nav', name: 'Navigator' });
  assert.strictEqual(firstPick.id, 'nav-remote');
  assert.strictEqual(firstPick.modelId, 'qwen2.5-vl:3b');

  registry.reportResult('nav-remote', { success: false, error: 'timeout' });
  registry.reportResult('nav-remote', { success: false, error: 'timeout' });

  const secondPick = registry.resolveForAgent({ id: 'agent-nav', name: 'Navigator' });
  assert.strictEqual(secondPick.id, 'local-agent-nav');
  assert.strictEqual(secondPick.source, 'local-agent');
}

function run() {
  testDisabledRegistryFallsBack();
  testPrefersConfiguredRemoteThenFailsOver();
  console.log('moe-endpoint-registry regression tests passed');
}

run();
