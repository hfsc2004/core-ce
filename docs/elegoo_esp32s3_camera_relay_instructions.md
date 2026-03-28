# PSF Relay — Elegoo ESP32S3-Camera V1.0 Integration Guide
## For GPT-Codex Implementation

---

## Hardware Overview

- **Board**: Elegoo ESP32S3-Camera-V1.0
- **MCU**: ESP32-S3-WROOM-1 (8MB OPI PSRAM, 8MB Flash)
- **Sensor**: OV3660 (24-pin FPC ribbon)
- **Connectivity**: WiFi 802.11 b/g/n (2.4GHz ONLY — no 5GHz)
- **USB**: Native USB-C (JTAG/Serial debug unit — no FTDI needed)
- **JST Connector (P1, left to right)**: +5V, GND, RX (GPIO3), TX (GPIO40)
- **Status LEDs**: POW (power), STA (GPIO46 — dim=bootloader, bright=running)

---

## Confirmed GPIO Pin Mapping (from official Elegoo schematic)

```
PWDN    = -1   (controlled manually via GPIO46 — see init sequence below)
RESET   = -1
XCLK    = 15
SIOD    = 4    (I2C SDA)
SIOC    = 5    (I2C SCL)
Y9      = 16
Y8      = 17
Y7      = 18
Y6      = 12
Y5      = 10
Y4      = 8
Y3      = 9
Y2      = 11
VSYNC   = 6
HREF    = 7
PCLK    = 13
```

**CRITICAL**: GPIO46 controls the STA LED AND must be power-cycled to wake the OV3660.
Without cycling GPIO46 HIGH→LOW before `esp_camera_init()`, the camera returns `0x106 ESP_ERR_NOT_SUPPORTED`.

---

## Arduino Board Configuration (MANDATORY)

```
Board:             ESP32S3 Dev Module (esp32:esp32:esp32s3)
PSRAM:             OPI PSRAM          ← CRITICAL — wrong PSRAM = camera fail
Flash Mode:        QIO 80MHz
Flash Size:        8MB (64Mb)         ← CRITICAL — wrong size = no boot
USB CDC On Boot:   Enabled            ← Required for auto-reset flashing
Partition Scheme:  8M with spiffs (3MB APP/1.5MB SPIFFS)
Upload Speed:      921600
```

arduino-cli FQBN string:
```
esp32:esp32:esp32s3:PSRAM=opi,FlashMode=qio,FlashSize=8M,USBMode=hwcdc,CDCOnBoot=cdc,PartitionScheme=default_8MB
```

---

## Required Library

The bundled `esp_camera` library in arduino-esp32 3.3.7 does NOT include the OV3660 driver.
You MUST use the cloned Espressif esp32-camera library:

```bash
git clone https://github.com/espressif/esp32-camera.git /path/to/libraries/esp32-camera
```

Pass to arduino-cli with:
```
--libraries /path/to/libraries/esp32-camera
```

---

## Critical Camera Init Sequence

```cpp
// STEP 1: Power cycle GPIO46 BEFORE esp_camera_init()
// Without this, OV3660 returns 0x106 (ESP_ERR_NOT_SUPPORTED)
pinMode(46, OUTPUT);
digitalWrite(46, HIGH);
delay(100);
digitalWrite(46, LOW);
delay(100);

// STEP 2: Configure camera
camera_config_t config;
config.ledc_channel = LEDC_CHANNEL_0;
config.ledc_timer   = LEDC_TIMER_0;
config.pin_d0       = 11;  // Y2
config.pin_d1       = 9;   // Y3
config.pin_d2       = 8;   // Y4
config.pin_d3       = 10;  // Y5
config.pin_d4       = 12;  // Y6
config.pin_d5       = 18;  // Y7
config.pin_d6       = 17;  // Y8
config.pin_d7       = 16;  // Y9
config.pin_xclk     = 15;
config.pin_pclk     = 13;
config.pin_vsync    = 6;
config.pin_href     = 7;
config.pin_sccb_sda = 4;
config.pin_sccb_scl = 5;
config.pin_pwdn     = -1;
config.pin_reset    = -1;
config.xclk_freq_hz = 20000000;
config.pixel_format = PIXFORMAT_JPEG;
config.frame_size   = FRAMESIZE_SVGA;
config.jpeg_quality = 10;
config.fb_count     = 2;
config.fb_location  = CAMERA_FB_IN_PSRAM;
config.grab_mode    = CAMERA_GRAB_LATEST;

// STEP 3: Init
esp_err_t err = esp_camera_init(&config);

// STEP 4: Tune sensor if init succeeded
if (err == ESP_OK) {
    sensor_t* s = esp_camera_sensor_get();
    if (s) {
        s->set_vflip(s, 1);
        s->set_brightness(s, 1);
        s->set_saturation(s, -2);
    }
}
```

---

## HTTP Endpoints (port 81)

```
GET /health   → JSON status: {"ok":bool,"ip":"...","rssi":int,"error":"..."}
GET /capture  → JPEG image snapshot
GET /stream   → MJPEG multipart stream (~12fps)
```

### Correct capture handler (use send_P for binary data):

```cpp
server.on("/capture", []() {
    if (!cameraOk) { server.send(503, "text/plain", "camera not ready"); return; }
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { server.send(500, "text/plain", "capture failed"); return; }
    server.send_P(200, "image/jpeg", (const char*)fb->buf, fb->len);
    esp_camera_fb_return(fb);
});
```

**WARNING**: Do NOT use `server.send(200)` followed by `client.write()` — this sends zero bytes.
Always use `server.send_P()` for binary frame data.

---

## Flashing Procedure

### First time / recovery (board stuck in bootloader):

```bash
# 1. Activate esptool venv
source ~/esptool-env/bin/activate

# 2. Kill anything holding the port
fuser -k /dev/ttyACM0

# 3. Erase flash (use --before no-reset if already in bootloader mode)
esptool --port /dev/ttyACM0 --chip esp32s3 erase_flash

# 4. Compile
arduino-cli compile \
  --fqbn "esp32:esp32:esp32s3:PSRAM=opi,FlashMode=qio,FlashSize=8M,USBMode=hwcdc,CDCOnBoot=cdc,PartitionScheme=default_8MB" \
  --libraries /path/to/esp32-camera \
  /path/to/sketch/sketch.ino

# 5. Upload
arduino-cli upload \
  --fqbn "esp32:esp32:esp32s3:PSRAM=opi,FlashMode=qio,FlashSize=8M,USBMode=hwcdc,CDCOnBoot=cdc,PartitionScheme=default_8MB" \
  --port /dev/ttyACM0 \
  /path/to/sketch/sketch.ino
```

### Normal re-flash (board running, CDCOnBoot=cdc enabled):

```bash
fuser -k /dev/ttyACM0
arduino-cli compile --fqbn "..." --libraries "..." sketch.ino && \
arduino-cli upload --fqbn "..." --port /dev/ttyACM0 sketch.ino
```

No BOOT button needed when CDCOnBoot=cdc is set — auto-reset works via USB CDC.

---

## Network Configuration

- **Protocol**: WiFi STA mode (connects to existing AP)
- **Band**: 2.4GHz ONLY
- **Recommended AP channel**: 1 or 6 (avoid crowded channels)
- **Recommended AP power**: 20-25mW (higher causes more interference, not better signal)
- **Static IP recommended** to avoid discovery complexity
- **Port**: 81 (HTTP)

```cpp
IPAddress ip(172, 20, 0, 16);
IPAddress gw(172, 20, 0, 1);
IPAddress mask(255, 255, 255, 0);
WiFi.config(ip, gw, mask);
WiFi.begin(ssid, password);
```

---

## Architecture Notes for Relay Integration

- Run camera init as a **FreeRTOS task pinned to core 0** to avoid blocking the webserver on core 1
- Run `server.handleClient()` in the main loop on core 1
- Camera init takes 2-5 seconds — health endpoint should report `"ok":false` during init, not hang
- MJPEG stream blocks the client connection — use a dedicated handler, not the main loop
- The OV3660 supports up to 1600×1200 @ 15fps or 800×600 @ 30fps over WiFi
- SVGA (800×600) is the recommended default — good balance of quality and throughput

---

## Diagnostic Error Codes

| Error | Hex | Meaning |
|-------|-----|---------|
| ESP_OK | 0x0 | Camera initialized successfully |
| ESP_ERR_NOT_FOUND | 0x106 | I2C found but sensor PID mismatch — usually means GPIO46 not cycled |
| ESP_ERR_NOT_SUPPORTED | 0x106 | Same as above in some library versions |
| ESP_FAIL | 0xffffffff | Generic failure — wrong pins or library missing OV3660 driver |
| ESP_ERR_NO_MEM | 0x101 | PSRAM not configured correctly — check OPI PSRAM board setting |

---

## Common Failure Modes & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `"ok":false, "error":"0x106"` | GPIO46 not cycled before init | Add pinMode(46,OUTPUT); HIGH→delay→LOW before esp_camera_init() |
| `"ok":false, "error":"0xffffffff"` | Wrong pins or missing OV3660 driver | Use confirmed pin map + cloned esp32-camera library |
| No WiFi, dim LED | Wrong board config (PSRAM/flash) | Use OPI PSRAM + 8MB flash + CDCOnBoot=cdc |
| Port busy during upload | screen or other process holding /dev/ttyACM0 | fuser -k /dev/ttyACM0 before every upload |
| Zero byte capture | Wrong HTTP send method | Use server.send_P() not server.send()+client.write() |
| Intermittent ping | 2.4GHz channel congestion | Change AP to channel 1 or 6, reduce TX power |

