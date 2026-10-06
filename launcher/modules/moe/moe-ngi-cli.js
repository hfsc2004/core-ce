#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const COMMANDS = { list: 'ngi_list', inspect: 'ngi_inspect', configure: 'ngi_configure',
  'select-source': 'ngi_select_source', validate: 'ngi_validate', apply: 'ngi_apply',
  arm: 'ngi_arm', start: 'ngi_start', stop: 'ngi_stop', status: 'ngi_status', results: 'ngi_results',
  save: 'ngi_save_manifest', load: 'ngi_load_manifest' };
async function main(argv) {
  const [command, ...rest] = argv; const flags = {};
  if (!COMMANDS[command]) throw new Error('Usage: node launcher/modules/moe/moe-ngi-cli.js <list|inspect|configure|select-source|validate|apply|arm|start|stop|status|results|save|load> [--gateway ID] [--params JSON | --file PATH] [--output PATH] [--connection PATH]');
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--gateway','--params','--file','--output','--connection','--expected-revision'].includes(rest[i]) || !rest[i+1]) throw new Error('Invalid CLI arguments');
    flags[rest[i].slice(2)] = rest[i+1];
  }
  if (command !== 'list' && !flags.gateway) throw new Error('--gateway is required');
  if (flags.params && flags.file) throw new Error('Use --params or --file');
  const descriptor = JSON.parse(fs.readFileSync(flags.connection || path.resolve(__dirname, '../../../config/relay/ngi-management.json'), 'utf8'));
  const url = new URL(descriptor.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/v1/ngi' || url.username || url.password || url.search || url.hash) throw new Error('Expected a local Core-CE management connection');
  const input = flags.file ? JSON.parse(fs.readFileSync(flags.file, 'utf8')) : JSON.parse(flags.params || '{}');
  const params = command === 'load' ? { manifest: input } : command === 'configure' ? { patch: input } : input;
  if (flags['expected-revision'] !== undefined) {
    if (command !== 'configure') throw new Error('--expected-revision is supported for configure');
    params.expectedRevision = Number(flags['expected-revision']);
  }
  const response = await fetch(descriptor.url, { method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${descriptor.token}` },
    body: JSON.stringify({ gatewayId: flags.gateway, action: COMMANDS[command], params }),
    signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (flags.output && result.success) {
    const output = command === 'save' ? result.manifest : result;
    fs.writeFileSync(flags.output, JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.success) process.exitCode = 1;
  return result;
}
if (require.main === module) main(process.argv.slice(2)).catch(err => { console.error(`NGI CLI: ${err.message}`); process.exitCode = 1; });
module.exports = { main, COMMANDS };
