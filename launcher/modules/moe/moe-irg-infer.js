/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { inferColorSequenceContract } = require('./moe-irg-infer-color');
const { applyPlanOverrides, parseLlmPlanContract } = require('./moe-irg-infer-plan');
const { normalizeWifiPath } = require('./moe-esp32-wifi');

function inferBlinkContract(message, policy) {
  const text = String(message || '').trim();
  const picoMention = /(raspberry\s*pi\s*pico|\bpico\b)/i.test(text);
  const hardwareMention = /(gpio|pin|machine\.pin|from\s+machine\s+import\s+pin|microcontroller|serial)/i.test(text);
  const blinkMention = /(blink|flash|toggle)/i.test(text);
  const gpioMention = /\b(gpio|pin)\b/i.test(text);
  if (!(picoMention || hardwareMention) || !blinkMention) return null;

  const gpioMatch = text.match(/\b(?:gpio|pin)\s*(\d{1,2})\b/i);
  const periodMsMatch = text.match(/\b(\d{1,5})\s*(ms|millisecond|milliseconds)\b/i);
  const periodSMatc = text.match(/\b(\d{1,3})(?:\.(\d{1,3}))?\s*(s|sec|second|seconds)\b/i);
  const iterationsMatch = text.match(/\b(\d{1,6})\s*(times|cycles|blinks)\b/i);

  let periodMs = policy.pico.defaultPeriodMs;
  if (periodMsMatch) {
    periodMs = Number(periodMsMatch[1]);
  } else if (periodSMatc) {
    const whole = Number(periodSMatc[1]);
    const fraction = periodSMatc[2] ? Number(`0.${periodSMatc[2]}`) : 0;
    periodMs = Math.round((whole + fraction) * 1000);
  }

  const gpio = gpioMatch ? Number(gpioMatch[1]) : policy.pico.defaultGpio;
  const iterations = iterationsMatch ? Number(iterationsMatch[1]) : policy.pico.defaultIterations;

  return {
    contractVersion: '1.0',
    target: 'raspberry-pi-pico',
    action: 'blink_gpio',
    params: { gpio, periodMs, iterations },
    source: {
      inferred: true,
      hasExplicitGpio: !!gpioMatch,
      hasExplicitPeriod: !!periodMsMatch || !!periodSMatc,
      hasExplicitIterations: !!iterationsMatch,
      hasGPIOKeyword: gpioMention
    }
  };
}

function inferEsp32PushContract(message) {
  const text = String(message || '').trim();
  if (!text) return null;
  const textWithoutCode = text.replace(/```[\s\S]*?```/g, ' ').trim();
  const esp32Mention = /\b(esp32|esp-32)\b/i.test(textWithoutCode || text);
  const pushIntent = /\b(push|upload|flash|program)\b/i.test(textWithoutCode);
  if (!esp32Mention || !pushIntent) return null;

  const code = extractEmbeddedFirmwareCode(text);
  if (!code || code.length < 40) return null;

  const expectedSerial = extractLikelyVerificationToken(code);
  return {
    contractVersion: '1.0',
    target: 'esp32',
    action: 'push_esp32_code',
    params: {
      language: 'arduino-cpp',
      code,
      verificationContains: expectedSerial || 'Robot ready!'
    },
    source: {
      inferred: true,
      hasExplicitCode: true,
      hasExplicitTarget: true
    }
  };
}

function inferEsp32WifiControlContract(message, policy) {
  const text = String(message || '').trim();
  if (!text) return null;
  const intentText = text
    .replace(/\[ESP32_TELEMETRY_SNAPSHOT\][\s\S]*?\[\/ESP32_TELEMETRY_SNAPSHOT\]/gi, ' ')
    .trim();

  const esp32Mention = /\b(esp32|esp-32|robot car|robot)\b/i.test(intentText || text);
  const wifiIntent = /\b(wifi|wi-fi|http|telemetry|health|status|scan|ssid|networks?|access points?|remote|drive|forward|reverse|backward|turn|spin|stop)\b/i.test(intentText || text);
  if (!esp32Mention && !wifiIntent) return null;

  const embeddedCode = extractEmbeddedFirmwareCode(text);
  if (embeddedCode && embeddedCode.length > 40) return null;

  const parsedUrl = text.match(/\bhttps?:\/\/([a-z0-9._-]+)(?::(\d{1,5}))?(\/[^\s]*)?/i);
  const ipMatch = text.match(/\b((?:\d{1,3}\.){3}\d{1,3})\b/);
  const mdnsMatch = text.match(/\b([a-z0-9][a-z0-9-]*\.local)\b/i);
  const host = String(
    (parsedUrl && parsedUrl[1])
    || (ipMatch && ipMatch[1])
    || (mdnsMatch && mdnsMatch[1])
    || policy?.esp32?.wifiHost
    || ''
  ).trim();
  const parsedPort = parsedUrl && parsedUrl[2] ? Number(parsedUrl[2]) : null;
  const timeoutMatch = text.match(/\b(?:esp32\s+)?(?:wifi\s+)?timeout[_\s-]*ms\s*[:=]?\s*(\d{3,6})\b/i);
  const parsedTimeout = timeoutMatch ? Number(timeoutMatch[1]) : null;
  const defaultPort = Number(policy?.esp32?.wifiPort);
  const port = Number.isInteger(parsedPort)
    ? parsedPort
    : (Number.isInteger(defaultPort) ? defaultPort : 8080);
  if (!host) return null;

  let path = '/health';
  let intent = 'health';

  const rawPathMatch = intentText.match(/\b(\/(?:health|telemetry|scan|cmd)\?[^\s]+|\/(?:health|telemetry|scan|cmd)\b)/i);
  if (rawPathMatch && rawPathMatch[1]) {
    path = normalizeWifiPath(String(rawPathMatch[1]));
    intent = path.includes('/telemetry')
      ? 'telemetry'
      : (path.includes('/cmd')
        ? 'cmd'
        : (path.includes('/scan') ? 'scan' : 'health'));
  } else {
    const hasHealth = /\b(health|alive|online|ping)\b/i.test(intentText);
    const hasTelemetry = /\b(telemetry|status|rssi)\b/i.test(intentText);
    const hasScan = /\b(scan|list|show)\b.*\b(wifi|wi-fi|ssid|network|ap|access point)s?\b/i.test(intentText)
      || /\b(wifi|wi-fi|ssid|network|ap|access point)s?\b.*\b(scan|list|show)\b/i.test(intentText);
    const hasStop = /\b(stop|halt|brake|kill)\b/i.test(intentText);
    const hasForward = /\b(forward|fwd)\b/i.test(intentText);
    const hasReverse = /\b(reverse|backward|back)\b/i.test(intentText);
    const hasTurn = /\b(turn|spin)\b/i.test(intentText);
    const turnLeft = /\b(left)\b/i.test(intentText);
    const turnRight = /\b(right)\b/i.test(intentText);
    const leftValue = intentText.match(/\bleft\s*[:=]?\s*(-?\d{1,3})\b/i);
    const rightValue = intentText.match(/\bright\s*[:=]?\s*(-?\d{1,3})\b/i);
    const speedValue = intentText.match(/\b(?:speed|at|to|fwd|forward|rev|reverse|backward|turn|spin)\s*[:=]?\s*(-?\d{1,3})\b/i);
    const durationMsMatch = intentText.match(/\b(\d{2,5})\s*(ms|millisecond|milliseconds)\b/i);
    const durationSecMatch = durationMsMatch ? null : intentText.match(/\b(\d{1,2})(?:\.(\d{1,2}))?\s*(s|sec|second|seconds)\b/i);
    const absSpeed = Math.max(0, Math.min(255, Math.abs(Number((speedValue && speedValue[1]) || 160))));
    let durationMs = null;
    if (durationMsMatch) {
      durationMs = Math.max(100, Math.min(5000, Number(durationMsMatch[1]) || 0));
    } else if (durationSecMatch) {
      const whole = Number(durationSecMatch[1] || 0);
      const frac = durationSecMatch[2] ? Number(`0.${durationSecMatch[2]}`) : 0;
      durationMs = Math.max(100, Math.min(5000, Math.round((whole + frac) * 1000)));
    }
    const withDuration = (basePath) => {
      if (!durationMs) return basePath;
      return `${basePath}${basePath.includes('?') ? '&' : '?'}ms=${durationMs}`;
    };

    if (hasHealth) {
      path = '/health';
      intent = 'health';
    } else if (hasScan) {
      path = '/scan';
      intent = 'scan';
    } else if (hasTelemetry) {
      path = '/telemetry';
      intent = 'telemetry';
    } else if (hasStop) {
      path = '/cmd?stop=1';
      intent = 'stop';
    } else if (leftValue && rightValue) {
      const l = Math.max(-255, Math.min(255, Number(leftValue[1])));
      const r = Math.max(-255, Math.min(255, Number(rightValue[1])));
      path = withDuration(`/cmd?left=${l}&right=${r}`);
      intent = 'tank';
    } else if (hasForward) {
      path = withDuration(`/cmd?fwd=${absSpeed}`);
      intent = 'forward';
    } else if (hasReverse) {
      path = withDuration(`/cmd?rev=${absSpeed}`);
      intent = 'reverse';
    } else if (hasTurn) {
      const signed = turnLeft && !turnRight ? -absSpeed : absSpeed;
      path = withDuration(`/cmd?turn=${signed}`);
      intent = 'turn';
    }
  }

  return {
    contractVersion: '1.0',
    target: 'esp32',
    action: 'esp32_wifi_http',
    params: {
      host,
      port,
      method: 'GET',
      path,
      timeoutMs: Number.isFinite(Number(policy?.esp32?.wifiTimeoutMs))
        ? Math.max(1000, Math.min(60000, Number.isInteger(parsedTimeout) ? parsedTimeout : Number(policy.esp32.wifiTimeoutMs)))
        : Math.max(1000, Math.min(60000, Number.isInteger(parsedTimeout) ? parsedTimeout : 5000)),
      intent
    },
    source: {
      inferred: true,
      hasExplicitTarget: esp32Mention,
      hasExplicitHost: !!((parsedUrl && parsedUrl[1]) || (ipMatch && ipMatch[1]) || (mdnsMatch && mdnsMatch[1]))
    }
  };
}

function extractEmbeddedFirmwareCode(text) {
  const raw = String(text || '');
  if (!raw) return '';
  const fenced = Array.from(raw.matchAll(/```(?:cpp|c\+\+|arduino|ino)?\s*([\s\S]*?)```/ig));
  if (fenced.length > 0) {
    const joined = fenced.map((m) => String(m[1] || '').trim()).filter(Boolean).join('\n\n');
    if (joined) return joined;
  }
  const splitMarker = raw.match(/(?:push|upload|flash|program)\s+(?:this\s+)?code\s+to\s+the?\s*esp-?32\s*:\s*/i);
  if (splitMarker && splitMarker.index != null) {
    const tail = raw.slice(splitMarker.index + splitMarker[0].length).trim();
    if (tail) return tail;
  }
  if ((/\b#include\b/.test(raw) || /\bvoid\s+setup\s*\(/i.test(raw) || /\bvoid\s+loop\s*\(/i.test(raw)) && raw.length > 80) {
    return raw;
  }
  return '';
}

function extractLikelyVerificationToken(code) {
  const text = String(code || '');
  if (!text) return '';
  const match = text.match(/Serial\.(?:println|print)\(\s*"([^"]{3,120})"\s*\)/i);
  return match ? String(match[1] || '').trim() : '';
}

module.exports = {
  inferBlinkContract,
  inferColorSequenceContract,
  inferEsp32PushContract,
  inferEsp32WifiControlContract,
  applyPlanOverrides,
  parseLlmPlanContract
};
