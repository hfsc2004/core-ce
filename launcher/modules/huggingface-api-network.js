/**
 * HuggingFace API network request helpers.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const logger = require('./logger');

const DEFAULT_TIMEOUT = 30000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'PSF-Archive/1.0';
const RECENT_RESPONSE_TTL_MS = 15000;
const HF_REQUEST_SPACING_MS = 200;

const inFlightRequests = new Map();
const recentResponses = new Map();
let hfThrottleChain = Promise.resolve();
let hfLastRequestStartedAt = 0;

function isHuggingFaceHost(hostname = '') {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return host.includes('huggingface.co') || host.includes('xethub.hf.co');
}

function wait(ms = 0) {
  const duration = Number(ms) || 0;
  if (duration <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function waitForHfThrottle(urlString = '') {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (_err) {
    return;
  }
  if (!isHuggingFaceHost(parsed.hostname)) return;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const prev = hfThrottleChain;
  hfThrottleChain = gate;
  try {
    await prev.catch(() => {});
    const now = Date.now();
    const waitMs = Math.max(0, HF_REQUEST_SPACING_MS - (now - hfLastRequestStartedAt));
    if (waitMs > 0) await wait(waitMs);
    hfLastRequestStartedAt = Date.now();
  } finally {
    release();
  }
}

function makeRequest(urlString, options = {}) {
  const {
    method = 'GET',
    timeout = DEFAULT_TIMEOUT,
    maxRedirects = MAX_REDIRECTS,
    headers = {},
    retries = 2
  } = options;

  return new Promise((resolve) => {
    const doRequest = async (url, redirectCount = 0, attempt = 0) => {
      if (redirectCount > maxRedirects) {
        resolve({ success: false, error: 'Too many redirects' });
        return;
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (e) {
        resolve({ success: false, error: `Invalid URL: ${url}` });
        return;
      }

      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      const requestOptions = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        timeout,
        headers: {
          'User-Agent': USER_AGENT,
          ...headers
        }
      };
      await waitForHfThrottle(url);

      logger.info(`[HF API] ${method} ${url} (redirect #${redirectCount})`);
      let attemptFinalized = false;
      const finalizeAttempt = (handler) => {
        if (attemptFinalized) return;
        attemptFinalized = true;
        handler();
      };

      const req = protocol.request(requestOptions, (response) => {
        if (attemptFinalized) {
          try { response.resume(); } catch (_err) {}
          return;
        }
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          let redirectUrl = response.headers.location;
          if (!redirectUrl.startsWith('http')) {
            redirectUrl = new URL(redirectUrl, url).href;
          }
          logger.info(`[HF API] Redirect to: ${redirectUrl}`);
          finalizeAttempt(() => doRequest(redirectUrl, redirectCount + 1, attempt));
          return;
        }

        if (method === 'HEAD') {
          finalizeAttempt(() => resolve({
            success: response.statusCode === 200,
            statusCode: response.statusCode,
            headers: response.headers
          }));
          return;
        }

        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          finalizeAttempt(() => resolve({
            success: response.statusCode === 200,
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
            data,
            headers: response.headers
          }));
        });
      });

      req.on('error', (err) => {
        finalizeAttempt(() => {
          if (attempt < retries) {
            logger.warn(`[HF API] Request error (retry ${attempt + 1}/${retries}): ${err.message}`);
            setTimeout(() => doRequest(url, redirectCount, attempt + 1), 350 * (attempt + 1));
            return;
          }
          logger.error(`[HF API] Request error: ${err.message}`);
          resolve({ success: false, error: `Request error: ${err.message}` });
        });
      });

      req.on('timeout', () => {
        finalizeAttempt(() => {
          req.destroy();
          if (attempt < retries) {
            logger.warn(`[HF API] Request timed out (retry ${attempt + 1}/${retries})`);
            setTimeout(() => doRequest(url, redirectCount, attempt + 1), 500 * (attempt + 1));
            return;
          }
          logger.error('[HF API] Request timed out');
          resolve({ success: false, error: `Request timed out (${timeout}ms)` });
        });
      });

      req.end();
    };

    doRequest(urlString);
  });
}

function cloneResponse(value) {
  return JSON.parse(JSON.stringify(value));
}

async function requestWithCoalescing(cacheKey, urlString, options = {}) {
  const key = String(cacheKey || '');
  const method = String(options.method || 'GET').toUpperCase();
  const now = Date.now();
  const cached = recentResponses.get(key);
  if (cached && (now - cached.ts) < RECENT_RESPONSE_TTL_MS) {
    return cloneResponse(cached.value);
  }
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }
  const promise = (async () => {
    const result = await makeRequest(urlString, options);
    if (result && result.success) {
      recentResponses.set(key, { ts: Date.now(), value: cloneResponse(result) });
    } else if (method === 'HEAD') {
      recentResponses.set(key, { ts: Date.now(), value: cloneResponse(result) });
    }
    return result;
  })().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

module.exports = {
  makeRequest,
  requestWithCoalescing,
  DEFAULT_TIMEOUT,
  MAX_REDIRECTS,
  USER_AGENT
};
