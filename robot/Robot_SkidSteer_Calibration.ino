// ESP32 + L298N skid-steer drivetrain calibration
// Left track/wheels = OUT1/OUT2, Right track/wheels = OUT3/OUT4

// ===== Pins =====
const int ENA = 12;  // left PWM
const int IN1 = 13;  // left dir A
const int IN2 = 14;  // left dir B
const int ENB = 25;  // right PWM
const int IN3 = 26;  // right dir A
const int IN4 = 27;  // right dir B

const int MOTOR_PWM_FREQ = 1000;
const int MOTOR_PWM_RESOLUTION = 8;

// ===== Calibration toggles =====
const bool INVERT_LEFT_MOTOR = false;
const bool INVERT_RIGHT_MOTOR = false;

// Base speeds for balance test (change these)
int LEFT_BASE = 170;
int RIGHT_BASE = 170;

int clamp255(int v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

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

void leftForward(int speed) {
  setLeftForwardDir();
  ledcWrite(ENA, clamp255(speed));
}

void leftReverse(int speed) {
  setLeftReverseDir();
  ledcWrite(ENA, clamp255(speed));
}

void rightForward(int speed) {
  setRightForwardDir();
  ledcWrite(ENB, clamp255(speed));
}

void rightReverse(int speed) {
  setRightReverseDir();
  ledcWrite(ENB, clamp255(speed));
}

void forward(int leftSpeed, int rightSpeed) {
  setLeftForwardDir();
  setRightForwardDir();
  ledcWrite(ENA, clamp255(leftSpeed));
  ledcWrite(ENB, clamp255(rightSpeed));
}

void reverseBoth(int leftSpeed, int rightSpeed) {
  setLeftReverseDir();
  setRightReverseDir();
  ledcWrite(ENA, clamp255(leftSpeed));
  ledcWrite(ENB, clamp255(rightSpeed));
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
  delay(500);

  Serial.println("=== SKID-STEER CALIBRATION START ===");
  Serial.printf("INVERT_LEFT=%d INVERT_RIGHT=%d\n", INVERT_LEFT_MOTOR, INVERT_RIGHT_MOTOR);
  Serial.printf("LEFT_BASE=%d RIGHT_BASE=%d\n", LEFT_BASE, RIGHT_BASE);
}

void loop() {
  // 1) LEFT forward only
  Serial.println("TEST 1: LEFT forward only (2s)");
  stopMotors(); delay(300);
  leftForward(170);
  delay(2000);

  // 2) RIGHT forward only
  Serial.println("TEST 2: RIGHT forward only (2s)");
  stopMotors(); delay(300);
  rightForward(170);
  delay(2000);

  // 3) LEFT reverse only
  Serial.println("TEST 3: LEFT reverse only (2s)");
  stopMotors(); delay(300);
  leftReverse(170);
  delay(2000);

  // 4) RIGHT reverse only
  Serial.println("TEST 4: RIGHT reverse only (2s)");
  stopMotors(); delay(300);
  rightReverse(170);
  delay(2000);

  // 5) BOTH forward base speeds
  Serial.printf("TEST 5: BOTH forward L=%d R=%d (3s)\n", LEFT_BASE, RIGHT_BASE);
  stopMotors(); delay(300);
  forward(LEFT_BASE, RIGHT_BASE);
  delay(3000);

  // 6) BOTH reverse base speeds
  Serial.printf("TEST 6: BOTH reverse L=%d R=%d (3s)\n", LEFT_BASE, RIGHT_BASE);
  stopMotors(); delay(300);
  reverseBoth(LEFT_BASE, RIGHT_BASE);
  delay(3000);

  stopMotors();
  Serial.println("Cycle complete. Adjust INVERT_* and LEFT_BASE/RIGHT_BASE, re-upload.");
  delay(2500);
}
