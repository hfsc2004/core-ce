/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const gatewayAdapters = require('./moe-gateway-adapters');
const liveTools = require('./moe-irg-live-tools');
const {
  stripAnsi,
  applyEsp32NetworkOverridesToSketch,
  resolveEsp32UploadProfiles,
  detectArduinoCliUploadPropertySupport,
  ensureEsp32CoreInstalled,
  resolveMpremoteCommand,
  runHttpRequest,
  resolveArduinoCliCommand,
  buildArduinoCliCandidatePaths,
  runCommandAsync
} = liveTools;

function resolveEsp32ChipArg(contract, fqbn) {
  const explicit = String(contract?.params?.chip || '').trim().toLowerCase();
  if (explicit) return explicit;
  const f = String(fqbn || '').toLowerCase();
  if (f.includes('esp32s3')) return 'esp32s3';
  if (f.includes('esp32s2')) return 'esp32s2';
  if (f.includes('esp32c3')) return 'esp32c3';
  if (f.includes('esp32c6')) return 'esp32c6';
  if (f.includes('esp32h2')) return 'esp32h2';
  return 'esp32';
}

function resolveManagedEsptoolPath(arduinoCliEnv = {}) {
  const dataDir = String(arduinoCliEnv?.ARDUINO_DIRECTORIES_DATA || '').trim();
  if (!dataDir) return null;
  const toolsRoot = path.join(dataDir, 'packages', 'esp32', 'tools', 'esptool_py');
  try {
    if (!fs.existsSync(toolsRoot)) return null;
    const dirs = fs.readdirSync(toolsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .reverse();
    for (const dir of dirs) {
      const bin = process.platform === 'win32'
        ? path.join(toolsRoot, dir, 'esptool.exe')
        : path.join(toolsRoot, dir, 'esptool');
      if (fs.existsSync(bin)) return bin;
    }
  } catch {
    // ignore lookup errors
  }
  return null;
}

function resolveMergedBinPath(sketchName, compileStartAtMs = 0) {
  const root = path.join(os.tmpdir(), 'arduino', 'sketches');
  const targetName = `${String(sketchName || '').trim() || 'psf_irg_esp32'}.ino.merged.bin`;
  try {
    if (!fs.existsSync(root)) return null;
    const sketchDirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name));
    let best = null;
    let bestMtime = -1;
    for (const dir of sketchDirs) {
      const candidate = path.join(dir, targetName);
      if (!fs.existsSync(candidate)) continue;
      const stat = fs.statSync(candidate);
      const mtime = Number(stat.mtimeMs || 0);
      if (compileStartAtMs && mtime + 5 < compileStartAtMs) continue;
      if (mtime > bestMtime) {
        best = candidate;
        bestMtime = mtime;
      }
    }
    return best;
  } catch {
    return null;
  }
}

async function executeLiveContract({ contract, script, expectedSerial, gatewayConfig = {}, policy } = {}) {
  const target = String(contract?.target || '').trim().toLowerCase();
  if (target === 'esp32' && String(contract?.action || '') === 'push_esp32_code') {
    return executeLiveEsp32Contract({ contract, sketch: script, expectedSerial, gatewayConfig, policy });
  }
  if (target === 'esp32' && String(contract?.action || '') === 'esp32_wifi_http') {
    return executeLiveEsp32WifiContract({ contract });
  }
  return executeLivePicoContract({ script, expectedSerial, gatewayConfig, policy });
}

async function executeLivePicoContract({ script, expectedSerial, gatewayConfig = {}, policy } = {}) {
  const serialSource = gatewayConfig?.sources?.serial || {};
  if (serialSource?.enabled !== true) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'Live mode requires gateway serial source to be enabled.'
    };
  }

  const available = gatewayAdapters.listSerialPorts();
  const resolution = gatewayAdapters.resolveSerialPort(serialSource, available);
  const resolvedPort = String(resolution?.resolvedPort || '').trim();
  if (!resolvedPort) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'No serial/USB target resolved for live mode.',
      serial: {
        mode: resolution?.mode || 'auto',
        configuredPort: serialSource?.port || 'auto',
        availablePorts: available
      }
    };
  }

  const timeoutMs = Number.isFinite(Number(policy?.live?.timeoutMs))
    ? Math.max(2000, Math.min(300000, Number(policy.live.timeoutMs)))
    : 60000;
  const executor = String(policy?.live?.executor || 'mpremote').toLowerCase();
  if (executor !== 'mpremote') {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `Unsupported live executor: ${executor}`
    };
  }

  const command = await resolveMpremoteCommand();
  if (!command) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'mpremote not available. Build Python WebUI in Binary Manager or install mpremote.',
      serial: { resolvedPort }
    };
  }

  const run = await runCommandAsync(command.bin, [...command.baseArgs, 'connect', resolvedPort, 'exec', script], {
    timeoutMs
  });
  const stdout = String(run.stdout || '');
  const stderr = String(run.stderr || '');

  if (run.error) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `${command.label} execution failed: ${run.error}`,
      serial: { resolvedPort },
      output: { stdout, stderr }
    };
  }
  if (run.status !== 0) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `${command.label} exited with code ${run.status}`,
      serial: { resolvedPort },
      output: { stdout, stderr }
    };
  }
  const verified = stdout.includes(expectedSerial) || stderr.includes(expectedSerial);
  if (!verified) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `Live execution completed but verification token "${expectedSerial}" was not observed.`,
      serial: { resolvedPort },
      output: { stdout, stderr }
    };
  }

  return {
    success: true,
    mode: 'live',
    verification: {
      expectedSerial,
      matched: true
    },
    serial: { resolvedPort },
    output: { stdout, stderr }
  };
}

async function executeLiveEsp32Contract({ contract, sketch, expectedSerial, gatewayConfig = {}, policy } = {}) {
  const serialSource = gatewayConfig?.sources?.serial || {};
  if (serialSource?.enabled !== true) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'Live mode requires gateway serial source to be enabled.'
    };
  }

  const available = gatewayAdapters.listSerialPorts();
  const resolution = gatewayAdapters.resolveSerialPort(serialSource, available);
  const resolvedPort = String(resolution?.resolvedPort || '').trim();
  if (!resolvedPort) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'No serial/USB target resolved for ESP32 live upload.',
      serial: {
        mode: resolution?.mode || 'auto',
        configuredPort: serialSource?.port || 'auto',
        availablePorts: available
      }
    };
  }

  const arduinoCli = await resolveArduinoCliCommand();
  if (!arduinoCli) {
    const installHint =
      'Install Arduino CLI + ESP32 core, then retry.\n' +
      'Example:\n' +
      '  arduino-cli core update-index\n' +
      '  arduino-cli core install esp32:esp32';
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `arduino-cli not available.\n${installHint}`,
      serial: { resolvedPort },
      tools: {
        arduinoCliSearchedPaths: buildArduinoCliCandidatePaths()
      }
    };
  }

  const sketchNameRaw = String(policy?.esp32?.sketchName || 'psf_irg_esp32').trim();
  const sketchName = sketchNameRaw.replace(/[^a-zA-Z0-9_-]/g, '_') || 'psf_irg_esp32';
  const fqbn = String(policy?.esp32?.fqbn || 'esp32:esp32:esp32').trim() || 'esp32:esp32:esp32';
  const compileTimeoutMs = Number.isFinite(Number(policy?.esp32?.compileTimeoutMs))
    ? Math.max(10000, Math.min(600000, Number(policy.esp32.compileTimeoutMs)))
    : 180000;
  const uploadTimeoutMs = Number.isFinite(Number(policy?.esp32?.uploadTimeoutMs))
    ? Math.max(10000, Math.min(600000, Number(policy.esp32.uploadTimeoutMs)))
    : 120000;
  const uploadPropertySupported = await detectArduinoCliUploadPropertySupport(arduinoCli);
  const uploadProfiles = resolveEsp32UploadProfiles(policy, { uploadPropertySupported });
  const uploadMode = String(contract?.params?.uploadMode || '').trim().toLowerCase();

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'psf-irg-esp32-'));
  const sketchDir = path.join(tempRoot, sketchName);
  const sketchFile = path.join(sketchDir, `${sketchName}.ino`);
  const patchedSketch = applyEsp32NetworkOverridesToSketch(String(sketch || ''), policy);
  try {
    fs.mkdirSync(sketchDir, { recursive: true });
    fs.writeFileSync(sketchFile, patchedSketch, 'utf8');

    const compileStartedAt = Date.now();
    const runCompile = async () => {
      const compileResult = await runCommandAsync(arduinoCli.bin, [...arduinoCli.baseArgs, 'compile', '--fqbn', fqbn, sketchDir], {
        timeoutMs: compileTimeoutMs,
        env: arduinoCli.env || null
      });
      const output = stripAnsi(`${String(compileResult.stdout || '')}\n${String(compileResult.stderr || '')}`).trim();
      return { compileResult, output };
    };

    let { compileResult: compile, output: compileOut } = await runCompile();
    if (compile.error || compile.status !== 0) {
      const lower = String(compileOut || '').toLowerCase();
      const missingPlatform =
        lower.includes("platform 'esp32:esp32' not found") ||
        lower.includes('platform not installed') ||
        lower.includes('esp32:esp32 not found');
      if (missingPlatform) {
        const coreInstall = await ensureEsp32CoreInstalled(arduinoCli, fqbn);
        if (coreInstall.success) {
          const retry = await runCompile();
          compile = retry.compileResult;
          compileOut = `${compileOut}\n\n[auto-heal] ${coreInstall.message}\n\n${retry.output}`.trim();
        } else {
          compileOut = `${compileOut}\n\n[auto-heal failed] ${coreInstall.message}`.trim();
        }
      }
    }

    if (compile.error || compile.status !== 0) {
      return {
        success: false,
        blocked: true,
        mode: 'live',
        reason: `arduino-cli compile failed${compile.error ? `: ${compile.error}` : ` (code ${compile.status})`}`,
        serial: { resolvedPort },
        metadata: { target: 'esp32', fqbn, sketchFile },
        output: {
          compile: compileOut
        }
      };
    }

    if (uploadMode === 'merged-bin') {
      const mergedBin = resolveMergedBinPath(sketchName, compileStartedAt);
      if (!mergedBin) {
        return {
          success: false,
          blocked: true,
          mode: 'live',
          reason: 'merged.bin not found after compile',
          serial: { resolvedPort },
          metadata: { target: 'esp32', fqbn, sketchFile, uploadMode: 'merged-bin' },
          output: { compile: compileOut }
        };
      }
      const esptoolBin = resolveManagedEsptoolPath(arduinoCli.env || {}) || 'esptool';
      const chip = resolveEsp32ChipArg(contract, fqbn);
      const esptoolArgs = ['--port', resolvedPort, '--chip', chip, 'write_flash', '0x0', mergedBin];
      const upload = await runCommandAsync(esptoolBin, esptoolArgs, {
        timeoutMs: uploadTimeoutMs,
        env: arduinoCli.env || null
      });
      const uploadOut = stripAnsi(`${String(upload.stdout || '')}\n${String(upload.stderr || '')}`).trim();
      if (upload.error || upload.status !== 0) {
        return {
          success: false,
          blocked: true,
          mode: 'live',
          reason: `esptool upload failed${upload.error ? `: ${upload.error}` : ` (code ${upload.status})`}`,
          serial: { resolvedPort },
          metadata: { target: 'esp32', fqbn, chip, mergedBin, uploadMode: 'merged-bin' },
          output: {
            compile: compileOut,
            upload: uploadOut
          }
        };
      }
      return {
        success: true,
        mode: 'live',
        verification: {
          expectedSerial: expectedSerial || 'Upload completed',
          matched: false
        },
        serial: { resolvedPort },
        output: {
          compile: compileOut,
          upload: uploadOut
        },
        metadata: {
          target: 'esp32',
          fqbn,
          chip,
          sketchFile,
          mergedBin,
          uploadMode: 'merged-bin',
          networkOverridesApplied: patchedSketch !== String(sketch || '')
        }
      };
    }

    let upload = null;
    let uploadOut = '';
    let usedUploadProfile = null;
    const uploadAttempts = [];
    for (let i = 0; i < uploadProfiles.length; i += 1) {
      const profile = uploadProfiles[i];
      const args = [
        ...arduinoCli.baseArgs,
        'upload',
        '-p',
        resolvedPort,
        '--fqbn',
        fqbn
      ];
      const uploadProperties = Array.isArray(profile.uploadProperties) ? profile.uploadProperties : [];
      for (const prop of uploadProperties) {
        const value = String(prop || '').trim();
        if (!value) continue;
        args.push('--upload-property', value);
      }
      args.push(sketchDir);
      const result = await runCommandAsync(arduinoCli.bin, args, {
        timeoutMs: uploadTimeoutMs,
        env: arduinoCli.env || null
      });
      const out = stripAnsi(`${String(result.stdout || '')}\n${String(result.stderr || '')}`).trim();
      uploadAttempts.push({
        label: profile.label || `profile-${i + 1}`,
        output: out
      });
      upload = result;
      uploadOut = out;
      if (!result.error && result.status === 0) {
        usedUploadProfile = profile.label || `profile-${i + 1}`;
        break;
      }
    }

    const uploadAttemptsOut = uploadAttempts
      .map((entry, idx) => `[upload attempt ${idx + 1}/${uploadAttempts.length}] ${entry.label}\n${String(entry.output || '').trim()}`.trim())
      .join('\n\n')
      .trim();

    if (!upload || upload.error || upload.status !== 0) {
      return {
        success: false,
        blocked: true,
        mode: 'live',
        reason: `arduino-cli upload failed${upload.error ? `: ${upload.error}` : ` (code ${upload.status})`}`,
        serial: { resolvedPort },
        metadata: { target: 'esp32', fqbn, sketchFile, uploadProfilesTried: uploadProfiles.map((p) => p.label) },
        output: {
          compile: compileOut,
          upload: uploadAttemptsOut || uploadOut
        }
      };
    }

    return {
      success: true,
      mode: 'live',
      verification: {
        expectedSerial: expectedSerial || 'Upload completed',
        matched: false
      },
      serial: { resolvedPort },
      output: {
        compile: compileOut,
        upload: uploadAttemptsOut || uploadOut
      },
      metadata: {
        target: 'esp32',
        fqbn,
        sketchFile,
        uploadProfile: usedUploadProfile || null,
        networkOverridesApplied: patchedSketch !== String(sketch || '')
      }
    };
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup issues
    }
  }
}

async function executeLiveEsp32WifiContract({ contract } = {}) {
  const host = String(contract?.params?.host || '').trim();
  const port = Number(contract?.params?.port);
  const method = String(contract?.params?.method || 'GET').trim().toUpperCase();
  const pathValue = String(contract?.params?.path || '/health').trim();
  const timeoutMs = Number.isFinite(Number(contract?.params?.timeoutMs))
    ? Math.max(1000, Math.min(60000, Number(contract.params.timeoutMs)))
    : 5000;
  const path = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  const url = `http://${host}:${port}${path}`;

  const result = await runHttpRequest({ url, method, timeoutMs });
  const status = Number(result?.statusCode);
  const body = String(result?.body || '').trim();
  const ok = !result?.error && Number.isInteger(status) && status >= 200 && status < 300;

  if (!ok) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: result?.error
        ? `esp32 wifi request failed: ${result.error}`
        : `esp32 wifi request returned status ${status || 'n/a'}`,
      metadata: {
        target: 'esp32',
        endpoint: url,
        httpStatus: Number.isInteger(status) ? status : null
      },
      output: {
        http: body || ''
      }
    };
  }

  return {
    success: true,
    mode: 'live',
    verification: {
      expectedSerial: `HTTP ${status}`,
      matched: true
    },
    metadata: {
      target: 'esp32',
      endpoint: url,
      httpStatus: status
    },
    output: {
      http: body
    }
  };
}

module.exports = {
  executeLiveContract
};
