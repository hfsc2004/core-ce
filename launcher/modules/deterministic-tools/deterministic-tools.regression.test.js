const assert = require('assert');
const dtools = require('./index');

async function testCommonPackAndExecution() {
  const rt = dtools.createDefaultRuntime();
  const tools = rt.listTools();
  assert.ok(tools.some((t) => t.name === 'chunk_text'));
  assert.ok(tools.some((t) => t.name === 'parse_key_values'));

  const result = await rt.executeTool({
    toolName: 'parse_key_values',
    args: {
      text: 'gpio.red=2, gpio.blue=3 period_ms=400 cycles=8',
      allowedKeys: ['gpio.red', 'gpio.blue', 'period_ms', 'cycles']
    },
    context: { surface: 'moe', role: 'planner' }
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.output.values['gpio.red'], '2');
  assert.strictEqual(result.output.values['cycles'], '8');
}

async function testPolicyDeny() {
  const rt = dtools.createDefaultRuntime({
    policy: {
      defaultAllow: true,
      denyBySurface: {
        moe: ['parse_key_values']
      }
    }
  });
  const denied = await rt.executeTool({
    toolName: 'parse_key_values',
    args: { text: 'cycles=5' },
    context: { surface: 'moe', role: 'planner' }
  });
  assert.strictEqual(denied.success, false);
  assert.ok(String(denied.error || '').includes('Policy denied'));
}

async function testTraceRecords() {
  const rt = dtools.createDefaultRuntime();
  await rt.executeTool({
    toolName: 'find_lines',
    args: { text: 'a\nb\nc', query: 'b' },
    context: { surface: 'coding-terminal', role: 'inspector' }
  });
  const traces = rt.getTraces(10);
  assert.ok(Array.isArray(traces));
  assert.ok(traces.length >= 1);
  assert.strictEqual(traces[traces.length - 1].toolName, 'find_lines');
}

async function testRlmPresetGate() {
  const rt = dtools.createDefaultRuntime();
  const preset = dtools.getPolicyPreset('rlm');
  assert.ok(preset);
  rt.setPolicy(preset);

  const allowed = await rt.executeTool({
    toolName: 'chunk_text',
    args: { text: 'abcdef', chunkSize: 3, overlap: 1 },
    context: { surface: 'moe', role: 'planner' }
  });
  assert.strictEqual(allowed.success, true);

  const blocked = await rt.executeTool({
    toolName: 'chunk_text',
    args: { text: 'abcdef' },
    context: { surface: 'unknown-surface', role: 'unknown-role' }
  });
  assert.strictEqual(blocked.success, false);
}

async function run() {
  await testCommonPackAndExecution();
  await testPolicyDeny();
  await testTraceRecords();
  await testRlmPresetGate();
  console.log('deterministic-tools regression tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
