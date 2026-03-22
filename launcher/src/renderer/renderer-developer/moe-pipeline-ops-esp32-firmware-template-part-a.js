/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function buildEsp32WifiControlSketchPartA(ctx = {}) {
  const {
    safeSsid = '',
    safePass = '',
    staticEnabled = false,
    staticCidr = 24,
    gatewayEnabled = false,
    staticIpParts = [172, 20, 0, 15],
    gatewayParts = [172, 20, 0, 1],
    driveSwapSides = false,
    driveInvertLeft = false,
    driveInvertRight = false,
    obstacleFrontThreshold = 1500
  } = ctx;

  return `
// PSF Relay ESP32 Wi-Fi Control Firmware
// Generated from Gateway card settings.
// WARNING: Flashing this sketch replaces current ESP32 firmware.

#include <WiFi.h>
#include <Preferences.h>

const char* WIFI_SSID = "${safeSsid}";
const char* WIFI_PASS = "${safePass}";
const bool USE_STATIC_IP = ${staticEnabled ? 'true' : 'false'};
const int STATIC_CIDR = ${staticCidr};
const bool USE_STATIC_GATEWAY = ${gatewayEnabled ? 'true' : 'false'};
const IPAddress STATIC_IP(${staticIpParts[0]}, ${staticIpParts[1]}, ${staticIpParts[2]}, ${staticIpParts[3]});
const IPAddress STATIC_GATEWAY(${gatewayParts[0]}, ${gatewayParts[1]}, ${gatewayParts[2]}, ${gatewayParts[3]});

Preferences prefs;
WiFiServer server(8080);
String gSsid = WIFI_SSID;
String gPass = WIFI_PASS;
bool gUseStaticIp = USE_STATIC_IP;
int gStaticCidr = STATIC_CIDR;
bool gUseStaticGateway = USE_STATIC_GATEWAY;
IPAddress gStaticIp = STATIC_IP;
IPAddress gStaticGateway = STATIC_GATEWAY;

#if defined(LED_BUILTIN)
const int STATUS_LED_PIN = LED_BUILTIN;
const bool HAS_STATUS_LED = true;
#else
const bool HAS_STATUS_LED = false;
#endif

void statusLedOn() {
  if (!HAS_STATUS_LED) return;
#if defined(LED_BUILTIN)
  digitalWrite(STATUS_LED_PIN, HIGH);
#endif
}

void statusLedOff() {
  if (!HAS_STATUS_LED) return;
#if defined(LED_BUILTIN)
  digitalWrite(STATUS_LED_PIN, LOW);
#endif
}

void statusLedPulse(int onMs, int offMs, int count) {
  if (!HAS_STATUS_LED) return;
  for (int i = 0; i < count; i++) {
    statusLedOn();
    delay(onMs);
    statusLedOff();
    delay(offMs);
  }
}

// L298N motor pins (matches PSF robot defaults)
const int ENA = 12;
const int IN1 = 13;
const int IN2 = 14;
const int ENB = 25;
const int IN3 = 26;
const int IN4 = 27;
const int MOTOR_PWM_FREQ = 1000;
const int MOTOR_PWM_RESOLUTION = 8;
const int MOTOR_COMMAND_TIMEOUT_MS = 350; // deadman timeout
const bool DRIVE_SWAP_SIDES = ${driveSwapSides ? 'true' : 'false'};
const bool DRIVE_INVERT_LEFT = ${driveInvertLeft ? 'true' : 'false'};
const bool DRIVE_INVERT_RIGHT = ${driveInvertRight ? 'true' : 'false'};

// Obstacle guard (front IR ADC)
const bool OBSTACLE_GUARD_ENABLED = true;
const bool SENSOR_ACTIVE_HIGH = true; // true: larger ADC means closer
const int SENSOR_FRONT = 32;          // ADC1_CH4
const int OBSTACLE_FRONT_THRESHOLD = ${obstacleFrontThreshold};

String gLastCmd = "stop";
int gLastLeft = 0;
int gLastRight = 0;
unsigned long gLastCmdAt = 0;
bool gDriveActive = false;
bool gDriveSwapSides = DRIVE_SWAP_SIDES;
bool gDriveInvertLeft = DRIVE_INVERT_LEFT;
bool gDriveInvertRight = DRIVE_INVERT_RIGHT;
int gFrontSensor = 0;
int gFrontThreshold = OBSTACLE_FRONT_THRESHOLD;

int clampSpeed(int value) {
  if (value < -255) return -255;
  if (value > 255) return 255;
  return value;
}

void setMotorSide(int inA, int inB, int pwmPin, int speed) {
  int s = clampSpeed(speed);
  if (s == 0) {
    digitalWrite(inA, LOW);
    digitalWrite(inB, LOW);
    ledcWrite(pwmPin, 0);
    return;
  }
  if (s > 0) {
    digitalWrite(inA, HIGH);
    digitalWrite(inB, LOW);
    ledcWrite(pwmPin, s);
    return;
  }
  digitalWrite(inA, LOW);
  digitalWrite(inB, HIGH);
  ledcWrite(pwmPin, -s);
}

void applyTankDrive(int leftSpeed, int rightSpeed, const String& label) {
  int logicalLeft = clampSpeed(leftSpeed);
  int logicalRight = clampSpeed(rightSpeed);
  int physicalLeft = gDriveSwapSides ? logicalRight : logicalLeft;
  int physicalRight = gDriveSwapSides ? logicalLeft : logicalRight;
  if (gDriveInvertLeft) physicalLeft = -physicalLeft;
  if (gDriveInvertRight) physicalRight = -physicalRight;
  gLastLeft = logicalLeft;
  gLastRight = logicalRight;
  setMotorSide(IN1, IN2, ENA, physicalLeft);
  setMotorSide(IN3, IN4, ENB, physicalRight);
  gDriveActive = (gLastLeft != 0 || gLastRight != 0);
  gLastCmd = label;
  gLastCmdAt = millis();
}

void stopDrive(const String& label = "stop") {
  applyTankDrive(0, 0, label);
}

int normalizeSensorValue(int value) {
  int v = value;
  if (!SENSOR_ACTIVE_HIGH) {
    v = 4095 - v;
  }
  if (v < 0) v = 0;
  if (v > 4095) v = 4095;
  return v;
}

int readFrontSensorAdc() {
  int total = 0;
  for (int i = 0; i < 3; i++) {
    total += analogRead(SENSOR_FRONT);
    delayMicroseconds(80);
  }
  int avg = total / 3;
  return normalizeSensorValue(avg);
}

bool isForwardBlocked() {
  if (!OBSTACLE_GUARD_ENABLED) return false;
  gFrontSensor = readFrontSensorAdc();
  return gFrontSensor >= gFrontThreshold;
}

IPAddress cidrToSubnet(int cidr) {
  uint32_t mask = (cidr <= 0) ? 0 : (cidr >= 32 ? 0xFFFFFFFFu : (0xFFFFFFFFu << (32 - cidr)));
  return IPAddress(
    (mask >> 24) & 0xFF,
    (mask >> 16) & 0xFF,
    (mask >> 8) & 0xFF,
    mask & 0xFF
  );
}

String jsonEscape(const String& input) {
  String out;
  out.reserve(input.length() + 8);
  for (size_t i = 0; i < input.length(); ++i) {
    char c = input[i];
    if (c == '\\\\' || c == '\\"') out += '\\\\';
    out += c;
  }
  return out;
}

String urlDecode(const String& input) {
  String out;
  out.reserve(input.length());
  for (size_t i = 0; i < input.length(); i++) {
    char c = input[i];
    if (c == '+') {
      out += ' ';
      continue;
    }
    if (c == '%' && i + 2 < input.length()) {
      char h1 = input[i + 1];
      char h2 = input[i + 2];
      int hi = (h1 >= '0' && h1 <= '9') ? (h1 - '0')
        : (h1 >= 'a' && h1 <= 'f') ? (h1 - 'a' + 10)
        : (h1 >= 'A' && h1 <= 'F') ? (h1 - 'A' + 10)
        : -1;
      int lo = (h2 >= '0' && h2 <= '9') ? (h2 - '0')
        : (h2 >= 'a' && h2 <= 'f') ? (h2 - 'a' + 10)
        : (h2 >= 'A' && h2 <= 'F') ? (h2 - 'A' + 10)
        : -1;
      if (hi >= 0 && lo >= 0) {
        out += char((hi << 4) | lo);
        i += 2;
        continue;
      }
    }
    out += c;
  }
  return out;
}

`;
}
