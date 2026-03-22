/**
 * Local voice runtime maintenance/status APIs.
 */
const common = require('./local-transformers-common');
const runtime = require('./local-transformers-runtime');

async function checkLocalVoiceRuntime(ctx, payload = {}) {
  try {
    const profile = runtime.getRuntimeProfileOptions(payload?.profile);
    const runtimeDir = common.getManagedVoiceRuntimeDir(ctx.appDir, profile);
    const pythonBin = common.getManagedVoiceRuntimePythonBin(ctx.appDir, profile);
    const exists = common.fs.existsSync(runtimeDir);
    if (!exists || !pythonBin) {
      const profileLabel = runtime.getRuntimeProfileLabel(profile);
      return {
        success: true,
        exists: false,
        ready: false,
        profile: profile.profile,
        runtimeDir,
        message: `❌ [${profile.profile}] ${profileLabel} voice runtime not installed.`
      };
    }

    const requiredModules = profile.requiresChatterbox
      ? ['numpy', 'transformers', 'torch', 'phonemizer', 'chatterbox']
      : (profile.requiresDia
        ? ['numpy', 'transformers', 'torch', 'phonemizer', 'descript_audio_codec', 'safetensors']
        : ['numpy', 'transformers', 'torch', 'phonemizer']);
    let missing = [];
    try {
      missing = await runtime.probeMissingPythonModules(pythonBin, requiredModules);
    } catch (err) {
      return {
        success: false,
        exists: true,
        ready: false,
        profile: profile.profile,
        runtimeDir,
        pythonBin,
        message: `❌ Runtime probe failed: ${err.message || String(err)}`
      };
    }
    if (missing.length === 0 && profile.requiresDia) {
      const diaAvailable = await runtime.probeDiaTransformersAvailable(pythonBin);
      if (!diaAvailable) missing.push('transformers_dia');
    }
    if (missing.length > 0) {
      return {
        success: true,
        exists: true,
        ready: false,
        profile: profile.profile,
        runtimeDir,
        pythonBin,
        missing,
        message: `⚠️ [${profile.profile}] Voice runtime present but missing packages: ${missing.join(', ')}`
      };
    }

    const profileLabel = runtime.getRuntimeProfileLabel(profile);
    return {
      success: true,
      exists: true,
      ready: true,
      profile: profile.profile,
      runtimeDir,
      pythonBin,
      message: `✅ [${profile.profile}] ${profileLabel} voice runtime ready.`
    };
  } catch (err) {
    return { success: false, message: `❌ ${err.message || String(err)}` };
  }
}

async function installLocalVoiceRuntime(ctx, payload = {}) {
  try {
    const profile = runtime.getRuntimeProfileOptions(payload?.profile);
    const expectedRuntimeDir = common.getManagedVoiceRuntimeDir(ctx.appDir, profile);
    const ensured = await runtime.ensureManagedVoiceRuntime(ctx.appDir, {
      requiresChatterbox: profile.requiresChatterbox,
      requiresDia: profile.requiresDia === true,
      prefersCuda: payload?.prefersCuda === true
    });
    if (!ensured?.success) {
      return {
        success: false,
        profile: profile.profile,
        message: `❌ ${ensured?.error || 'Failed to prepare voice runtime.'}`
      };
    }
    const actualPython = String(ensured.pythonBin || '');
    if (!actualPython.startsWith(expectedRuntimeDir)) {
      return {
        success: false,
        profile: profile.profile,
        runtimeDir: expectedRuntimeDir,
        message: `❌ Runtime profile mismatch: expected ${profile.profile} runtime at ${expectedRuntimeDir}, got ${actualPython || 'unknown'}.`
      };
    }
    const profileLabel = runtime.getRuntimeProfileLabel(profile);
    return {
      success: true,
      profile: profile.profile,
      runtimeDir: expectedRuntimeDir,
      pythonBin: ensured.pythonBin,
      created: ensured.created === true,
      repaired: ensured.repaired === true,
      message: `✅ [${profile.profile}] ${profileLabel} voice runtime is ready.`
    };
  } catch (err) {
    return { success: false, message: `❌ ${err.message || String(err)}` };
  }
}

async function deleteLocalVoiceRuntime(ctx, payload = {}) {
  try {
    const profile = runtime.getRuntimeProfileOptions(payload?.profile);
    const runtimeDir = common.getManagedVoiceRuntimeDir(ctx.appDir, profile);
    if (!common.fs.existsSync(runtimeDir)) {
      const profileLabel = runtime.getRuntimeProfileLabel(profile);
      return {
        success: true,
        profile: profile.profile,
        message: `✅ ${profileLabel} voice runtime already removed.`
      };
    }
    common.fs.rmSync(runtimeDir, { recursive: true, force: true });
    const profileDeleteLabel = profile.profile === 'chatterbox' ? 'chatterbox' : (profile.profile === 'dia' ? 'dia' : 'base');
    return {
      success: true,
      profile: profile.profile,
      message: `✅ Deleted ${profileDeleteLabel} voice runtime.`
    };
  } catch (err) {
    return { success: false, message: `❌ ${err.message || String(err)}` };
  }
}

module.exports = {
  checkLocalVoiceRuntime,
  installLocalVoiceRuntime,
  deleteLocalVoiceRuntime
};
