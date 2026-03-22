// Robot ESP32 – Obstacle Avoidance with IR Proximity Sensors (Calibrated)
// Single ESP32 controls motors directly based on sensor readings

#include <esp_task_wdt.h>

// ========== Calibration (edit these first) ==========
const bool INVERT_LEFT_MOTOR = false;    // set true if left wheel runs backward when commanded forward
const bool INVERT_RIGHT_MOTOR = false;   // set true if right wheel runs backward when commanded forward
const bool SENSOR_ACTIVE_HIGH = true;    // true: larger ADC = closer object, false: invert ADC polarity

// Speed trims to correct constant drift/spin while driving straight.
// Positive = faster, negative = slower. Range recommendation: -40..40
const int LEFT_TRIM = 0;
const int RIGHT_TRIM = 0;

// ========== IR Proximity Sensor Pins (Analog Inputs) ==========
const int SENSOR_RIGHT = 33;  // Right IR sensor – ADC1_CH5
const int SENSOR_FRONT = 32;  // Front IR sensor – ADC1_CH4
const int SENSOR_BACK  = 35;  // Back IR sensor  – ADC1_CH7 (input-only)
const int SENSOR_LEFT  = 34;  // Left IR sensor  – ADC1_CH6 (input-only)

// ========== Motor Control Pins (to L298N) ==========
const int ENA = 12;   // Left motor speed (PWM)
const int IN1 = 13;   // Left motor forward
const int IN2 = 14;   // Left motor reverse
const int ENB = 25;   // Right motor speed (PWM)
const int IN3 = 26;   // Right motor forward
const int IN4 = 27;   // Right motor reverse

// ========== PWM Settings ==========
const int MOTOR_PWM_FREQ = 1000;       // 1kHz for L298N
const int MOTOR_PWM_RESOLUTION = 8;    // 8-bit (0-255)

// ========== Obstacle Detection Thresholds ==========
// Adjust these based on your IR sensors. Higher ADC value = closer object (when SENSOR_ACTIVE_HIGH=true).
const int CLOSE_THRESHOLD = 2500;   // Object is very close – must react
const int MEDIUM_THRESHOLD = 1500;  // Object is at medium range – start turning
const int FAR_THRESHOLD = 800;      // Object detected but far away

// ========== Speed Settings ==========
const int FULL_SPEED = 200;    // Max motor speed (0-255)
const int TURN_SPEED = 180;    // Speed during turns
const int SLOW_SPEED = 120;    // Reduced speed when obstacle nearby
const int REVERSE_SPEED = 160; // Speed when reversing

// ========== Timing ==========
const int LOOP_DELAY = 20;               // Main loop delay (ms)
const unsigned long REVERSE_TIME = 400;  // How long to reverse (ms)
const unsigned long TURN_TIME = 300;     // How long to turn after reverse (ms)

// ========== State Machine ==========
enum RobotState {
  DRIVING,
  REVERSING,
  TURNING
};

RobotState currentState = DRIVING;
unsigned long stateStartTime = 0;
bool turnDirection = false; // false = turn left, true = turn right

// ========== Sensor Values ==========
int sensorRight = 0;
int sensorFront = 0;
int sensorBack  = 0;
int sensorLeft  = 0;

// ========== Helpers ==========
int clampSpeed(int value) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

int withTrimLeft(int speed) {
  return clampSpeed(speed + LEFT_TRIM);
}

int withTrimRight(int speed) {
  return clampSpeed(speed + RIGHT_TRIM);
}

int normalizeSensor(int value) {
  int v = value;
  if (!SENSOR_ACTIVE_HIGH) {
    v = 4095 - v;
  }
  if (v < 0) v = 0;
  if (v > 4095) v = 4095;
  return v;
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

// ========== Motor Control Functions ==========

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

// Veer left – slow down left motor, keep right at full
void veerLeft(int baseSpeed) {
  setLeftMotorForwardDir();
  setRightMotorForwardDir();
  ledcWrite(ENA, withTrimLeft(baseSpeed / 2));
  ledcWrite(ENB, withTrimRight(baseSpeed));
}

// Veer right – slow down right motor, keep left at full
void veerRight(int baseSpeed) {
  setLeftMotorForwardDir();
  setRightMotorForwardDir();
  ledcWrite(ENA, withTrimLeft(baseSpeed));
  ledcWrite(ENB, withTrimRight(baseSpeed / 2));
}

// ========== Sensor Reading ==========

void readSensors() {
  // Take average of 3 readings for stability
  int rawRight = 0;
  int rawFront = 0;
  int rawBack = 0;
  int rawLeft = 0;

  for (int i = 0; i < 3; i++) {
    rawRight += analogRead(SENSOR_RIGHT);
    rawFront += analogRead(SENSOR_FRONT);
    rawBack  += analogRead(SENSOR_BACK);
    rawLeft  += analogRead(SENSOR_LEFT);
    delayMicroseconds(100);
  }

  rawRight /= 3;
  rawFront /= 3;
  rawBack  /= 3;
  rawLeft  /= 3;

  sensorRight = normalizeSensor(rawRight);
  sensorFront = normalizeSensor(rawFront);
  sensorBack  = normalizeSensor(rawBack);
  sensorLeft  = normalizeSensor(rawLeft);
}

// ========== Obstacle Avoidance Logic ==========

void handleDriving() {
  bool frontClose  = sensorFront > CLOSE_THRESHOLD;
  bool frontMedium = sensorFront > MEDIUM_THRESHOLD;
  bool rightClose  = sensorRight > CLOSE_THRESHOLD;
  bool rightMedium = sensorRight > MEDIUM_THRESHOLD;
  bool leftClose   = sensorLeft  > CLOSE_THRESHOLD;
  bool leftMedium  = sensorLeft  > MEDIUM_THRESHOLD;

  // CASE 1: Front obstacle very close – reverse and turn
  if (frontClose) {
    stopMotors();
    currentState = REVERSING;
    stateStartTime = millis();

    // Turn away from the closer side
    if (sensorLeft > sensorRight) {
      turnDirection = true;   // Turn right
    } else {
      turnDirection = false;  // Turn left
    }
    return;
  }

  // CASE 2: Both sides have close obstacles – go straight slowly if front is clear
  if (rightClose && leftClose) {
    driveForward(SLOW_SPEED);
    return;
  }

  // CASE 3: Right side close – veer left
  if (rightClose) {
    veerLeft(TURN_SPEED);
    return;
  }

  // CASE 4: Left side close – veer right
  if (leftClose) {
    veerRight(TURN_SPEED);
    return;
  }

  // CASE 5: Front at medium range – start gentle turn
  if (frontMedium) {
    if (sensorLeft > sensorRight) {
      veerRight(TURN_SPEED);
    } else {
      veerLeft(TURN_SPEED);
    }
    return;
  }

  // CASE 6: Side obstacles at medium range – gentle course correction
  if (rightMedium && !leftMedium) {
    veerLeft(FULL_SPEED);
    return;
  }
  if (leftMedium && !rightMedium) {
    veerRight(FULL_SPEED);
    return;
  }

  // CASE 7: All clear – full speed ahead
  driveForward(FULL_SPEED);
}

void handleReversing() {
  driveReverse(REVERSE_SPEED);

  if (millis() - stateStartTime >= REVERSE_TIME) {
    currentState = TURNING;
    stateStartTime = millis();
  }
}

void handleTurning() {
  if (turnDirection) {
    turnRight(TURN_SPEED);
  } else {
    turnLeft(TURN_SPEED);
  }

  if (millis() - stateStartTime >= TURN_TIME) {
    currentState = DRIVING;
  }
}

// ========== Setup ==========

void setup() {
  Serial.begin(115200);
  Serial.println("Robot ESP32 Obstacle Avoidance Starting...");

  // Setup motor direction pins as outputs
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  // Setup PWM for motor speed control
  ledcAttach(ENA, MOTOR_PWM_FREQ, MOTOR_PWM_RESOLUTION);
  ledcAttach(ENB, MOTOR_PWM_FREQ, MOTOR_PWM_RESOLUTION);

  // Initialize motors stopped
  stopMotors();

  // Initialize watchdog timer
  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = 5000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&twdt_config);
  esp_task_wdt_add(NULL);

  Serial.println("Robot ready!");
  Serial.println("Pinout:");
  Serial.println("  Sensors: Right=33, Front=32, Back=35, Left=34");
  Serial.println("  Motors:  ENA=12, IN1=13, IN2=14, ENB=25, IN3=26, IN4=27");
  Serial.printf("  Cal: INVERT_LEFT=%d INVERT_RIGHT=%d SENSOR_ACTIVE_HIGH=%d LEFT_TRIM=%d RIGHT_TRIM=%d\n",
                INVERT_LEFT_MOTOR, INVERT_RIGHT_MOTOR, SENSOR_ACTIVE_HIGH, LEFT_TRIM, RIGHT_TRIM);
}

// ========== Main Loop ==========

void loop() {
  esp_task_wdt_reset();

  // Read all sensors
  readSensors();

  // State machine for obstacle avoidance
  switch (currentState) {
    case DRIVING:
      handleDriving();
      break;
    case REVERSING:
      handleReversing();
      break;
    case TURNING:
      handleTurning();
      break;
  }

  // Debug output
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 500) {
    Serial.printf("State:%d | R:%d F:%d B:%d L:%d\n", currentState, sensorRight, sensorFront, sensorBack, sensorLeft);
    lastPrint = millis();
  }

  delay(LOOP_DELAY);
}
