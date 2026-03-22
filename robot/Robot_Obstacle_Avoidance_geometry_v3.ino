// Robot ESP32 – Obstacle Avoidance (Geometry v3)
// Uses real sensor angles to compute a repulsion vector and steer away from obstacles.

#include <esp_task_wdt.h>
#include <math.h>

// ===== Calibration =====
const bool INVERT_LEFT_MOTOR = false;
const bool INVERT_RIGHT_MOTOR = false;
const bool SENSOR_ACTIVE_HIGH = false;   // IMPORTANT: set false if robot drives TOWARD obstacles

const int LEFT_TRIM = 0;
const int RIGHT_TRIM = 0;

// ===== Pins =====
const int SENSOR_RIGHT = 33; // front-right, 45 deg
const int SENSOR_FRONT = 32; // front, 0 deg
const int SENSOR_BACK  = 35; // rear, 180 deg
const int SENSOR_LEFT  = 34; // front-left, 315 deg

const int ENA = 12;
const int IN1 = 13;
const int IN2 = 14;
const int ENB = 25;
const int IN3 = 26;
const int IN4 = 27;

// ===== PWM =====
const int MOTOR_PWM_FREQ = 1000;
const int MOTOR_PWM_RESOLUTION = 8;

// ===== Sensor thresholds =====
const int CLOSE_THRESHOLD = 2500;
const int MEDIUM_THRESHOLD = 1500;
const int HYSTERESIS = 140;

// ===== Motion =====
const int BASE_SPEED = 180;
const int SLOW_SPEED = 130;
const int TURN_BOOST = 55;
const int REVERSE_SPEED = 150;

const unsigned long LOOP_DELAY = 20;
const unsigned long REVERSE_TIME = 260;

// ===== Sensor geometry (degrees) =====
const float ANGLE_FRONT = 0.0f;
const float ANGLE_RIGHT = 45.0f;
const float ANGLE_LEFT  = 315.0f; // == -45
const float ANGLE_BACK  = 180.0f;

// ===== State =====
enum RobotState {
  DRIVING,
  REVERSING
};
RobotState currentState = DRIVING;
unsigned long stateStartTime = 0;

int sensorRight = 0;
int sensorFront = 0;
int sensorBack = 0;
int sensorLeft = 0;

bool frontCloseLatched = false;

// ===== Helpers =====
int clampSpeed(int v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

int withTrimLeft(int s) { return clampSpeed(s + LEFT_TRIM); }
int withTrimRight(int s) { return clampSpeed(s + RIGHT_TRIM); }

int normalizeSensor(int v) {
  int out = SENSOR_ACTIVE_HIGH ? v : (4095 - v);
  if (out < 0) out = 0;
  if (out > 4095) out = 4095;
  return out;
}

float closeness01(int v) {
  // Map medium..close to 0..1, clamp outside
  float c = (float)(v - MEDIUM_THRESHOLD) / (float)(CLOSE_THRESHOLD - MEDIUM_THRESHOLD);
  if (c < 0.0f) c = 0.0f;
  if (c > 1.0f) c = 1.0f;
  return c;
}

void updateLatched(bool &latched, int value, int threshold) {
  if (!latched) {
    if (value > threshold) latched = true;
  } else {
    if (value < (threshold - HYSTERESIS)) latched = false;
  }
}

float degToRad(float d) { return d * 0.017453292519943295f; }

void setLeftForwardDir() {
  if (INVERT_LEFT_MOTOR) {
    digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  } else {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  }
}

void setLeftReverseDir() {
  if (INVERT_LEFT_MOTOR) {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  } else {
    digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
  }
}

void setRightForwardDir() {
  if (INVERT_RIGHT_MOTOR) {
    digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  } else {
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  }
}

void setRightReverseDir() {
  if (INVERT_RIGHT_MOTOR) {
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  } else {
    digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  }
}

void stopMotors() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  ledcWrite(ENA, 0);
  ledcWrite(ENB, 0);
}

void driveForwardRaw(int leftSpeed, int rightSpeed) {
  setLeftForwardDir();
  setRightForwardDir();
  ledcWrite(ENA, withTrimLeft(leftSpeed));
  ledcWrite(ENB, withTrimRight(rightSpeed));
}

void driveReverse(int speed) {
  setLeftReverseDir();
  setRightReverseDir();
  ledcWrite(ENA, withTrimLeft(speed));
  ledcWrite(ENB, withTrimRight(speed));
}

void readSensors() {
  // 4-sample average + IIR smoothing
  int rr = 0, rf = 0, rb = 0, rl = 0;
  for (int i = 0; i < 4; i++) {
    rr += analogRead(SENSOR_RIGHT);
    rf += analogRead(SENSOR_FRONT);
    rb += analogRead(SENSOR_BACK);
    rl += analogRead(SENSOR_LEFT);
    delayMicroseconds(120);
  }
  rr /= 4; rf /= 4; rb /= 4; rl /= 4;

  int nr = normalizeSensor(rr);
  int nf = normalizeSensor(rf);
  int nb = normalizeSensor(rb);
  int nl = normalizeSensor(rl);

  static bool init = false;
  static float fr = 0, ff = 0, fb = 0, fl = 0;
  const float alpha = 0.30f;

  if (!init) {
    fr = nr; ff = nf; fb = nb; fl = nl;
    init = true;
  } else {
    fr = alpha * nr + (1.0f - alpha) * fr;
    ff = alpha * nf + (1.0f - alpha) * ff;
    fb = alpha * nb + (1.0f - alpha) * fb;
    fl = alpha * nl + (1.0f - alpha) * fl;
  }

  sensorRight = (int)fr;
  sensorFront = (int)ff;
  sensorBack  = (int)fb;
  sensorLeft  = (int)fl;

  updateLatched(frontCloseLatched, sensorFront, CLOSE_THRESHOLD);
}

// Compute a repulsion vector from all sensors and convert to steering.
// Positive steer -> turn right; negative steer -> turn left.
float computeSteer() {
  float cF = closeness01(sensorFront);
  float cR = closeness01(sensorRight);
  float cL = closeness01(sensorLeft);
  float cB = closeness01(sensorBack);

  // Build obstacle vector in world frame using true sensor angles.
  float ox = 0.0f;
  float oy = 0.0f;

  ox += cF * cosf(degToRad(ANGLE_FRONT));
  oy += cF * sinf(degToRad(ANGLE_FRONT));

  ox += cR * cosf(degToRad(ANGLE_RIGHT));
  oy += cR * sinf(degToRad(ANGLE_RIGHT));

  ox += cL * cosf(degToRad(ANGLE_LEFT));
  oy += cL * sinf(degToRad(ANGLE_LEFT));

  ox += cB * cosf(degToRad(ANGLE_BACK));
  oy += cB * sinf(degToRad(ANGLE_BACK));

  // Repulsion is opposite obstacle vector.
  float rx = -ox;
  float ry = -oy;

  // For differential drive, use lateral (y) component as steering signal.
  // >0 means steer right, <0 steer left in this coordinate choice.
  return ry;
}

void handleDriving() {
  // Hard front-close: short reverse pulse to disengage.
  if (frontCloseLatched) {
    currentState = REVERSING;
    stateStartTime = millis();
    return;
  }

  float steer = computeSteer();

  // steering gain
  int delta = (int)(steer * (float)TURN_BOOST * 2.0f);
  if (delta > TURN_BOOST) delta = TURN_BOOST;
  if (delta < -TURN_BOOST) delta = -TURN_BOOST;

  // If both front-left and front-right are active, slow down.
  float frontLoad = closeness01(sensorFront) + 0.6f * (closeness01(sensorLeft) + closeness01(sensorRight));
  int base = (frontLoad > 0.9f) ? SLOW_SPEED : BASE_SPEED;

  int leftSpeed = base + delta;
  int rightSpeed = base - delta;

  driveForwardRaw(clampSpeed(leftSpeed), clampSpeed(rightSpeed));
}

void handleReversing() {
  driveReverse(REVERSE_SPEED);
  if ((millis() - stateStartTime) >= REVERSE_TIME) {
    currentState = DRIVING;
  }
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

  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = 5000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&twdt_config);
  esp_task_wdt_add(NULL);

  Serial.println("ESP32 obstacle avoid v3 ready");
  Serial.printf("Cal: IL=%d IR=%d SAH=%d LT=%d RT=%d\n",
                INVERT_LEFT_MOTOR, INVERT_RIGHT_MOTOR, SENSOR_ACTIVE_HIGH, LEFT_TRIM, RIGHT_TRIM);
}

void loop() {
  esp_task_wdt_reset();

  readSensors();

  switch (currentState) {
    case DRIVING: handleDriving(); break;
    case REVERSING: handleReversing(); break;
  }

  static unsigned long lastPrint = 0;
  if ((millis() - lastPrint) > 500) {
    float steer = computeSteer();
    Serial.printf("S:%d R:%d F:%d B:%d L:%d steer=%.3f frontClose=%d\n",
                  currentState, sensorRight, sensorFront, sensorBack, sensorLeft,
                  steer, frontCloseLatched);
    lastPrint = millis();
  }

  delay(LOOP_DELAY);
}
