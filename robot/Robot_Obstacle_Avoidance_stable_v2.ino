// Robot ESP32 – Obstacle Avoidance (Stable v2)
// Adds filtering, hysteresis, and anti-spin recovery to avoid turn-lock behavior.

#include <esp_task_wdt.h>

// ========== Calibration ==========
const bool INVERT_LEFT_MOTOR = false;
const bool INVERT_RIGHT_MOTOR = false;
const bool SENSOR_ACTIVE_HIGH = true;

const int LEFT_TRIM = 0;
const int RIGHT_TRIM = 0;

// ========== Pins ==========
const int SENSOR_RIGHT = 33;
const int SENSOR_FRONT = 32;
const int SENSOR_BACK  = 35;
const int SENSOR_LEFT  = 34;

const int ENA = 12;
const int IN1 = 13;
const int IN2 = 14;
const int ENB = 25;
const int IN3 = 26;
const int IN4 = 27;

// ========== PWM ==========
const int MOTOR_PWM_FREQ = 1000;
const int MOTOR_PWM_RESOLUTION = 8;

// ========== Thresholds + Hysteresis ==========
const int CLOSE_THRESHOLD = 2500;
const int MEDIUM_THRESHOLD = 1500;
const int HYSTERESIS = 180; // prevents rapid threshold chatter

// ========== Speeds ==========
const int FULL_SPEED = 190;
const int TURN_SPEED = 170;
const int SLOW_SPEED = 125;
const int REVERSE_SPEED = 150;

// ========== Timing ==========
const int LOOP_DELAY = 20;
const unsigned long REVERSE_TIME = 320;
const unsigned long TURN_TIME = 230;
const unsigned long FORWARD_RECOVERY_TIME = 260; // anti-spin escape after turn

// If we turn too often in a short window, force a short straight drive.
const unsigned long TURN_WINDOW_MS = 5000;
const int TURN_WINDOW_LIMIT = 5;

// ========== State ==========
enum RobotState {
  DRIVING,
  REVERSING,
  TURNING,
  FORWARD_RECOVERY
};

RobotState currentState = DRIVING;
unsigned long stateStartTime = 0;
bool turnDirection = false; // false = left, true = right

int sensorRight = 0;
int sensorFront = 0;
int sensorBack  = 0;
int sensorLeft  = 0;

// Latched threshold states with hysteresis
bool frontCloseLatched = false;
bool frontMediumLatched = false;
bool rightCloseLatched = false;
bool rightMediumLatched = false;
bool leftCloseLatched = false;
bool leftMediumLatched = false;

unsigned long turnWindowStart = 0;
int turnCountInWindow = 0;

// ========== Helpers ==========
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

void setLeftMotorForwardDir() {
  if (INVERT_LEFT_MOTOR) {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, HIGH);
  } else {
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
  }
}

void setLeftMotorReverseDir() {
  if (INVERT_LEFT_MOTOR) {
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
  } else {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, HIGH);
  }
}

void setRightMotorForwardDir() {
  if (INVERT_RIGHT_MOTOR) {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, HIGH);
  } else {
    digitalWrite(IN3, HIGH);
    digitalWrite(IN4, LOW);
  }
}

void setRightMotorReverseDir() {
  if (INVERT_RIGHT_MOTOR) {
    digitalWrite(IN3, HIGH);
    digitalWrite(IN4, LOW);
  } else {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, HIGH);
  }
}

void stopMotors() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  ledcWrite(ENA, 0);
  ledcWrite(ENB, 0);
}

void driveForward(int speed) {
  setLeftMotorForwardDir();
  setRightMotorForwardDir();
  ledcWrite(ENA, withTrimLeft(speed));
  ledcWrite(ENB, withTrimRight(speed));
}

void driveReverse(int speed) {
  setLeftMotorReverseDir();
  setRightMotorReverseDir();
  ledcWrite(ENA, withTrimLeft(speed));
  ledcWrite(ENB, withTrimRight(speed));
}

void turnLeft(int speed) {
  setLeftMotorReverseDir();
  setRightMotorForwardDir();
  ledcWrite(ENA, withTrimLeft(speed));
  ledcWrite(ENB, withTrimRight(speed));
}

void turnRight(int speed) {
  setLeftMotorForwardDir();
  setRightMotorReverseDir();
  ledcWrite(ENA, withTrimLeft(speed));
  ledcWrite(ENB, withTrimRight(speed));
}

void veerLeft(int baseSpeed) {
  setLeftMotorForwardDir();
  setRightMotorForwardDir();
  ledcWrite(ENA, withTrimLeft(baseSpeed - 55));
  ledcWrite(ENB, withTrimRight(baseSpeed));
}

void veerRight(int baseSpeed) {
  setLeftMotorForwardDir();
  setRightMotorForwardDir();
  ledcWrite(ENA, withTrimLeft(baseSpeed));
  ledcWrite(ENB, withTrimRight(baseSpeed - 55));
}

void updateLatchedState(bool &latched, int value, int threshold) {
  if (!latched) {
    if (value > threshold) latched = true;
  } else {
    if (value < (threshold - HYSTERESIS)) latched = false;
  }
}

// ========== Sensor Reading ==========
void readSensors() {
  // Average burst
  int rawRight = 0;
  int rawFront = 0;
  int rawBack = 0;
  int rawLeft = 0;
  for (int i = 0; i < 4; i++) {
    rawRight += analogRead(SENSOR_RIGHT);
    rawFront += analogRead(SENSOR_FRONT);
    rawBack  += analogRead(SENSOR_BACK);
    rawLeft  += analogRead(SENSOR_LEFT);
    delayMicroseconds(120);
  }
  rawRight /= 4;
  rawFront /= 4;
  rawBack  /= 4;
  rawLeft  /= 4;

  // IIR smoothing
  static bool init = false;
  static float fRight = 0, fFront = 0, fBack = 0, fLeft = 0;
  const float alpha = 0.28f; // higher = more responsive, lower = smoother

  int nRight = normalizeSensor(rawRight);
  int nFront = normalizeSensor(rawFront);
  int nBack  = normalizeSensor(rawBack);
  int nLeft  = normalizeSensor(rawLeft);

  if (!init) {
    fRight = nRight;
    fFront = nFront;
    fBack = nBack;
    fLeft = nLeft;
    init = true;
  } else {
    fRight = alpha * nRight + (1.0f - alpha) * fRight;
    fFront = alpha * nFront + (1.0f - alpha) * fFront;
    fBack  = alpha * nBack  + (1.0f - alpha) * fBack;
    fLeft  = alpha * nLeft  + (1.0f - alpha) * fLeft;
  }

  sensorRight = (int)fRight;
  sensorFront = (int)fFront;
  sensorBack  = (int)fBack;
  sensorLeft  = (int)fLeft;

  updateLatchedState(frontCloseLatched, sensorFront, CLOSE_THRESHOLD);
  updateLatchedState(frontMediumLatched, sensorFront, MEDIUM_THRESHOLD);
  updateLatchedState(rightCloseLatched, sensorRight, CLOSE_THRESHOLD);
  updateLatchedState(rightMediumLatched, sensorRight, MEDIUM_THRESHOLD);
  updateLatchedState(leftCloseLatched, sensorLeft, CLOSE_THRESHOLD);
  updateLatchedState(leftMediumLatched, sensorLeft, MEDIUM_THRESHOLD);
}

void noteTurnEvent() {
  unsigned long now = millis();
  if (turnWindowStart == 0 || (now - turnWindowStart) > TURN_WINDOW_MS) {
    turnWindowStart = now;
    turnCountInWindow = 0;
  }
  turnCountInWindow++;
}

bool isTurnLockLikely() {
  unsigned long now = millis();
  if (turnWindowStart == 0) return false;
  if ((now - turnWindowStart) > TURN_WINDOW_MS) return false;
  return (turnCountInWindow >= TURN_WINDOW_LIMIT);
}

// ========== Behavior ==========
void handleDriving() {
  if (isTurnLockLikely()) {
    currentState = FORWARD_RECOVERY;
    stateStartTime = millis();
    return;
  }

  if (frontCloseLatched) {
    currentState = REVERSING;
    stateStartTime = millis();
    // Turn away from stronger side
    turnDirection = (sensorLeft > sensorRight); // true=right, false=left
    return;
  }

  if (rightCloseLatched && !leftCloseLatched) {
    veerLeft(TURN_SPEED);
    return;
  }
  if (leftCloseLatched && !rightCloseLatched) {
    veerRight(TURN_SPEED);
    return;
  }

  if (frontMediumLatched) {
    if (sensorLeft > sensorRight) veerRight(TURN_SPEED);
    else veerLeft(TURN_SPEED);
    return;
  }

  if (rightMediumLatched && !leftMediumLatched) {
    veerLeft(FULL_SPEED);
    return;
  }
  if (leftMediumLatched && !rightMediumLatched) {
    veerRight(FULL_SPEED);
    return;
  }

  if (rightCloseLatched && leftCloseLatched) {
    driveForward(SLOW_SPEED);
    return;
  }

  driveForward(FULL_SPEED);
}

void handleReversing() {
  driveReverse(REVERSE_SPEED);
  if ((millis() - stateStartTime) >= REVERSE_TIME) {
    currentState = TURNING;
    stateStartTime = millis();
    noteTurnEvent();
  }
}

void handleTurning() {
  if (turnDirection) turnRight(TURN_SPEED);
  else turnLeft(TURN_SPEED);

  if ((millis() - stateStartTime) >= TURN_TIME) {
    currentState = FORWARD_RECOVERY;
    stateStartTime = millis();
  }
}

void handleForwardRecovery() {
  driveForward(SLOW_SPEED);
  if ((millis() - stateStartTime) >= FORWARD_RECOVERY_TIME) {
    currentState = DRIVING;
  }
}

// ========== Setup ==========
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

  Serial.println("ESP32 Robot stable v2 ready");
  Serial.printf("Cal: IL=%d IR=%d SAH=%d LT=%d RT=%d\n", INVERT_LEFT_MOTOR, INVERT_RIGHT_MOTOR, SENSOR_ACTIVE_HIGH, LEFT_TRIM, RIGHT_TRIM);
}

void loop() {
  esp_task_wdt_reset();
  readSensors();

  switch (currentState) {
    case DRIVING: handleDriving(); break;
    case REVERSING: handleReversing(); break;
    case TURNING: handleTurning(); break;
    case FORWARD_RECOVERY: handleForwardRecovery(); break;
  }

  static unsigned long lastPrint = 0;
  if ((millis() - lastPrint) > 500) {
    Serial.printf("S:%d R:%d F:%d B:%d L:%d | latch FC:%d FM:%d RC:%d RM:%d LC:%d LM:%d | turns:%d\n",
      currentState, sensorRight, sensorFront, sensorBack, sensorLeft,
      frontCloseLatched, frontMediumLatched, rightCloseLatched, rightMediumLatched, leftCloseLatched, leftMediumLatched,
      turnCountInWindow);
    lastPrint = millis();
  }

  delay(LOOP_DELAY);
}
