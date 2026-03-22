/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

function parseIpv4Parts(value) {
  const match = String(value || '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const parts = match.slice(1).map((n) => Number(n));
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

function buildDefaultGateway(staticIp) {
  const parts = parseIpv4Parts(staticIp);
  if (!parts) return '';
  return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
}

function escapeCppString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildEsp32WifiControlSketch(esp32 = {}) {
  const ssid = String(esp32.wifiSsid || '');
  const pass = String(esp32.wifiPassword || '');
  const staticEnabled = esp32.wifiStaticEnabled === true;
  const staticIp = String(esp32.wifiStaticIp || '').trim();
  const staticCidrRaw = Number(esp32.wifiStaticCidr);
  const staticCidr = Number.isInteger(staticCidrRaw) ? Math.max(0, Math.min(32, staticCidrRaw)) : 24;
  const gatewayEnabled = esp32.wifiStaticGatewayEnabled === true;
  const gateway = String(esp32.wifiStaticGateway || '').trim() || buildDefaultGateway(staticIp);
  const staticIpParts = parseIpv4Parts(staticIp) || [172, 20, 0, 15];
  const gatewayParts = parseIpv4Parts(gateway) || [staticIpParts[0], staticIpParts[1], staticIpParts[2], 1];
  const safeSsid = escapeCppString(ssid);
  const safePass = escapeCppString(pass);
  const driveSwapSides = esp32.wifiDriveSwapSides === true;
  const driveInvertLeft = esp32.wifiDriveInvertLeft === true;
  const driveInvertRight = esp32.wifiDriveInvertRight === true;
  const obstacleFrontThresholdRaw = Number(esp32.wifiObstacleFrontThreshold);
  const obstacleFrontThreshold = Number.isInteger(obstacleFrontThresholdRaw)
    ? Math.max(200, Math.min(4095, obstacleFrontThresholdRaw))
    : 1500;

  return buildEsp32WifiControlSketchPartA({
    safeSsid,
    safePass,
    staticEnabled,
    staticCidr,
    gatewayEnabled,
    staticIpParts,
    gatewayParts,
    driveSwapSides,
    driveInvertLeft,
    driveInvertRight,
    obstacleFrontThreshold
  }) + buildEsp32WifiControlSketchPartB();
}
