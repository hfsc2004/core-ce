/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function parseScanNetworks(rawBody) {
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
      security: String(row?.security || row?.auth || row?.encryption || '').trim()
    });
  }
  out.sort((a, b) => {
    const ar = Number.isFinite(a.rssi) ? a.rssi : -9999;
    const br = Number.isFinite(b.rssi) ? b.rssi : -9999;
    return br - ar;
  });
  return out;
}

function normalizeHttpPath(rawPath, fallback = '/') {
  const value = String(rawPath || '').trim();
  if (!value) return fallback;
  return value.startsWith('/') ? value : `/${value}`;
}

function getGatewayEsp32CameraUrl(gatewayId, mode = 'stream') {
  const gateway = readGatewayById(gatewayId);
  if (!gateway) return '';
  const esp32 = gateway?.irg?.esp32 || {};
  const host = String(esp32.wifiCameraHost || '').trim();
  const port = Number(esp32.wifiCameraPort);
  const modeKey = String(mode || '').toLowerCase();
  let path = normalizeHttpPath(esp32.wifiCameraStreamPath, '/stream');
  if (modeKey === 'snapshot') {
    path = normalizeHttpPath(esp32.wifiCameraSnapshotPath, '/capture');
  } else if (modeKey === 'health') {
    path = normalizeHttpPath(esp32.wifiCameraFlashStatusPath, '/health');
  }
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return '';
  return `http://${host}:${port}${path}`;
}

function deriveGatewayFromIp(ip) {
  const raw = String(ip || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 4) return '';
  const octets = parts.map((v) => Number(v));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return '';
  octets[3] = 1;
  return octets.join('.');
}

function cidrToMask(cidrRaw) {
  const cidr = Number(cidrRaw);
  if (!Number.isInteger(cidr) || cidr < 0 || cidr > 32) return '255.255.255.0';
  let bits = cidr;
  const octets = [0, 0, 0, 0].map(() => {
    const take = Math.max(0, Math.min(8, bits));
    bits -= take;
    return take === 0 ? 0 : (256 - Math.pow(2, 8 - take));
  });
  return octets.join('.');
}

function getCameraBoardProfileConfig(esp32 = {}) {
  const profile = String(esp32.wifiCameraBoardProfile || '').trim().toLowerCase() || 'ai-thinker-esp32cam';
  if (profile === 'elegoo-esp32s3-camera-v1') {
    let defaultPinProfileKey = String(esp32.wifiCameraPinProfile || 'elegoo-s3-eye-vendor-a').trim().toLowerCase();
    if (defaultPinProfileKey === 's3-samuelw-style') defaultPinProfileKey = 'elegoo-s3-eye-vendor-a';
    if (!defaultPinProfileKey) defaultPinProfileKey = 'elegoo-s3-eye-vendor-a';
    return {
      id: 'elegoo-esp32s3-camera-v1',
      label: 'Elegoo ESP32S3-Camera V1.0',
      defaultPinProfileKey,
      pinProfiles: [
        {
          key: 'elegoo-s3-eye-vendor-a',
          label: 'Elegoo S3 Eye (Vendor A)',
          pins: { pwdn: -1, reset: -1, xclk: 15, siod: 4, sioc: 5, y9: 16, y8: 17, y7: 18, y6: 12, y5: 10, y4: 8, y3: 9, y2: 11, vsync: 6, href: 7, pclk: 13 }
        },
        {
          key: 'elegoo-s3-eye-vendor-b',
          label: 'Elegoo S3 Eye (Vendor B)',
          pins: { pwdn: -1, reset: -1, xclk: 39, siod: 21, sioc: 46, y9: 40, y8: 38, y7: 37, y6: 35, y5: 33, y4: 48, y3: 47, y2: 34, vsync: 42, href: 41, pclk: 36 }
        },
        {
          key: 's3-samuelw-style',
          label: 'S3 SamuelW-style',
          pins: { pwdn: 46, reset: -1, xclk: 10, siod: 17, sioc: 18, y9: 21, y8: 42, y7: 40, y6: 41, y5: 39, y4: 15, y3: 38, y2: 16, vsync: 48, href: 47, pclk: 45 }
        },
        {
          key: 's3-xiao-style',
          label: 'S3 XIAO-style',
          pins: { pwdn: -1, reset: -1, xclk: 10, siod: 40, sioc: 39, y9: 48, y8: 11, y7: 12, y6: 14, y5: 16, y4: 18, y3: 17, y2: 15, vsync: 38, href: 47, pclk: 13 }
        },
        {
          key: 's3-m5-style',
          label: 'S3 M5-style',
          pins: { pwdn: -1, reset: 21, xclk: 11, siod: 17, sioc: 41, y9: 13, y8: 4, y7: 10, y6: 5, y5: 7, y4: 16, y3: 15, y2: 6, vsync: 42, href: 18, pclk: 12 }
        },
        {
          key: 's3-lilygo-v12-style',
          label: 'S3 LilyGO v1.2-style',
          pins: { pwdn: 4, reset: -1, xclk: 7, siod: 1, sioc: 2, y9: 6, y8: 8, y7: 9, y6: 11, y5: 13, y4: 15, y3: 14, y2: 12, vsync: 3, href: 5, pclk: 10 }
        }
      ]
    };
  }
  return {
    id: 'ai-thinker-esp32cam',
    label: 'AI Thinker ESP32-CAM',
    defaultPinProfileKey: 'ai-thinker',
    pinProfiles: [
      {
        key: 'ai-thinker',
        label: 'AI Thinker',
        pins: { pwdn: 32, reset: -1, xclk: 0, siod: 26, sioc: 27, y9: 35, y8: 34, y7: 39, y6: 36, y5: 21, y4: 19, y3: 18, y2: 5, vsync: 25, href: 23, pclk: 22 }
      }
    ]
  };
}

function buildEsp32CameraSketch(esp32 = {}) {
  const ssid = String(esp32.wifiCameraSsid || esp32.wifiSsid || '').trim();
  const pass = String(esp32.wifiCameraPassword || esp32.wifiPassword || '');
  const staEnabled = esp32.wifiCameraStaEnabled !== false;
  const host = String(esp32.wifiCameraHost || '').trim();
  const port = Number.isInteger(Number(esp32.wifiCameraPort)) ? Number(esp32.wifiCameraPort) : 81;
  const streamPath = normalizeHttpPath(esp32.wifiCameraStreamPath, '/stream');
  const snapshotPath = normalizeHttpPath(esp32.wifiCameraSnapshotPath, '/capture');
  const healthPath = normalizeHttpPath(esp32.wifiCameraFlashStatusPath, '/health');
  const staticEnabled = esp32.wifiCameraStaticEnabled === true;
  const staticIp = String(esp32.wifiCameraStaticIp || '').trim() || host;
  const cidr = Number.isInteger(Number(esp32.wifiCameraStaticCidr)) ? Number(esp32.wifiCameraStaticCidr) : 24;
  const subnetMask = cidrToMask(cidr);
  const gw = esp32.wifiCameraStaticGatewayEnabled === true
    ? String(esp32.wifiCameraStaticGateway || '').trim()
    : deriveGatewayFromIp(staticIp || host);
  const board = getCameraBoardProfileConfig(esp32);
  const activePinProfileKey = (() => {
    const wanted = String(board.defaultPinProfileKey || '').trim().toLowerCase();
    const found = Array.isArray(board.pinProfiles)
      ? board.pinProfiles.find((p) => String(p.key || '').trim().toLowerCase() === wanted)
      : null;
    return String(found?.key || board.pinProfiles?.[0]?.key || 'default');
  })();

  return `// PSF Relay ESP32 Camera Firmware
// Generated by PSF Relay gateway card
// Camera board profile: ${board.label}

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <vector>

struct CameraPins {
  int pwdn;
  int reset;
  int xclk;
  int siod;
  int sioc;
  int y9;
  int y8;
  int y7;
  int y6;
  int y5;
  int y4;
  int y3;
  int y2;
  int vsync;
  int href;
  int pclk;
  const char* key;
};

static const CameraPins CAMERA_PIN_PROFILES[] = {
${board.pinProfiles.map((profile) => `  { ${profile.pins.pwdn}, ${profile.pins.reset}, ${profile.pins.xclk}, ${profile.pins.siod}, ${profile.pins.sioc}, ${profile.pins.y9}, ${profile.pins.y8}, ${profile.pins.y7}, ${profile.pins.y6}, ${profile.pins.y5}, ${profile.pins.y4}, ${profile.pins.y3}, ${profile.pins.y2}, ${profile.pins.vsync}, ${profile.pins.href}, ${profile.pins.pclk}, "${profile.key}" }`).join(',\n')}
};
static const int CAMERA_PIN_PROFILE_COUNT = sizeof(CAMERA_PIN_PROFILES) / sizeof(CAMERA_PIN_PROFILES[0]);
const char* CAMERA_PIN_PROFILE_KEY = ${JSON.stringify(activePinProfileKey)};

const char* WIFI_SSID = ${JSON.stringify(ssid)};
const char* WIFI_PASS = ${JSON.stringify(pass)};
const bool WIFI_STA_ENABLED = ${staEnabled ? 'true' : 'false'};
const char* CAMERA_BOARD_PROFILE = ${JSON.stringify(board.id)};
const bool IS_ELEGOO_S3_CAMERA = ${board.id === 'elegoo-esp32s3-camera-v1' ? 'true' : 'false'};
const uint16_t HTTP_PORT = ${port};
const bool USE_STATIC_IP = ${staticEnabled ? 'true' : 'false'};
const char* STATIC_IP = ${JSON.stringify(staticIp)};
const char* STATIC_GW = ${JSON.stringify(gw)};
const char* STATIC_MASK = ${JSON.stringify(subnetMask)};
const char* FALLBACK_AP_SSID = "PSF-CAM-SETUP";
const char* FALLBACK_AP_PASS = "psfrelaycam";

WebServer server(HTTP_PORT);
bool cameraReady = false;
String activePinProfile = "none";
String lastCameraError = "";
bool wifiStaConnected = false;
unsigned long wifiLastAttemptMs = 0;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 60000;

void handleHealth() {
  String body = "{\\"ok\\":" + String(cameraReady ? "true" : "false") + ",\\"service\\":\\"esp32-cam\\",\\"profile\\":\\"" + String(CAMERA_BOARD_PROFILE) + "\\"";
  body += ",\\"pinProfile\\":\\"" + activePinProfile + "\\"";
  body += ",\\"cameraReady\\":" + String(cameraReady ? "true" : "false");
  body += ",\\"networkMode\\":\\"" + String(WIFI_STA_ENABLED ? "sta" : "disabled") + "\\"";
  body += ",\\"wifiConnected\\":" + String(wifiStaConnected ? "true" : "false");
  body += ",\\"wlStatus\\":" + String((int)WiFi.status());
  body += ",\\"ssid\\":\\"" + String(WIFI_SSID) + "\\"";
  body += ",\\"ip\\":\\"" + String(WiFi.localIP().toString()) + "\\"";
  body += ",\\"rssi\\":" + String(WiFi.RSSI());
  if (lastCameraError.length() > 0) {
    body += ",\\"cameraError\\":\\"" + lastCameraError + "\\"";
  }
  body += "}";
  server.send(200, "application/json", body);
}

void handleSnapshot() {
  if (!cameraReady) {
    String body = "{\\"ok\\":false,\\"error\\":\\"camera_not_ready\\",\\"pinProfile\\":\\"" + activePinProfile + "\\"";
    if (lastCameraError.length() > 0) body += ",\\"detail\\":\\"" + lastCameraError + "\\"";
    body += "}";
    server.send(503, "application/json", body);
    return;
  }
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    server.send(500, "application/json", "{\\"ok\\":false,\\"error\\":\\"camera_capture_failed\\"}");
    return;
  }
  server.send_P(200, "image/jpeg", (const char*)fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

void handleStream() {
  if (!cameraReady) {
    String body = "{\\"ok\\":false,\\"error\\":\\"camera_not_ready\\",\\"pinProfile\\":\\"" + activePinProfile + "\\"";
    if (lastCameraError.length() > 0) body += ",\\"detail\\":\\"" + lastCameraError + "\\"";
    body += "}";
    server.send(503, "application/json", body);
    return;
  }
  WiFiClient client = server.client();
  String headers =
    "HTTP/1.1 200 OK\\r\\n"
    "Content-Type: multipart/x-mixed-replace; boundary=frame\\r\\n"
    "Cache-Control: no-cache\\r\\n"
    "Connection: close\\r\\n\\r\\n";
  client.print(headers);

  unsigned long lastFrame = millis();
  while (client.connected()) {
    if (millis() - lastFrame < 80) { delay(2); continue; } // ~12 FPS target
    lastFrame = millis();
    camera_fb_t * fb = esp_camera_fb_get();
    if (!fb) { delay(10); continue; }
    client.print("--frame\\r\\nContent-Type: image/jpeg\\r\\nContent-Length: ");
    client.print(fb->len);
    client.print("\\r\\n\\r\\n");
    client.write(fb->buf, fb->len);
    client.print("\\r\\n");
    esp_camera_fb_return(fb);
  }
}

bool initCameraWithPins(const CameraPins& pins) {
  if (IS_ELEGOO_S3_CAMERA) {
    // Elegoo note: GPIO46 must be cycled HIGH->LOW before esp_camera_init().
    pinMode(46, OUTPUT);
    digitalWrite(46, HIGH);
    delay(100);
    digitalWrite(46, LOW);
    delay(100);
  }

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = pins.y2;
  config.pin_d1 = pins.y3;
  config.pin_d2 = pins.y4;
  config.pin_d3 = pins.y5;
  config.pin_d4 = pins.y6;
  config.pin_d5 = pins.y7;
  config.pin_d6 = pins.y8;
  config.pin_d7 = pins.y9;
  config.pin_xclk = pins.xclk;
  config.pin_pclk = pins.pclk;
  config.pin_vsync = pins.vsync;
  config.pin_href = pins.href;
  config.pin_sccb_sda = pins.siod;
  config.pin_sccb_scl = pins.sioc;
  config.pin_pwdn = pins.pwdn;
  config.pin_reset = pins.reset;
  config.xclk_freq_hz = 20000000;
  config.frame_size = FRAMESIZE_SVGA;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = 10;
  config.fb_count = 2;

  if (!psramFound()) {
    lastCameraError = "psram_not_detected";
    return false;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    lastCameraError = String("esp_camera_init failed: ") + String((int)err);
    return false;
  }
  sensor_t* s = esp_camera_sensor_get();
  if (s) {
    if (s->id.PID == OV3660_PID) {
      s->set_vflip(s, 1);
      s->set_brightness(s, 1);
      s->set_saturation(s, -2);
    }
  }
  return true;
}

bool initCamera() {
  cameraReady = false;
  activePinProfile = "none";
  lastCameraError = "";
  const CameraPins* selected = nullptr;
  for (int i = 0; i < CAMERA_PIN_PROFILE_COUNT; i++) {
    const CameraPins& candidate = CAMERA_PIN_PROFILES[i];
    if (String(candidate.key) == String(CAMERA_PIN_PROFILE_KEY)) {
      selected = &candidate;
      break;
    }
  }
  if (!selected && CAMERA_PIN_PROFILE_COUNT > 0) {
    selected = &CAMERA_PIN_PROFILES[0];
  }
  if (!selected) {
    lastCameraError = "no_camera_pin_profile_available";
    return false;
  }
  if (initCameraWithPins(*selected)) {
    cameraReady = true;
    activePinProfile = String(selected->key);
    return true;
  }
  esp_camera_deinit();
  lastCameraError = String("camera_init_failed_for_profile:") + String(selected->key) + " " + lastCameraError;
  return false;
}

bool connectWifi() {
  if (!WIFI_STA_ENABLED) {
    Serial.println("WiFi: disabled (STA off)");
    wifiStaConnected = false;
    return false;
  }
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);
  Serial.println("WiFi: starting STA mode");
  Serial.println(String("WiFi: SSID=") + WIFI_SSID);
  WiFi.disconnect(false, false);
  delay(50);
  if (USE_STATIC_IP) {
    IPAddress ip, gw, mask;
    if (ip.fromString(STATIC_IP) && gw.fromString(STATIC_GW) && mask.fromString(STATIC_MASK)) {
      Serial.println(String("WiFi: static config ip=") + STATIC_IP + " gw=" + STATIC_GW + " mask=" + STATIC_MASK);
      bool ok = WiFi.config(ip, gw, mask);
      if (!ok) {
        Serial.println("WiFi: static config apply failed");
        wifiStaConnected = false;
        return false;
      }
    } else {
      Serial.println("WiFi: static config parse failed");
      wifiStaConnected = false;
      return false;
    }
  } else {
    Serial.println("WiFi: DHCP mode");
  }
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long started = millis();
  wifiLastAttemptMs = started;
  Serial.println("WiFi: connecting...");
  while (WiFi.status() != WL_CONNECTED && millis() - started < WIFI_CONNECT_TIMEOUT_MS) {
    Serial.print(".");
    delay(250);
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(String("WiFi: connected ip=") + WiFi.localIP().toString() + " rssi=" + String(WiFi.RSSI()));
    wifiStaConnected = true;
    return true;
  } else {
    Serial.println(String("WiFi: connect timeout status=") + String((int)WiFi.status()));
    wifiStaConnected = false;
    return false;
  }
}

void setup() {
  Serial.begin(115200);
  initCamera();
  if (WIFI_STA_ENABLED) {
    connectWifi();
  } else {
    WiFi.mode(WIFI_OFF);
    wifiStaConnected = false;
    Serial.println("WiFi: serial-only test mode");
  }
  server.on(${JSON.stringify(healthPath)}, HTTP_GET, handleHealth);
  server.on(${JSON.stringify(snapshotPath)}, HTTP_GET, handleSnapshot);
  server.on(${JSON.stringify(streamPath)}, HTTP_GET, handleStream);
  server.begin();
  if (cameraReady) {
    Serial.println("ESP32 Camera ready");
    Serial.println(String("Camera pin profile: ") + activePinProfile);
  } else {
    Serial.println(String("Camera init failed: ") + lastCameraError);
  }
}

void loop() {
  if (WIFI_STA_ENABLED) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiStaConnected = true;
    } else {
      wifiStaConnected = false;
      unsigned long now = millis();
      if (now - wifiLastAttemptMs >= WIFI_RETRY_INTERVAL_MS) {
        wifiLastAttemptMs = now;
        Serial.println("WiFi: disconnected, retrying reconnect...");
        WiFi.reconnect();
      }
    }
  }
  server.handleClient();
  delay(1);
}
`;
}

function openGatewayEsp32CameraWindow(gatewayId, mode = 'stream') {
  const state = readScanState(gatewayId);
  const isSnapshot = String(mode || '').toLowerCase() === 'snapshot';
  const url = getGatewayEsp32CameraUrl(gatewayId, isSnapshot ? 'snapshot' : 'stream');
  if (!url) {
    state.cameraError = 'Set Camera Host/Port first.';
    state.cameraMessage = '';
    esp32LogStatus('[ESP32 Camera] Open blocked: configure camera Host/Port first.', 'warn');
    esp32Render();
    return;
  }
  state.cameraError = '';
  state.cameraMessage = isSnapshot ? 'Opening snapshot window...' : 'Opening camera stream window...';
  state.cameraLastUrl = url;
  const popupName = isSnapshot ? `esp32cam-shot-${gatewayId}` : `esp32cam-stream-${gatewayId}`;
  const popup = window.open(url, popupName, 'popup=yes,width=1000,height=700,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');
  if (!popup) {
    state.cameraError = 'Popup was blocked by the browser/electron policy.';
    state.cameraMessage = '';
    esp32LogStatus('[ESP32 Camera] Open failed: popup blocked.', 'error');
  } else {
    state.cameraMessage = isSnapshot ? 'Snapshot window opened.' : 'Stream window opened.';
    esp32LogStatus(`[ESP32 Camera] ${isSnapshot ? 'Snapshot' : 'Stream'} opened: ${url}`, 'success');
  }
  esp32Render();
}

async function flashGatewayEsp32CameraFirmware(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  if (!gateway) return;
  const state = readScanState(gatewayId);
  if (state.flashing) return;
  const esp32 = gateway?.irg?.esp32 || {};
  const serialPort = String(gateway?.sources?.serial?.port || '').trim();
  const cameraFqbn = String(esp32.wifiCameraFqbn || 'esp32:esp32:esp32cam').trim() || 'esp32:esp32:esp32cam';
  const cameraBoardProfile = String(esp32.wifiCameraBoardProfile || '').trim().toLowerCase() || 'ai-thinker-esp32cam';
  const cameraLibraryPath = String(esp32.wifiCameraLibraryPath || '').trim();
  const cameraStaEnabled = esp32.wifiCameraStaEnabled !== false;
  const cameraUsbCdcOnBoot = esp32.wifiCameraUsbCdcOnBoot !== false;
  const cameraEraseBeforeUpload = esp32.wifiCameraEraseBeforeUpload === true;
  const cameraCaptureRuntimeSerial = esp32.wifiCameraCaptureRuntimeSerial !== false;
  const cameraRuntimeSerialCaptureMs = Number.isInteger(Number(esp32.wifiCameraRuntimeSerialCaptureMs))
    ? Math.max(0, Math.min(120000, Number(esp32.wifiCameraRuntimeSerialCaptureMs)))
    : 20000;
  const cameraUploadMode = (cameraBoardProfile === 'elegoo-esp32s3-camera-v1' && /esp32s3/i.test(cameraFqbn))
    ? 'arduino-cli'
    : 'merged-bin';

  const ssid = String(esp32.wifiCameraSsid || esp32.wifiSsid || '').trim();
  const cameraHost = String(esp32.wifiCameraHost || '').trim();
  if (cameraStaEnabled && !ssid) {
    state.flashMessage = 'Set Camera SSID first.';
    esp32LogStatus('[ESP32 Camera] Flash blocked: Camera SSID is required.', 'warn');
    esp32Render();
    return;
  }
  if (cameraStaEnabled && !cameraHost) {
    state.flashMessage = 'Set Camera Host first (e.g. 172.20.0.16).';
    esp32LogStatus('[ESP32 Camera] Flash blocked: Camera Host is required.', 'warn');
    esp32Render();
    return;
  }
  if (!window.electronAPI?.runMoEIrgContract) {
    state.flashMessage = 'IRG contract API unavailable.';
    esp32Render();
    return;
  }

  state.flashing = true;
  state.flashMessage = 'Flashing camera firmware...';
  state.cameraError = '';
  state.cameraMessage = 'Flashing camera firmware...';
  esp32LogStatus('[ESP32 Camera] Flashing generated ESP32-CAM firmware...', 'warn');
  esp32Render();
  try {
    const sketch = buildEsp32CameraSketch(esp32);
    state.cameraLastSketch = sketch;
    const contract = {
      contractVersion: '1.0',
      target: 'esp32',
      action: 'push_esp32_code',
      params: {
        fqbn: cameraFqbn,
        cameraBoardProfile,
        cameraLibraryPath,
        strictNoFallback: true,
        eraseFlashBeforeUpload: cameraEraseBeforeUpload,
        uploadMode: cameraUploadMode,
        chip: /esp32s3/i.test(cameraFqbn) ? 'esp32s3' : 'esp32',
        wifiStaEnabled: cameraStaEnabled,
        usbCdcOnBoot: cameraUsbCdcOnBoot,
        captureRuntimeSerial: cameraCaptureRuntimeSerial,
        runtimeSerialCaptureMs: cameraRuntimeSerialCaptureMs,
        ...(serialPort && serialPort.toLowerCase() !== 'auto' ? { serialPort } : {}),
        language: 'arduino-cpp',
        code: sketch,
        verificationContains: 'ESP32 Camera ready'
      }
    };
    const result = await window.electronAPI.runMoEIrgContract(contract, {
      irgModeOverride: 'live',
      progressTag: `esp32-camera-flash:${gatewayId}`
    });
    if (!result?.success) {
      throw new Error(String(result?.error || result?.response || 'Camera flash failed'));
    }
    state.flashMessage = 'Camera flash completed.';
    state.cameraMessage = 'Camera flash completed. Probe/open stream now.';
    state.cameraLastUrl = getGatewayEsp32CameraUrl(gatewayId, 'stream');
    esp32LogStatus('[ESP32 Camera] Firmware flash complete.', 'success');
  } catch (err) {
    let msg = String(err?.message || err || 'Camera flash failed');
    if (/Wrong chip argument\?/i.test(msg) || /not ESP32/i.test(msg)) {
      msg += ' | Hint: choose a matching camera FQBN (for Elegoo ESP32S3-Camera V1.0 use esp32:esp32:esp32s3).';
    }
    if (/No serial data received/i.test(msg) || /Failed to connect to ESP32/i.test(msg)) {
      msg += ' | Hint: wrong serial port or ESP32-CAM not in boot mode (hold IO0->GND, tap RST, then flash).';
    }
    state.flashMessage = `Camera flash failed: ${msg}`;
    state.cameraError = msg;
    state.cameraMessage = '';
    esp32LogStatus(`[ESP32 Camera] Flash failed: ${msg}`, 'error');
  } finally {
    state.flashing = false;
    esp32Render();
  }
}

function showGatewayEsp32CameraSketch(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  if (!gateway) return;
  const state = readScanState(gatewayId);
  const esp32 = gateway?.irg?.esp32 || {};
  const sketch = state.cameraLastSketch || buildEsp32CameraSketch(esp32);
  state.cameraLastSketch = sketch;

  const popup = window.open('', `esp32cam-sketch-${gatewayId}`, 'popup=yes,width=1100,height=800,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=yes');
  if (!popup) {
    state.cameraError = 'Popup blocked: cannot open sketch viewer.';
    esp32Render();
    return;
  }

  const escaped = String(sketch || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  popup.document.title = 'ESP32 Camera Sketch';
  popup.document.body.innerHTML = `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 14px; background: #111; color: #ddd;">
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
        <button id="copyBtn" style="padding:6px 10px; border:1px solid #555; background:#222; color:#fff; cursor:pointer;">Copy Sketch</button>
        <span style="font-size:12px; color:#aaa;">Exact sketch rendered for gateway ${gatewayId}</span>
      </div>
      <pre id="sketchPre" style="white-space: pre; overflow: auto; border:1px solid #333; padding:12px; background:#0b0b0b;">${escaped}</pre>
    </div>
  `;
  const pre = popup.document.getElementById('sketchPre');
  const btn = popup.document.getElementById('copyBtn');
  if (btn && pre) {
    btn.onclick = async () => {
      try {
        await popup.navigator.clipboard.writeText(pre.textContent || '');
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy Sketch'; }, 1200);
      } catch {
        btn.textContent = 'Copy Failed';
        setTimeout(() => { btn.textContent = 'Copy Sketch'; }, 1200);
      }
    };
  }
}

function probeGatewayEsp32Camera(gatewayId) {
  const state = readScanState(gatewayId);
  if (state.cameraBusy) return;
  const healthUrl = getGatewayEsp32CameraUrl(gatewayId, 'health');
  const snapshotUrl = getGatewayEsp32CameraUrl(gatewayId, 'snapshot');
  const streamUrl = getGatewayEsp32CameraUrl(gatewayId, 'stream');
  const url = snapshotUrl || streamUrl;
  if (!url) {
    state.cameraError = 'Set Camera Host/Port first.';
    state.cameraMessage = '';
    esp32LogStatus('[ESP32 Camera] Probe blocked: configure camera Host/Port first.', 'warn');
    esp32Render();
    return;
  }
  state.cameraBusy = true;
  state.cameraError = '';
  state.cameraMessage = 'Probing camera health and snapshot...';
  state.cameraLastUrl = healthUrl || url;
  esp32Render();

  let settled = false;
  const done = (ok, reason = '') => {
    if (settled) return;
    settled = true;
    state.cameraBusy = false;
    if (ok) {
      state.cameraError = '';
      state.cameraLastOkAt = new Date().toISOString();
      state.cameraMessage = 'Camera reachable.';
      esp32LogStatus(`[ESP32 Camera] Probe OK: ${url}`, 'success');
    } else {
      state.cameraError = String(reason || 'Camera probe failed');
      state.cameraMessage = '';
      esp32LogStatus(`[ESP32 Camera] Probe failed: ${state.cameraError}`, 'error');
    }
    esp32Render();
  };

  const probeSnapshot = () => {
    const img = new Image();
    const timeoutMs = 4500;
    const timer = setTimeout(() => done(false, `Timeout after ${timeoutMs}ms`), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      done(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      done(false, 'Image load failed');
    };
    img.src = `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
  };

  if (!healthUrl) {
    probeSnapshot();
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  fetch(`${healthUrl}${healthUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    signal: controller.signal
  }).then(async (resp) => {
    clearTimeout(timeout);
    if (!resp.ok) {
      throw new Error(`Health HTTP ${resp.status}`);
    }
    const data = await resp.json().catch(() => ({}));
    if (data && data.cameraReady === false) {
      const detail = String(data.cameraError || data.detail || 'camera_not_ready').trim();
      const pinProfile = String(data.pinProfile || 'n/a').trim();
      throw new Error(`camera_not_ready (${pinProfile}) ${detail}`.trim());
    }
    state.cameraLastUrl = url;
    probeSnapshot();
  }).catch((err) => {
    clearTimeout(timeout);
    // Some Electron/network policies can fail fetch while image loads still work.
    // Fall back to snapshot probe so we don't report a false negative.
    const healthReason = String(err?.message || err || 'Health probe failed');
    state.cameraMessage = `Health check failed (${healthReason}); trying snapshot...`;
    state.cameraLastUrl = url;
    esp32Render();
    probeSnapshot();
  });
}

async function probeEsp32Health(host, port, timeoutMs) {
  if (!window.electronAPI?.runMoEIrgContract) {
    throw new Error('IRG contract API unavailable.');
  }
  const contract = {
    contractVersion: '1.0',
    target: 'esp32',
    action: 'esp32_wifi_http',
    params: {
      host,
      port,
      method: 'GET',
      path: '/health',
      timeoutMs: Number.isFinite(timeoutMs) ? Math.max(800, Math.min(10000, timeoutMs)) : 1500,
      intent: 'health-check'
    }
  };
  return window.electronAPI.runMoEIrgContract(contract, {
    irgModeOverride: 'live',
    progressTag: `esp32-http:${gatewayId}:${String(intent || 'request').trim()}`
  });
}

async function waitForEsp32RebootRecovery(gatewayId, host, port, timeoutMs) {
  const state = readScanState(gatewayId);
  const started = Date.now();
  const totalMs = Number.isFinite(Number(timeoutMs)) ? Math.max(6000, Math.min(120000, Number(timeoutMs))) : 35000;
  const pollEveryMs = 1700;
  const initialWaitMs = 1800;
  let firstAttempt = true;

  await sleep(initialWaitMs);
  while ((Date.now() - started) < totalMs) {
    try {
      const result = await probeEsp32Health(host, port, 1500);
      if (result?.success) {
        state.applyMessage = 'Apply complete. ESP32 back online.';
        esp32LogStatus(`[ESP32 Wi-Fi] Apply complete: ESP32 reachable at http://${host}:${port}/health`, 'success');
        esp32Render();
        return true;
      }
    } catch (err) {
      const suffix = firstAttempt ? ' (waiting for reboot...)' : '';
      state.applyMessage = `Apply sent. ESP32 rebooting to apply settings...${suffix}`;
      esp32Render();
      firstAttempt = false;
    }
    await sleep(pollEveryMs);
  }

  state.applyMessage = `Apply sent. Waiting for ESP32 at ${host}:${port} (still rebooting or unreachable).`;
  esp32LogStatus(`[ESP32 Wi-Fi] Apply sent, but health probe timed out at http://${host}:${port}/health`, 'warn');
  esp32Render();
  return false;
}

async function scanGatewayEsp32Wifi(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  if (!gateway) return;
  const esp32 = gateway?.irg?.esp32 || {};
  const host = String(esp32.wifiHost || '').trim();
  const port = Number(esp32.wifiPort);
  const timeoutMs = Number(esp32.wifiTimeoutMs);
  const state = readScanState(gatewayId);
  if (state.busy) return;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    state.error = 'Set ESP32 Wi-Fi host and port first.';
    state.networks = [];
    state.scannedAt = '';
    esp32LogStatus('[ESP32 Wi-Fi] Scan blocked: configure Host/Port first.', 'warn');
    esp32Render();
    return;
  }

  state.busy = true;
  state.error = '';
  esp32LogStatus(`[ESP32 Wi-Fi] Scanning networks via http://${host}:${port}/scan ...`, 'info');
  esp32Render();

  try {
    if (!window.electronAPI?.runMoEIrgContract) {
      throw new Error('IRG contract runner API unavailable');
    }
    const contract = {
      contractVersion: '1.0',
      target: 'esp32',
      action: 'esp32_wifi_http',
      params: {
        host,
        port,
        method: 'GET',
        path: '/scan',
        timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(60000, timeoutMs)) : 5000,
        intent: 'scan'
      }
    };
    const result = await window.electronAPI.runMoEIrgContract(contract, {
      irgModeOverride: 'live',
      progressTag: `esp32-camera-health:${gatewayId}`
    });
    if (!result?.success) {
      throw new Error(String(result?.error || result?.response || 'Scan failed'));
    }

    const body = String(result?.irg?.execution?.output?.http || '');
    const networks = parseScanNetworks(body);
    state.networks = networks;
    state.scannedAt = new Date().toISOString();
    state.error = networks.length > 0 ? '' : 'No networks in scan response.';
    esp32LogStatus(
      `[ESP32 Wi-Fi] Scan complete: ${networks.length} network(s) detected.`,
      networks.length > 0 ? 'success' : 'warn'
    );
  } catch (err) {
    state.error = String(err?.message || err || 'Scan failed');
    state.networks = [];
    state.scannedAt = '';
    esp32LogStatus(`[ESP32 Wi-Fi] Scan failed: ${state.error}`, 'error');
  } finally {
    state.busy = false;
    esp32Render();
  }
}

function getGatewayEsp32WifiScanData(gatewayId) {
  const state = readScanState(gatewayId);
  const gateway = readGatewayById(gatewayId);
  const configuredDriveSpeed = Number(gateway?.irg?.esp32?.wifiDriveSpeed);
  if (!Number.isInteger(Number(state.driveSpeed)) && Number.isInteger(configuredDriveSpeed)) {
    state.driveSpeed = Math.max(40, Math.min(255, Math.trunc(configuredDriveSpeed)));
  } else if (Number.isInteger(configuredDriveSpeed)) {
    state.driveSpeed = Math.max(40, Math.min(255, Math.trunc(configuredDriveSpeed)));
  }
  return {
    busy: state.busy === true,
    flashing: state.flashing === true,
    applying: state.applying === true,
    error: String(state.error || ''),
    flashMessage: String(state.flashMessage || ''),
    applyMessage: String(state.applyMessage || ''),
    driveActive: state.driveActive === true,
    driveDirection: String(state.driveDirection || ''),
    driveSpeed: Number.isInteger(Number(state.driveSpeed)) ? Number(state.driveSpeed) : 170,
    driveError: String(state.driveError || ''),
    driveApplying: state.driveApplying === true,
    driveApplyMessage: String(state.driveApplyMessage || ''),
    driveLastCommand: String(state.driveLastCommand || ''),
    driveLastAt: String(state.driveLastAt || ''),
    takeControl: state.takeControl === true,
    telemetryLive: state.telemetryLive && typeof state.telemetryLive === 'object' ? state.telemetryLive : null,
    telemetryLiveAt: String(state.telemetryLiveAt || ''),
    cameraBusy: state.cameraBusy === true,
    cameraError: String(state.cameraError || ''),
    cameraMessage: String(state.cameraMessage || ''),
    cameraLastUrl: String(state.cameraLastUrl || ''),
    cameraLastOkAt: String(state.cameraLastOkAt || ''),
    networks: Array.isArray(state.networks) ? state.networks : [],
    scannedAt: state.scannedAt || ''
  };
}

function selectGatewayEsp32ScannedSsid(gatewayId, ssid) {
  const value = String(ssid || '').trim();
  if (!value) return;
  if (typeof window.updateGatewayIrgEsp32Config === 'function') {
    window.updateGatewayIrgEsp32Config(gatewayId, 'wifiSsid', value);
  }
}

async function flashGatewayEsp32WifiFirmware(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  if (!gateway) return;
  const state = readScanState(gatewayId);
  if (state.flashing) return;

  const esp32 = gateway?.irg?.esp32 || {};
  const ssid = String(esp32.wifiSsid || '').trim();
  if (!ssid) {
    state.flashMessage = 'Set SSID first.';
    esp32LogStatus('[ESP32 Wi-Fi] Flash blocked: SSID is required.', 'warn');
    esp32Render();
    return;
  }
  if (!window.electronAPI?.runMoEIrgContract) {
    state.flashMessage = 'IRG contract API unavailable.';
    esp32Render();
    return;
  }

  state.flashing = true;
  state.flashMessage = 'Flashing firmware...';
  esp32LogStatus('[ESP32 Wi-Fi] Flashing generated Wi-Fi control firmware (replaces current sketch)...', 'warn');
  esp32Render();

  try {
    const sketch = buildEsp32WifiControlSketch(esp32);
    const contract = {
      contractVersion: '1.0',
      target: 'esp32',
      action: 'push_esp32_code',
      params: {
        language: 'arduino-cpp',
        code: sketch,
        verificationContains: 'ESP32 Wi-Fi control ready'
      }
    };
    const result = await window.electronAPI.runMoEIrgContract(contract, {
      irgModeOverride: 'live',
      progressTag: `esp32-wifi-flash:${gatewayId}`
    });
    if (!result?.success) {
      throw new Error(String(result?.error || result?.response || 'Flash failed'));
    }
    state.flashMessage = 'Flash completed.';
    esp32LogStatus(
      '[ESP32 Wi-Fi] Firmware flash complete. Device now exposes /health /telemetry /scan /cmd /config/drive on port 8080 (with heartbeat auto-stop).',
      'success'
    );
  } catch (err) {
    state.flashMessage = `Flash failed: ${String(err?.message || err)}`;
    esp32LogStatus(`[ESP32 Wi-Fi] Flash failed: ${String(err?.message || err)}`, 'error');
  } finally {
    state.flashing = false;
    esp32Render();
  }
}

async function applyGatewayEsp32NetworkConfig(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  if (!gateway) return;
  const state = readScanState(gatewayId);
  if (state.applying) return;
  const esp32 = gateway?.irg?.esp32 || {};
  const host = String(esp32.wifiHost || '').trim();
  const port = Number(esp32.wifiPort);
  const timeoutMs = Number(esp32.wifiTimeoutMs);
  const ssid = String(esp32.wifiSsid || '').trim();

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    state.applyMessage = 'Set Host/Port first.';
    esp32Render();
    return;
  }
  if (!ssid) {
    state.applyMessage = 'Set SSID first.';
    esp32Render();
    return;
  }
  if (!window.electronAPI?.runMoEIrgContract) {
    state.applyMessage = 'IRG contract API unavailable.';
    esp32Render();
    return;
  }

  const path = `/config/network?ssid=${encodeURIComponent(String(esp32.wifiSsid || ''))}`
    + `&pass=${encodeURIComponent(String(esp32.wifiPassword || ''))}`
    + `&static=${esp32.wifiStaticEnabled === true ? '1' : '0'}`
    + `&ip=${encodeURIComponent(String(esp32.wifiStaticIp || ''))}`
    + `&cidr=${encodeURIComponent(String(esp32.wifiStaticCidr ?? 24))}`
    + `&gwEnabled=${esp32.wifiStaticGatewayEnabled === true ? '1' : '0'}`
    + `&gw=${encodeURIComponent(String(esp32.wifiStaticGateway || ''))}`;

  state.applying = true;
  state.applyMessage = 'Applying network config...';
  esp32LogStatus(`[ESP32 Wi-Fi] Applying runtime network config to http://${host}:${port}/config/network ...`, 'info');
  esp32Render();

  try {
    const contract = {
      contractVersion: '1.0',
      target: 'esp32',
      action: 'esp32_wifi_http',
      params: {
        host,
        port,
        method: 'GET',
        path,
        timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(60000, timeoutMs)) : 5000,
        intent: 'config-network'
      }
    };
    const result = await window.electronAPI.runMoEIrgContract(contract, {
      irgModeOverride: 'live',
      progressTag: `esp32-network-apply:${gatewayId}`
    });
    if (!result?.success) {
      throw new Error(String(result?.error || result?.response || 'Apply network config failed'));
    }
    state.applyMessage = 'Apply sent. ESP32 rebooting to apply settings...';
    esp32LogStatus('[ESP32 Wi-Fi] Network config applied; ESP32 reboot triggered.', 'success');
    esp32Render();
    await waitForEsp32RebootRecovery(
      gatewayId,
      host,
      port,
      Number.isFinite(timeoutMs) ? Math.max(7000, Math.min(120000, timeoutMs * 7)) : 35000
    );
  } catch (err) {
    state.applyMessage = `Apply failed: ${String(err?.message || err)}`;
    esp32LogStatus(`[ESP32 Wi-Fi] Apply network config failed: ${String(err?.message || err)}`, 'error');
  } finally {
    state.applying = false;
    esp32Render();
  }
}

function isGatewayEsp32PasswordVisible(gatewayId) {
  const state = readScanState(gatewayId);
  return state.passwordVisible === true;
}

function toggleGatewayEsp32PasswordMask(gatewayId) {
  const state = readScanState(gatewayId);
  state.passwordVisible = !(state.passwordVisible === true);
  esp32Render();
}

function getGatewayEsp32SectionState(gatewayId) {
  const state = readScanState(gatewayId);
  const defaults = (() => {
    try {
      if (window.__PSF_GATEWAY_UI_DEFAULTS__ && typeof window.__PSF_GATEWAY_UI_DEFAULTS__ === 'object') {
        return window.__PSF_GATEWAY_UI_DEFAULTS__;
      }
      const raw = localStorage.getItem('psf-gateway-ui-defaults');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  })();
  const collapseAllByDefault = defaults?.esp32SectionsStartCollapsed === true;
  if (!state.sections || typeof state.sections !== 'object') {
    state.sections = {
      wifiControl: false,
      drivePad: false,
      staticNetwork: false,
      cameraSidecar: false
    };
  }
  return {
    wifiControl: state.sections.wifiControl === true,
    drivePad: state.sections.drivePad === true,
    staticNetwork: state.sections.staticNetwork === true,
    cameraSidecar: state.sections.cameraSidecar === true
  };
}

function toggleGatewayEsp32Section(gatewayId, sectionKey) {
  const state = readScanState(gatewayId);
  if (!state.sections || typeof state.sections !== 'object') {
    state.sections = {
      wifiControl: false,
      drivePad: false,
      staticNetwork: false,
      cameraSidecar: false
    };
  }
  const key = String(sectionKey || '').trim();
  if (!key) return;
  state.sections[key] = !(state.sections[key] === true);
  esp32Render();
}

window.scanGatewayEsp32Wifi = scanGatewayEsp32Wifi;
window.getGatewayEsp32WifiScanData = getGatewayEsp32WifiScanData;
window.selectGatewayEsp32ScannedSsid = selectGatewayEsp32ScannedSsid;
window.flashGatewayEsp32WifiFirmware = flashGatewayEsp32WifiFirmware;
window.applyGatewayEsp32NetworkConfig = applyGatewayEsp32NetworkConfig;
window.isGatewayEsp32PasswordVisible = isGatewayEsp32PasswordVisible;
window.toggleGatewayEsp32PasswordMask = toggleGatewayEsp32PasswordMask;
window.getGatewayEsp32SectionState = getGatewayEsp32SectionState;
window.toggleGatewayEsp32Section = toggleGatewayEsp32Section;
window.getGatewayEsp32CameraUrl = getGatewayEsp32CameraUrl;
window.openGatewayEsp32CameraWindow = openGatewayEsp32CameraWindow;
window.probeGatewayEsp32Camera = probeGatewayEsp32Camera;
window.flashGatewayEsp32CameraFirmware = flashGatewayEsp32CameraFirmware;
window.showGatewayEsp32CameraSketch = showGatewayEsp32CameraSketch;
