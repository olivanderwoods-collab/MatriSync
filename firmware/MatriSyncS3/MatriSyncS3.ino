// ESP32-S3, Arduino-ESP32 3.x. Encrypted BLE handoff in RAM; NO NFC writes.
// No patient plaintext or decryption keys are handled by this device.
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <mbedtls/sha256.h>
#include <mbedtls/version.h>

static const char *SERVICE = "d973f2e0-b19e-4a55-a3e6-77c89601a001";
static const char *CONTROL = "d973f2e0-b19e-4a55-a3e6-77c89601a002";
static const char *DATA = "d973f2e0-b19e-4a55-a3e6-77c89601a003";
static const char *STATUS_UUID = "d973f2e0-b19e-4a55-a3e6-77c89601a004";
static const uint32_t CAPACITY = 32768;
static uint8_t buffers[2][CAPACITY], token[8], committedToken[8], expectedHash[32];
static uint32_t total = 0, received = 0, committedSize = 0, cursor = 0;
static uint8_t active = 0, phase = 0, errorCode = 0, hashParts = 0;
static SemaphoreHandle_t mutex;
static uint32_t u32(const uint8_t *p) { return uint32_t(p[0]) | uint32_t(p[1]) << 8 | uint32_t(p[2]) << 16 | uint32_t(p[3]) << 24; }
static void put32(uint8_t *p, uint32_t v) { for (int i = 0; i < 4; ++i) p[i] = (v >> (8 * i)) & 255; }
static void fail() { errorCode = 1; }

class ControlCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    auto value = characteristic->getValue();
    const uint8_t *p = reinterpret_cast<const uint8_t *>(value.c_str());
    size_t n = value.length();
    xSemaphoreTake(mutex, portMAX_DELAY);
    if (n == 13 && p[0] == 1 && u32(p + 1) > 0 && u32(p + 1) <= CAPACITY) {
      // A new staging buffer never replaces the last complete packet.
      total = u32(p + 1); received = 0; hashParts = 0; errorCode = 0; phase = 1;
      memcpy(token, p + 5, 8); memset(expectedHash, 0, 32);
    } else if (n == 18 && p[0] == 2 && p[1] < 2 && phase == 1 && !errorCode) {
      memcpy(expectedHash + p[1] * 16, p + 2, 16); hashParts |= 1 << p[1];
    } else if (n == 1 && p[0] == 3 && phase == 1 && !errorCode && received == total && hashParts == 3) {
      uint8_t digest[32];
#if MBEDTLS_VERSION_MAJOR >= 3
      int result = mbedtls_sha256(buffers[1 - active], total, digest, 0);
#else
      int result = mbedtls_sha256_ret(buffers[1 - active], total, digest, 0);
#endif
      if (result || memcmp(digest, expectedHash, 32)) fail();
      else { active = 1 - active; committedSize = total; memcpy(committedToken, token, 8); cursor = 0; phase = 2; }
    } else if (n == 5 && p[0] == 4 && phase == 2 && !errorCode && u32(p + 1) < committedSize) {
      cursor = u32(p + 1);
    } else fail();
    xSemaphoreGive(mutex);
  }
};
class DataCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    auto value = characteristic->getValue();
    const uint8_t *p = reinterpret_cast<const uint8_t *>(value.c_str());
    size_t n = value.length();
    xSemaphoreTake(mutex, portMAX_DELAY);
    if (phase != 1 || errorCode || n < 5 || n > 20) fail();
    else {
      uint32_t offset = u32(p), count = n - 4;
      if (offset > total || count > total - offset) fail();
      else if (offset == received) { memcpy(buffers[1 - active] + offset, p + 4, count); received += count; }
      else if (offset + count > received || memcmp(buffers[1 - active] + offset, p + 4, count)) fail();
      // Exact retransmission of an acknowledged earlier chunk is harmless.
    }
    xSemaphoreGive(mutex);
  }
  void onRead(BLECharacteristic *characteristic) override {
    xSemaphoreTake(mutex, portMAX_DELAY);
    uint8_t out[20]; uint32_t count = 0;
    if (phase == 2 && !errorCode && cursor < committedSize) count = min(uint32_t(16), committedSize - cursor);
    put32(out, cursor); if (count) memcpy(out + 4, buffers[active] + cursor, count);
    characteristic->setValue(out, count + 4);
    xSemaphoreGive(mutex);
  }
};
class StatusCallbacks : public BLECharacteristicCallbacks {
  void onRead(BLECharacteristic *characteristic) override {
    xSemaphoreTake(mutex, portMAX_DELAY);
    uint8_t out[20] = {}; out[0] = 1; out[1] = phase;
    put32(out + 2, phase == 2 ? committedSize : total);
    put32(out + 6, phase == 2 ? committedSize : received);
    memcpy(out + 10, phase == 2 ? committedToken : token, 8); out[18] = errorCode;
    characteristic->setValue(out, sizeof(out)); xSemaphoreGive(mutex);
  }
};
class ServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer *) override {
    xSemaphoreTake(mutex, portMAX_DELAY);
    // Drop partial staging only. The last complete handoff survives disconnect.
    phase = committedSize ? 2 : 0; total = committedSize; received = committedSize; errorCode = 0;
    xSemaphoreGive(mutex);
    BLEDevice::startAdvertising();
  }
};
void setup() {
  Serial.begin(115200);
  mutex = xSemaphoreCreateMutex();
  if (!mutex) { Serial.println("Mutex allocation failed"); return; }
  BLEDevice::init("MatriSync-S3");
  BLEServer *server = BLEDevice::createServer(); server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(SERVICE);
  service->createCharacteristic(CONTROL, BLECharacteristic::PROPERTY_WRITE)->setCallbacks(new ControlCallbacks());
  service->createCharacteristic(DATA, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_READ)->setCallbacks(new DataCallbacks());
  service->createCharacteristic(STATUS_UUID, BLECharacteristic::PROPERTY_READ)->setCallbacks(new StatusCallbacks());
  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising(); advertising->addServiceUUID(SERVICE); advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("MatriSync BLE ready. Encrypted RAM handoff only; NFC is not implemented.");
}
void loop() { delay(100); }
