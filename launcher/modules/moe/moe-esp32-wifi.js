/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function normalizeWifiPath(rawPath = '') {
  const value = String(rawPath || '').trim();
  if (!value) return '/health';
  return value.startsWith('/') ? value : `/${value}`;
}

function isAllowedEsp32WifiPath(rawPath = '') {
  const path = normalizeWifiPath(rawPath).toLowerCase();
  if (path === '/health' || path === '/telemetry' || path === '/scan') return true;
  if (path.startsWith('/config/network')) return true;
  if (path.startsWith('/config/drive')) return true;
  if (path.startsWith('/reboot')) return true;
  if (path.startsWith('/cmd')) return true;
  return false;
}

function parseEsp32WifiScanBody(rawBody = '') {
  const text = String(rawBody || '').trim();
  if (!text) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.networks)
      ? parsed.networks
      : (Array.isArray(parsed?.aps)
        ? parsed.aps
        : (Array.isArray(parsed?.results) ? parsed.results : [])));

  const out = [];
  for (const row of list) {
    const ssid = String(row?.ssid || row?.name || '').trim();
    if (!ssid) continue;
    const rssiRaw = Number(row?.rssi);
    const channelRaw = Number(row?.channel);
    out.push({
      ssid,
      rssi: Number.isFinite(rssiRaw) ? Math.trunc(rssiRaw) : null,
      channel: Number.isFinite(channelRaw) ? Math.trunc(channelRaw) : null,
      security: String(row?.security || row?.auth || row?.encryption || '').trim(),
      bssid: String(row?.bssid || row?.mac || '').trim()
    });
  }

  out.sort((a, b) => {
    const ar = Number.isFinite(a.rssi) ? a.rssi : -9999;
    const br = Number.isFinite(b.rssi) ? b.rssi : -9999;
    return br - ar;
  });
  return out;
}

module.exports = {
  normalizeWifiPath,
  isAllowedEsp32WifiPath,
  parseEsp32WifiScanBody
};
