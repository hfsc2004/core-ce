/**
 * Pseudo Science Fiction Core Collection - Privacy Hardening Environment
 *
 * Centralized environment variables to reduce telemetry/update checks for
 * bundled third-party services launched by this app.
 *
 * @module privacy-env
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 * @license SEE LICENSE.txt
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY = 'privacy';

function normalizePolicy(policyMode) {
  const raw = String(policyMode || DEFAULT_POLICY).trim().toLowerCase();
  if (raw === 'allow') return 'allow';
  if (raw === 'strict-offline') return 'strict-offline';
  return 'privacy';
}

function resolvePolicyFromSettings(projectRootMaybe) {
  const projectRoot = String(projectRootMaybe || '').trim();
  if (!projectRoot) return DEFAULT_POLICY;
  try {
    const settingsPath = path.join(path.resolve(projectRoot, '..'), 'models', 'psf-settings.json');
    if (!fs.existsSync(settingsPath)) return DEFAULT_POLICY;
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return normalizePolicy(parsed?.service_network_policy);
  } catch {
    return DEFAULT_POLICY;
  }
}

function getBasePrivacyEnv() {
  return {
    // Generic telemetry controls commonly honored by JS apps/toolchains.
    DO_NOT_TRACK: '1',
    TELEMETRY_DISABLED: '1',
    DISABLE_TELEMETRY: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
    NO_UPDATE_NOTIFIER: '1',
    npm_config_update_notifier: 'false',
    YARN_ENABLE_TELEMETRY: '0',
    CI: 'true',

    // Common analytics SDK toggles.
    POSTHOG_DISABLED: 'true',
    MIXPANEL_DISABLED: 'true',
    AMPLITUDE_DISABLED: 'true',
    SEGMENT_DISABLED: 'true',

    // Sentry guardrails.
    SENTRY_DSN: '',
    SENTRY_TRACES_SAMPLE_RATE: '0',
    SENTRY_PROFILES_SAMPLE_RATE: '0',

    // Chroma / vector DB telemetry guardrails.
    ANONYMIZED_TELEMETRY: 'FALSE',
    CHROMA_ANONYMIZED_TELEMETRY: 'FALSE',
    CHROMADB_ANONYMIZED_TELEMETRY: 'FALSE',
    CHROMA_TELEMETRY_IMPL: 'none',

    // LangChain / LangSmith tracing guardrails.
    LANGCHAIN_TRACING: 'false',
    LANGCHAIN_TRACING_V2: 'false',
    LANGSMITH_TRACING: 'false',
    LANGSMITH_ENDPOINT: '',
    LANGSMITH_API_KEY: '',

    // Hugging Face telemetry guardrails.
    HF_HUB_DISABLE_TELEMETRY: '1'
  };
}

function getStrictOfflineEnv() {
  const blackholeProxy = 'http://127.0.0.1:9';
  return {
    OFFLINE_MODE: 'true',
    HTTP_PROXY: blackholeProxy,
    HTTPS_PROXY: blackholeProxy,
    ALL_PROXY: blackholeProxy,
    http_proxy: blackholeProxy,
    https_proxy: blackholeProxy,
    all_proxy: blackholeProxy,
    NO_PROXY: '127.0.0.1,localhost,::1',
    no_proxy: '127.0.0.1,localhost,::1'
  };
}

function getPrivacyHardeningEnv(policyModeOrProjectRoot) {
  let mode = DEFAULT_POLICY;
  const raw = String(policyModeOrProjectRoot || '').trim();
  if (raw === 'allow' || raw === 'privacy' || raw === 'strict-offline') {
    mode = normalizePolicy(raw);
  } else if (raw) {
    mode = resolvePolicyFromSettings(raw);
  }

  if (mode === 'allow') return {};
  if (mode === 'strict-offline') return { ...getBasePrivacyEnv(), ...getStrictOfflineEnv() };
  return getBasePrivacyEnv();
}

module.exports = {
  getPrivacyHardeningEnv,
  normalizePolicy
};
