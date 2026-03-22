/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function buildEsp32WifiControlSketchPartB() {
  return `
String readRequestLine(WiFiClient& client) {
  String line = "";
  unsigned long start = millis();
  while (millis() - start < 2000) {
    while (client.available()) {
      char c = client.read();
      if (c == '\\r') continue;
      if (c == '\\n') return line;
      line += c;
      if (line.length() > 300) return line;
    }
    delay(1);
  }
  return line;
}

String extractPath(const String& requestLine) {
  int firstSpace = requestLine.indexOf(' ');
  if (firstSpace < 0) return "/";
  int secondSpace = requestLine.indexOf(' ', firstSpace + 1);
  if (secondSpace < 0) return "/";
  String path = requestLine.substring(firstSpace + 1, secondSpace);
  return path.length() > 0 ? path : "/";
}

String getPathOnly(const String& pathWithQuery) {
  int q = pathWithQuery.indexOf('?');
  return q >= 0 ? pathWithQuery.substring(0, q) : pathWithQuery;
}

String getQueryValue(const String& pathWithQuery, const String& key) {
  int q = pathWithQuery.indexOf('?');
  if (q < 0) return "";
  String qs = pathWithQuery.substring(q + 1);
  int start = 0;
  while (start < qs.length()) {
    int amp = qs.indexOf('&', start);
    if (amp < 0) amp = qs.length();
    String pair = qs.substring(start, amp);
    int eq = pair.indexOf('=');
    String k = eq >= 0 ? pair.substring(0, eq) : pair;
    String v = eq >= 0 ? pair.substring(eq + 1) : "";
    if (k == key) return urlDecode(v);
    start = amp + 1;
  }
  return "";
}

int parseQueryInt(const String& pathWithQuery, const String& key, int fallback) {
  String raw = getQueryValue(pathWithQuery, key);
  if (raw.length() == 0) return fallback;
  return raw.toInt();
}

bool parseIp(const String& value, IPAddress& outIp) {
  int a, b, c, d;
  if (sscanf(value.c_str(), "%d.%d.%d.%d", &a, &b, &c, &d) != 4) return false;
  if (a < 0 || a > 255 || b < 0 || b > 255 || c < 0 || c > 255 || d < 0 || d > 255) return false;
  outIp = IPAddress(a, b, c, d);
  return true;
}

void saveNetworkPrefs() {
  prefs.begin("psf-net", false);
  prefs.putString("ssid", gSsid);
  prefs.putString("pass", gPass);
  prefs.putBool("useStatic", gUseStaticIp);
  prefs.putInt("cidr", gStaticCidr);
  prefs.putBool("useGw", gUseStaticGateway);
  prefs.putString("ip", gStaticIp.toString());
  prefs.putString("gw", gStaticGateway.toString());
  prefs.putBool("drvSwap", gDriveSwapSides);
  prefs.putBool("drvInvL", gDriveInvertLeft);
  prefs.putBool("drvInvR", gDriveInvertRight);
  prefs.putInt("frontThr", gFrontThreshold);
  prefs.end();
}

void loadNetworkPrefs() {
  prefs.begin("psf-net", true);
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  bool useStatic = prefs.getBool("useStatic", USE_STATIC_IP);
  int cidr = prefs.getInt("cidr", STATIC_CIDR);
  bool useGw = prefs.getBool("useGw", USE_STATIC_GATEWAY);
  String ip = prefs.getString("ip", STATIC_IP.toString());
  String gw = prefs.getString("gw", STATIC_GATEWAY.toString());
  bool drvSwap = prefs.getBool("drvSwap", DRIVE_SWAP_SIDES);
  bool drvInvL = prefs.getBool("drvInvL", DRIVE_INVERT_LEFT);
  bool drvInvR = prefs.getBool("drvInvR", DRIVE_INVERT_RIGHT);
  int frontThr = prefs.getInt("frontThr", OBSTACLE_FRONT_THRESHOLD);
  prefs.end();

  if (ssid.length() > 0) gSsid = ssid;
  gPass = pass.length() > 0 ? pass : String(WIFI_PASS);
  gUseStaticIp = useStatic;
  gStaticCidr = cidr < 0 ? 0 : (cidr > 32 ? 32 : cidr);
  gUseStaticGateway = useGw;
  IPAddress parsed;
  if (parseIp(ip, parsed)) gStaticIp = parsed;
  if (parseIp(gw, parsed)) gStaticGateway = parsed;
  gDriveSwapSides = drvSwap;
  gDriveInvertLeft = drvInvL;
  gDriveInvertRight = drvInvR;
  gFrontThreshold = frontThr < 200 ? 200 : (frontThr > 4095 ? 4095 : frontThr);
}

void writeHttpJson(WiFiClient& client, const String& body, int status = 200) {
  client.print(String("HTTP/1.1 ") + String(status) + " OK\\r\\n");
  client.print("Content-Type: application/json\\r\\n");
  client.print("Connection: close\\r\\n");
  client.print(String("Content-Length: ") + String(body.length()) + "\\r\\n\\r\\n");
  client.print(body);
}

String wifiSecurityName(wifi_auth_mode_t mode) {
  switch (mode) {
    case WIFI_AUTH_OPEN: return "open";
    case WIFI_AUTH_WEP: return "wep";
    case WIFI_AUTH_WPA_PSK: return "wpa";
    case WIFI_AUTH_WPA2_PSK: return "wpa2";
    case WIFI_AUTH_WPA_WPA2_PSK: return "wpa/wpa2";
    case WIFI_AUTH_WPA2_ENTERPRISE: return "wpa2-enterprise";
    case WIFI_AUTH_WPA3_PSK: return "wpa3";
    case WIFI_AUTH_WPA2_WPA3_PSK: return "wpa2/wpa3";
    default: return "unknown";
  }
}

void handleClient(WiFiClient& client) {
  statusLedOn();
  String requestLine = readRequestLine(client);
  String pathWithQuery = extractPath(requestLine);
  String path = getPathOnly(pathWithQuery);
  if (path.startsWith("/health")) {
    String body = String("{\\"ok\\":true,\\"ip\\":\\"") + WiFi.localIP().toString() + "\\",\\"rssi\\":" + String(WiFi.RSSI()) + "}";
    writeHttpJson(client, body, 200);
    return;
  }
  if (path.startsWith("/telemetry")) {
    unsigned long ageMs = (gLastCmdAt == 0) ? 0 : (millis() - gLastCmdAt);
    gFrontSensor = readFrontSensorAdc();
    String body = String("{\\"ip\\":\\"") + WiFi.localIP().toString()
      + "\\",\\"rssi\\":" + String(WiFi.RSSI())
      + ",\\"ssid\\":\\"" + jsonEscape(WiFi.SSID()) + "\\""
      + ",\\"lastCmd\\":\\"" + jsonEscape(gLastCmd) + "\\""
      + ",\\"left\\":" + String(gLastLeft)
      + ",\\"right\\":" + String(gLastRight)
      + ",\\"driveActive\\":" + (gDriveActive ? "true" : "false")
      + ",\\"cmdAgeMs\\":" + String(ageMs)
      + ",\\"frontAdc\\":" + String(gFrontSensor)
      + ",\\"guardThreshold\\":" + String(gFrontThreshold)
      + ",\\"guardBlocked\\":" + (gFrontSensor >= gFrontThreshold ? "true" : "false")
      + "}";
    writeHttpJson(client, body, 200);
    return;
  }
  if (path.startsWith("/scan")) {
    int count = WiFi.scanNetworks();
    String body = "{\\"networks\\":[";
    for (int i = 0; i < count; i++) {
      if (i > 0) body += ",";
      body += String("{\\"ssid\\":\\"") + jsonEscape(WiFi.SSID(i)) + "\\",\\"rssi\\":" + String(WiFi.RSSI(i)) + ",\\"channel\\":" + String(WiFi.channel(i)) + ",\\"security\\":\\"" + wifiSecurityName(WiFi.encryptionType(i)) + "\\"}";
    }
    body += "]}";
    writeHttpJson(client, body, 200);
    return;
  }
  if (path.startsWith("/config/network")) {
    String ssid = getQueryValue(pathWithQuery, "ssid");
    String pass = getQueryValue(pathWithQuery, "pass");
    String staticRaw = getQueryValue(pathWithQuery, "static");
    String ipRaw = getQueryValue(pathWithQuery, "ip");
    String cidrRaw = getQueryValue(pathWithQuery, "cidr");
    String gwEnableRaw = getQueryValue(pathWithQuery, "gwEnabled");
    String gwRaw = getQueryValue(pathWithQuery, "gw");

    if (ssid.length() > 0) gSsid = ssid;
    if (pass.length() > 0) gPass = pass;
    if (staticRaw.length() > 0) gUseStaticIp = (staticRaw == "1" || staticRaw == "true");
    if (cidrRaw.length() > 0) {
      int cidr = cidrRaw.toInt();
      gStaticCidr = cidr < 0 ? 0 : (cidr > 32 ? 32 : cidr);
    }
    if (gwEnableRaw.length() > 0) gUseStaticGateway = (gwEnableRaw == "1" || gwEnableRaw == "true");
    IPAddress parsed;
    if (ipRaw.length() > 0 && parseIp(ipRaw, parsed)) gStaticIp = parsed;
    if (gwRaw.length() > 0 && parseIp(gwRaw, parsed)) gStaticGateway = parsed;

    saveNetworkPrefs();
    String body = String("{\\"ok\\":true,\\"applied\\":true,\\"ssid\\":\\"") + jsonEscape(gSsid) + "\\",\\"static\\":" + (gUseStaticIp ? "true" : "false") + ",\\"ip\\":\\"" + gStaticIp.toString() + "\\"}";
    writeHttpJson(client, body, 200);
    statusLedPulse(70, 70, 4);
    delay(120);
    ESP.restart();
    return;
  }
  if (path.startsWith("/config/drive")) {
    String swapRaw = getQueryValue(pathWithQuery, "swap");
    String invertLeftRaw = getQueryValue(pathWithQuery, "invertLeft");
    String invertRightRaw = getQueryValue(pathWithQuery, "invertRight");
    String frontThresholdRaw = getQueryValue(pathWithQuery, "frontThreshold");
    if (swapRaw.length() > 0) gDriveSwapSides = (swapRaw == "1" || swapRaw == "true");
    if (invertLeftRaw.length() > 0) gDriveInvertLeft = (invertLeftRaw == "1" || invertLeftRaw == "true");
    if (invertRightRaw.length() > 0) gDriveInvertRight = (invertRightRaw == "1" || invertRightRaw == "true");
    if (frontThresholdRaw.length() > 0) {
      int parsedThreshold = frontThresholdRaw.toInt();
      gFrontThreshold = parsedThreshold < 200 ? 200 : (parsedThreshold > 4095 ? 4095 : parsedThreshold);
    }
    saveNetworkPrefs();
    String body = String("{\\"ok\\":true,\\"applied\\":true,\\"swap\\":")
      + (gDriveSwapSides ? "true" : "false")
      + ",\\"invertLeft\\":" + (gDriveInvertLeft ? "true" : "false")
      + ",\\"invertRight\\":" + (gDriveInvertRight ? "true" : "false")
      + ",\\"frontThreshold\\":" + String(gFrontThreshold)
      + "}";
    writeHttpJson(client, body, 200);
    return;
  }
  if (path.startsWith("/cmd")) {
    int runMs = parseQueryInt(pathWithQuery, "ms", 0);
    runMs = runMs < 0 ? 0 : (runMs > 5000 ? 5000 : runMs);
    if (getQueryValue(pathWithQuery, "stop") == "1") {
      stopDrive("stop");
      writeHttpJson(client, "{\\"ok\\":true,\\"cmd\\":\\"stop\\"}", 200);
      return;
    }

    int left = parseQueryInt(pathWithQuery, "left", 0);
    int right = parseQueryInt(pathWithQuery, "right", 0);
    if (getQueryValue(pathWithQuery, "left").length() > 0 || getQueryValue(pathWithQuery, "right").length() > 0) {
      if (left > 0 && right > 0 && isForwardBlocked()) {
        stopDrive("guard-front");
        String body = String("{\\"ok\\":false,\\"blocked\\":true,\\"reason\\":\\"front_obstacle\\",\\"frontAdc\\":") + String(gFrontSensor) + "}";
        writeHttpJson(client, body, 409);
        return;
      }
      applyTankDrive(left, right, "tank");
      if (runMs > 0) {
        delay(runMs);
        stopDrive("timed-stop");
      }
      String body = String("{\\"ok\\":true,\\"cmd\\":\\"tank\\",\\"left\\":") + String(gLastLeft) + ",\\"right\\":" + String(gLastRight) + "}";
      writeHttpJson(client, body, 200);
      return;
    }

    int fwd = parseQueryInt(pathWithQuery, "fwd", -1);
    if (fwd >= 0) {
      if (isForwardBlocked()) {
        stopDrive("guard-front");
        String body = String("{\\"ok\\":false,\\"blocked\\":true,\\"reason\\":\\"front_obstacle\\",\\"frontAdc\\":") + String(gFrontSensor) + "}";
        writeHttpJson(client, body, 409);
        return;
      }
      int s = clampSpeed(fwd);
      applyTankDrive(s, s, "fwd");
      if (runMs > 0) {
        delay(runMs);
        stopDrive("timed-stop");
      }
      String body = String("{\\"ok\\":true,\\"cmd\\":\\"fwd\\",\\"speed\\":") + String(s) + "}";
      writeHttpJson(client, body, 200);
      return;
    }

    int rev = parseQueryInt(pathWithQuery, "rev", -1);
    if (rev >= 0) {
      int s = clampSpeed(rev);
      applyTankDrive(-s, -s, "rev");
      if (runMs > 0) {
        delay(runMs);
        stopDrive("timed-stop");
      }
      String body = String("{\\"ok\\":true,\\"cmd\\":\\"rev\\",\\"speed\\":") + String(s) + "}";
      writeHttpJson(client, body, 200);
      return;
    }

    if (getQueryValue(pathWithQuery, "turn").length() > 0) {
      int turn = clampSpeed(parseQueryInt(pathWithQuery, "turn", 0));
      if (turn == 0) {
        stopDrive("turn0");
      } else if (turn > 0) {
        applyTankDrive(turn, -turn, "turn-right");
      } else {
        applyTankDrive(turn, -turn, "turn-left");
      }
      if (runMs > 0) {
        delay(runMs);
        stopDrive("timed-stop");
      }
      String body = String("{\\"ok\\":true,\\"cmd\\":\\"turn\\",\\"turn\\":") + String(turn) + "}";
      writeHttpJson(client, body, 200);
      return;
    }

    writeHttpJson(client, "{\\"ok\\":false,\\"error\\":\\"cmd_missing\\"}", 400);
    return;
  }
  if (path.startsWith("/reboot")) {
    writeHttpJson(client, "{\\"ok\\":true,\\"reboot\\":true}", 200);
    delay(120);
    ESP.restart();
    return;
  }
  writeHttpJson(client, "{\\"ok\\":false,\\"error\\":\\"not_found\\"}", 404);
  statusLedOff();
}

void connectWifi() {
  statusLedPulse(80, 120, 2);
  if (gUseStaticIp) {
    IPAddress subnet = cidrToSubnet(gStaticCidr);
    IPAddress gateway = gUseStaticGateway ? gStaticGateway : IPAddress(gStaticIp[0], gStaticIp[1], gStaticIp[2], 1);
    WiFi.config(gStaticIp, gateway, subnet);
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(gSsid.c_str(), gPass.c_str());
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 30000) {
    if ((millis() / 250) % 2 == 0) statusLedOn();
    else statusLedOff();
    delay(250);
  }
  if (WiFi.status() == WL_CONNECTED) {
    statusLedOn();
  } else {
    statusLedPulse(60, 60, 5);
    statusLedOff();
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
#if defined(LED_BUILTIN)
  pinMode(STATUS_LED_PIN, OUTPUT);
  statusLedOff();
#endif

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(SENSOR_FRONT, INPUT);
  ledcAttach(ENA, MOTOR_PWM_FREQ, MOTOR_PWM_RESOLUTION);
  ledcAttach(ENB, MOTOR_PWM_FREQ, MOTOR_PWM_RESOLUTION);
  stopDrive("boot");

  loadNetworkPrefs();
  connectWifi();
  server.begin();
  Serial.println("ESP32 Wi-Fi control ready");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (gDriveActive && gLastCmdAt > 0 && (millis() - gLastCmdAt) > MOTOR_COMMAND_TIMEOUT_MS) {
    stopDrive("timeout");
    statusLedPulse(20, 20, 2);
  }

  WiFiClient client = server.available();
  if (!client) {
    delay(2);
    return;
  }
  handleClient(client);
  delay(1);
  client.stop();
  statusLedOff();
}
`;
}
