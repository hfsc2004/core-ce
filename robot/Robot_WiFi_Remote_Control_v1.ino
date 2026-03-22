// ESP32 Wi-Fi Remote Control (Skid-Steer)
// - Connects to home Wi-Fi
// - HTTP command endpoint for drive control
// - Deadman timeout auto-stops motors
// - Telemetry endpoint for status

#include <WiFi.h>
#include <WebServer.h>

// ===== Wi-Fi =====
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// Network mode:
// - false: DHCP (router assigns IP/subnet/gateway/DNS)
// - true : Static IP using values below
const bool USE_STATIC_IP = false;
const IPAddress STATIC_IP(192, 168, 1, 50);

// Primary static network form (recommended): CIDR prefix
// Example: /24 => 255.255.255.0
const int STATIC_CIDR = 24; // valid 0..32

// Optional static network overrides.
// If USE_STATIC_GATEWAY=false, gateway is auto-derived from STATIC_IP (.1 host).
// STATIC_SUBNET still exists as fallback if STATIC_CIDR is invalid.
const bool USE_STATIC_GATEWAY = false;
const IPAddress STATIC_GATEWAY(192, 168, 1, 1);
const IPAddress STATIC_SUBNET(255, 255, 255, 0); // fallback only
const IPAddress STATIC_DNS1(1, 1, 1, 1);
const IPAddress STATIC_DNS2(8, 8, 8, 8);

const unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000;
const unsigned long WIFI_RETRY_DELAY_MS = 500;

// ===== Motor pins (L298N) =====
const int ENA = 12; // left PWM
const int IN1 = 13; // left dir A
const int IN2 = 14; // left dir B
const int ENB = 25; // right PWM
const int IN3 = 26; // right dir A
const int IN4 = 27; // right dir B

const int MOTOR_PWM_FREQ = 1000;
const int MOTOR_PWM_RESOLUTION = 8;

// ===== Calibration =====
const bool INVERT_LEFT_MOTOR = false;
const bool INVERT_RIGHT_MOTOR = false;
const int LEFT_TRIM = 0;     // +/- speed bias
const int RIGHT_TRIM = -20;  // start with slight right reduction if clockwise drift exists

// ===== HTTP + Safety =====
const int HTTP_PORT = 8080;
const unsigned long DEADMAN_MS = 800; // stop if no command within this window
const int MAX_SPEED = 200;

WebServer server(HTTP_PORT);

volatile int gLeftCmd = 0;   // -255..255
volatile int gRightCmd = 0;  // -255..255
volatile unsigned long gLastCmdMs = 0;

IPAddress cidrToMask(int cidr) {
  int bits = cidr;
  if (bits < 0) bits = 0;
  if (bits > 32) bits = 32;
  uint32_t mask = (bits == 0) ? 0 : (0xFFFFFFFFu << (32 - bits));
  return IPAddress(
    (mask >> 24) & 0xFF,
    (mask >> 16) & 0xFF,
    (mask >> 8) & 0xFF,
    mask & 0xFF
  );
}

IPAddress deriveGatewayFromIp(const IPAddress& ip) {
  return IPAddress(ip[0], ip[1], ip[2], 1);
}

int clamp255(int v) {
  if (v > 255) return 255;
  if (v < -255) return -255;
  return v;
}

int clampPWM(int v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

int applyLeftTrim(int speedAbs) {
  return clampPWM(speedAbs + LEFT_TRIM);
}

int applyRightTrim(int speedAbs) {
  return clampPWM(speedAbs + RIGHT_TRIM);
}

void setLeftDir(bool forward) {
  bool fwd = INVERT_LEFT_MOTOR ? !forward : forward;
  digitalWrite(IN1, fwd ? HIGH : LOW);
  digitalWrite(IN2, fwd ? LOW : HIGH);
}

void setRightDir(bool forward) {
  bool fwd = INVERT_RIGHT_MOTOR ? !forward : forward;
  digitalWrite(IN3, fwd ? HIGH : LOW);
  digitalWrite(IN4, fwd ? LOW : HIGH);
}

void stopMotors() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  ledcWrite(ENA, 0);
  ledcWrite(ENB, 0);
}

void applyMotorCommand(int left, int right) {
  left = clamp255(left);
  right = clamp255(right);

  if (left == 0 && right == 0) {
    stopMotors();
    return;
  }

  setLeftDir(left >= 0);
  setRightDir(right >= 0);

  int leftAbs = applyLeftTrim(abs(left));
  int rightAbs = applyRightTrim(abs(right));

  ledcWrite(ENA, leftAbs);
  ledcWrite(ENB, rightAbs);
}

void handleHealth() {
  String json = "{";
  json += "\"ok\":true,";
  json += "\"mode\":\"" + String(USE_STATIC_IP ? "static" : "dhcp") + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"gateway\":\"" + WiFi.gatewayIP().toString() + "\",";
  json += "\"subnet\":\"" + WiFi.subnetMask().toString() + "\",";
  json += "\"dns1\":\"" + WiFi.dnsIP(0).toString() + "\",";
  json += "\"dns2\":\"" + WiFi.dnsIP(1).toString() + "\",";
  json += "\"port\":" + String(HTTP_PORT);
  json += "}";
  server.send(200, "application/json", json);
}

void handleTelemetry() {
  unsigned long age = millis() - gLastCmdMs;
  String json = "{";
  json += "\"left\":" + String(gLeftCmd) + ",";
  json += "\"right\":" + String(gRightCmd) + ",";
  json += "\"deadmanMs\":" + String(DEADMAN_MS) + ",";
  json += "\"lastCmdAgeMs\":" + String(age) + ",";
  json += "\"wifiRssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"gateway\":\"" + WiFi.gatewayIP().toString() + "\",";
  json += "\"subnet\":\"" + WiFi.subnetMask().toString() + "\"";
  json += "}";
  server.send(200, "application/json", json);
}

// /cmd?left=120&right=120
// /cmd?fwd=160
// /cmd?rev=140
// /cmd?turn=120   (right turn)
// /cmd?turn=-120  (left turn)
// /cmd?stop=1
void handleCmd() {
  bool hasAny = false;
  int left = gLeftCmd;
  int right = gRightCmd;

  if (server.hasArg("stop")) {
    left = 0;
    right = 0;
    hasAny = true;
  }

  if (server.hasArg("left") || server.hasArg("right")) {
    left = server.hasArg("left") ? server.arg("left").toInt() : left;
    right = server.hasArg("right") ? server.arg("right").toInt() : right;
    hasAny = true;
  }

  if (server.hasArg("fwd")) {
    int s = server.arg("fwd").toInt();
    left = s;
    right = s;
    hasAny = true;
  }

  if (server.hasArg("rev")) {
    int s = abs(server.arg("rev").toInt());
    left = -s;
    right = -s;
    hasAny = true;
  }

  if (server.hasArg("turn")) {
    int s = server.arg("turn").toInt();
    if (s >= 0) {
      // right turn
      left = abs(s);
      right = -abs(s);
    } else {
      // left turn
      left = -abs(s);
      right = abs(s);
    }
    hasAny = true;
  }

  if (!hasAny) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"no command args\"}");
    return;
  }

  left = constrain(left, -MAX_SPEED, MAX_SPEED);
  right = constrain(right, -MAX_SPEED, MAX_SPEED);

  gLeftCmd = left;
  gRightCmd = right;
  gLastCmdMs = millis();

  applyMotorCommand(gLeftCmd, gRightCmd);

  String json = "{";
  json += "\"ok\":true,";
  json += "\"left\":" + String(gLeftCmd) + ",";
  json += "\"right\":" + String(gRightCmd);
  json += "}";
  server.send(200, "application/json", json);
}

void handleRoot() {
  String help;
  help += "ESP32 Remote Control online\\n";
  help += "GET /health\\n";
  help += "GET /telemetry\\n";
  help += "GET /cmd?fwd=160\\n";
  help += "GET /cmd?rev=140\\n";
  help += "GET /cmd?turn=120 (right)\\n";
  help += "GET /cmd?turn=-120 (left)\\n";
  help += "GET /cmd?left=120&right=90\\n";
  help += "GET /cmd?stop=1\\n";
  server.send(200, "text/plain", help);
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  if (USE_STATIC_IP) {
    IPAddress subnet = (STATIC_CIDR >= 0 && STATIC_CIDR <= 32) ? cidrToMask(STATIC_CIDR) : STATIC_SUBNET;
    IPAddress gateway = USE_STATIC_GATEWAY ? STATIC_GATEWAY : deriveGatewayFromIp(STATIC_IP);
    const configured = WiFi.config(STATIC_IP, gateway, subnet, STATIC_DNS1, STATIC_DNS2);
    if (!configured) {
      Serial.println("Static IP config failed; falling back to DHCP.");
    } else {
      Serial.print("Static IP requested: ");
      Serial.println(STATIC_IP);
      Serial.print("Static Subnet: ");
      Serial.println(subnet);
      Serial.print("Static Gateway: ");
      Serial.println(gateway);
    }
  }
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Connecting Wi-Fi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
    if ((millis() - start) > WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println("\\nWi-Fi timeout, retrying...");
      WiFi.disconnect(true);
      delay(WIFI_RETRY_DELAY_MS);
      if (USE_STATIC_IP) {
        IPAddress subnet = (STATIC_CIDR >= 0 && STATIC_CIDR <= 32) ? cidrToMask(STATIC_CIDR) : STATIC_SUBNET;
        IPAddress gateway = USE_STATIC_GATEWAY ? STATIC_GATEWAY : deriveGatewayFromIp(STATIC_IP);
        WiFi.config(STATIC_IP, gateway, subnet, STATIC_DNS1, STATIC_DNS2);
      }
      WiFi.begin(WIFI_SSID, WIFI_PASS);
      start = millis();
    }
  }
  Serial.println();
  Serial.println("Wi-Fi connected.");
  Serial.print("  Mode: "); Serial.println(USE_STATIC_IP ? "STATIC" : "DHCP");
  Serial.print("  SSID: "); Serial.println(WIFI_SSID);
  Serial.print("  IP: "); Serial.println(WiFi.localIP());
  Serial.print("  Gateway: "); Serial.println(WiFi.gatewayIP());
  Serial.print("  Subnet: "); Serial.println(WiFi.subnetMask());
  Serial.print("  DNS1: "); Serial.println(WiFi.dnsIP(0));
  Serial.print("  DNS2: "); Serial.println(WiFi.dnsIP(1));
}

void setup() {
  Serial.begin(115200);

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  ledcAttach(ENA, MOTOR_PWM_FREQ, MOTOR_PWM_RESOLUTION);
  ledcAttach(ENB, MOTOR_PWM_FREQ, MOTOR_PWM_RESOLUTION);

  stopMotors();

  connectWifi();

  server.on("/", HTTP_GET, handleRoot);
  server.on("/health", HTTP_GET, handleHealth);
  server.on("/telemetry", HTTP_GET, handleTelemetry);
  server.on("/cmd", HTTP_GET, handleCmd);
  server.begin();

  gLeftCmd = 0;
  gRightCmd = 0;
  gLastCmdMs = millis();

  Serial.print("HTTP control server running on port ");
  Serial.println(HTTP_PORT);
}

void loop() {
  server.handleClient();

  // Deadman safety
  if ((millis() - gLastCmdMs) > DEADMAN_MS) {
    if (gLeftCmd != 0 || gRightCmd != 0) {
      gLeftCmd = 0;
      gRightCmd = 0;
      stopMotors();
      Serial.println("Deadman stop triggered");
    }
  }

  delay(5);
}
