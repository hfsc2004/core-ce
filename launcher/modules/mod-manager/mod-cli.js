/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { createModManager } = require('./mod-manager');
const { createModLoader } = require('./mod-loader');
const signing = require('./mod-signing');

function printUsage() {
  process.stdout.write(
    [
      'Usage: node modules/mod-manager/mod-cli.js <command> [options]',
      '',
      'Commands:',
      '  list',
      '  trusted-keys',
      '  keygen [--key-id <id>] [--output-dir <dir>]',
      '  sign <sourceDir> --private-key <file> --key-id <id>',
      '  verify <sourceDir> [--edition <name>] [--preset <name>] [--trusted-keys <file>]',
      '  install <sourceDir> [--edition <name>] [--preset <name>] [--trusted-keys <file>]',
      '  enable <modId>',
      '  disable <modId>',
      '  remove <modId> [--no-purge]',
      '  attest [--mod-id <modId>] [--capability-prefix <prefix>]',
      ''
    ].join('\n')
  );
}

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      args.push(token);
    }
  }
  return { args, flags };
}

function loadTrustedKeys(filePath) {
  if (!filePath) return {};
  const resolved = path.resolve(String(filePath));
  if (!fs.existsSync(resolved)) {
    throw new Error(`trusted keys file not found: ${resolved}`);
  }
  const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('trusted keys file must be a JSON object map of keyId -> publicKeyPem');
  }
  return data;
}

async function verifyCommand(sourceDir, flags) {
  const resolved = path.resolve(String(sourceDir || ''));
  const manifestPath = path.join(resolved, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, stage: 'manifest', errors: [`manifest not found: ${manifestPath}`] };
  }
  const signaturePath = path.join(resolved, 'signature.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const signature = fs.existsSync(signaturePath)
    ? JSON.parse(fs.readFileSync(signaturePath, 'utf8'))
    : null;

  const manager = createModManager();
  const trustedKeys = flags['trusted-keys']
    ? loadTrustedKeys(flags['trusted-keys'])
    : await signing.loadTrustedKeys(path.join(process.cwd(), '..', '.psf', 'mods'));
  return manager.preflightPackage({
    manifest,
    signature,
    edition: flags.edition,
    preset: flags.preset,
    trustedKeys
  });
}

async function run() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const command = String(args[0] || '').toLowerCase();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const modRoot = path.join(process.cwd(), '..', '.psf', 'mods');
  const loader = createModLoader({ rootDir: modRoot });
  await loader.initialize();

  let result = null;
  if (command === 'list') {
    result = await loader.listInstalled();
  } else if (command === 'trusted-keys') {
    result = {
      ok: true,
      trustedKeysPath: signing.getTrustedKeysPath(modRoot),
      keys: await signing.loadTrustedKeys(modRoot)
    };
  } else if (command === 'keygen') {
    result = await signing.createKeyPair({
      keyId: String(flags['key-id'] || 'ed25519:local-dev-signer'),
      outputDir: String(flags['output-dir'] || path.join(modRoot, 'trust', 'keys'))
    });
  } else if (command === 'sign') {
    const sourceDir = args[1];
    const privateKeyPath = String(flags['private-key'] || '').trim();
    const keyId = String(flags['key-id'] || '').trim();
    if (!sourceDir || !privateKeyPath || !keyId) {
      printUsage();
      process.exit(2);
    }
    result = await signing.signDirectory({
      sourceDir,
      privateKeyPath,
      keyId,
      rootDir: modRoot,
      approve: true
    });
  } else if (command === 'verify') {
    const sourceDir = args[1];
    if (!sourceDir) {
      printUsage();
      process.exit(2);
    }
    result = await verifyCommand(sourceDir, flags);
  } else if (command === 'install') {
    const sourceDir = args[1];
    if (!sourceDir) {
      printUsage();
      process.exit(2);
    }
    result = await loader.installFromDirectory({
      sourceDir: path.resolve(sourceDir),
      edition: flags.edition,
      preset: flags.preset,
      trustedKeys: flags['trusted-keys']
        ? loadTrustedKeys(flags['trusted-keys'])
        : await signing.loadTrustedKeys(modRoot)
    });
  } else if (command === 'enable') {
    const modId = args[1];
    if (!modId) {
      printUsage();
      process.exit(2);
    }
    result = await loader.enableMod({ modId });
  } else if (command === 'disable') {
    const modId = args[1];
    if (!modId) {
      printUsage();
      process.exit(2);
    }
    result = await loader.disableMod({ modId });
  } else if (command === 'remove') {
    const modId = args[1];
    if (!modId) {
      printUsage();
      process.exit(2);
    }
    result = await loader.removeMod({ modId, purge: flags['no-purge'] !== true });
  } else if (command === 'attest') {
    result = await loader.attest({
      modId: flags['mod-id'] || '',
      capabilityPrefix: flags['capability-prefix'] || 'voice.'
    });
  } else {
    process.stderr.write(`Unknown command: ${command}\n`);
    printUsage();
    process.exit(2);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result?.ok === false ? 1 : 0);
}

run().catch((err) => {
  process.stderr.write(`mod-cli failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
