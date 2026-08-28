#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <Wire.h>
#include <esp_mac.h>
#include <esp_sleep.h>
#include <esp_system.h>
#include <string>
#include <time.h>

// Board-specific configuration for the JLCPCB ESP32-C3 test board.
constexpr gpio_num_t VBUS_WAKE_PIN = GPIO_NUM_5;
constexpr uint8_t MOISTURE_PIN = 0;
constexpr uint8_t SHT40_ADDRESS = 0x44;
constexpr uint8_t BH1750_ADDRESS = 0x23;
constexpr uint8_t MEASUREMENTS_PER_CYCLE = 18;
constexpr uint32_t MEASUREMENT_INTERVAL_MS = 10000;
constexpr uint32_t WIFI_TIMEOUT_MS = 20000;
constexpr uint64_t SLEEP_SECONDS = 15 * 60;

#ifndef PLANTY_DIAG_SKIP_MANUFACTURER_DATA
#define PLANTY_DIAG_SKIP_MANUFACTURER_DATA 0
#endif

#ifndef PLANTY_DIAG_LATE_WIRE_ANALOG
#define PLANTY_DIAG_LATE_WIRE_ANALOG 0
#endif

// Set this to the Convex deployment URL before flashing.
#ifndef CONVEX_HTTP_URL
#define CONVEX_HTTP_URL "https://YOUR-CONVEX-DEPLOYMENT.convex.site"
#endif

constexpr char PROVISIONING_SERVICE_UUID[] = "7b7f0001-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char DEVICE_ID_UUID[] = "7b7f0002-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char WIFI_CREDENTIALS_UUID[] = "7b7f0003-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char PROVISIONING_STATUS_UUID[] = "7b7f0004-4e6d-4a5d-9b8e-2f2d6a0c1101";

Preferences preferences;
BLECharacteristic* statusCharacteristic = nullptr;
String deviceId;
String pendingCredentials;
volatile bool credentialsPending = false;
bool provisioningCompleted = false;

class CredentialsCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    String value = characteristic->getValue();
    if (value.length() == 0 || value.length() > 512) {
      return;
    }

    pendingCredentials = value;
    credentialsPending = true;
  }
};

String makeDeviceId() {
  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char id[24] = {};
  snprintf(id, sizeof(id), "planty-%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(id);
}

void setProvisioningStatus(const char* status) {
  if (statusCharacteristic == nullptr) {
    return;
  }

  statusCharacteristic->setValue(status);
  statusCharacteristic->notify();
}

void startProvisioning() {
  Serial.println("startProvisioning enter");
  BLEDevice::init(("Planty-" + deviceId).c_str());
  Serial.println("BLE init ok");
  BLEServer* server = BLEDevice::createServer();
  BLEService* service = server->createService(PROVISIONING_SERVICE_UUID);

  BLECharacteristic* deviceCharacteristic = service->createCharacteristic(
      DEVICE_ID_UUID, BLECharacteristic::PROPERTY_READ);
  deviceCharacteristic->setValue(deviceId.c_str());

  BLECharacteristic* credentialsCharacteristic = service->createCharacteristic(
      WIFI_CREDENTIALS_UUID, BLECharacteristic::PROPERTY_WRITE);
  credentialsCharacteristic->setCallbacks(new CredentialsCallbacks());

  statusCharacteristic = service->createCharacteristic(
      PROVISIONING_STATUS_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusCharacteristic->addDescriptor(new BLE2902());
  statusCharacteristic->setValue("idle");

  service->start();
  Serial.println("service started");
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(PROVISIONING_SERVICE_UUID);
  advertising->setScanResponse(true);
  // ESP32 BLE advertising intervals are expressed in 0.625 ms units here.
  // 480-640 => about 300-400 ms, which avoids the brownout bursts seen with
  // the default fast advertising cadence while staying responsive for pairing.
  advertising->setMinInterval(480);
  advertising->setMaxInterval(640);
  Serial.println("interval set");

#if PLANTY_DIAG_SKIP_MANUFACTURER_DATA
  Serial.println("adv data skipped");
#else
  BLEAdvertisementData advertisementData;
  advertisementData.setManufacturerData(deviceId);
  advertising->setAdvertisementData(advertisementData);
  Serial.println("adv data set");
#endif

  BLEDevice::startAdvertising();
  Serial.println("advertising started");
}

static bool extractJsonStringValue(const String& payload, const char* key, String& value) {
  String keyRef = String("\"") + key + String("\"");
  int keyIndex = payload.indexOf(keyRef);
  if (keyIndex < 0) {
    return false;
  }

  int colonIndex = payload.indexOf(':', keyIndex + keyRef.length());
  if (colonIndex < 0) {
    return false;
  }

  int startIndex = payload.indexOf('"', colonIndex + 1);
  if (startIndex < 0) {
    return false;
  }

  int endIndex = payload.indexOf('"', startIndex + 1);
  if (endIndex <= startIndex) {
    return false;
  }

  value = payload.substring(startIndex + 1, endIndex);
  return true;
}

bool parseCredentials(const String& payload, String& ssid, String& password) {
  String ssidValue;
  String passwordValue;
  if (!extractJsonStringValue(payload, "ssid", ssidValue) ||
      !extractJsonStringValue(payload, "password", passwordValue)) {
    return false;
  }

  ssid = ssidValue;
  password = passwordValue;
  return ssid.length() > 0 && ssid.length() <= 32 && password.length() <= 64;
}

bool connectToWiFi(const String& ssid, const String& password) {
  setProvisioningStatus("connecting");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  uint32_t startedAt = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_TIMEOUT_MS) {
    delay(250);
  }

  return WiFi.status() == WL_CONNECTED;
}

bool handleProvisioning() {
  if (!credentialsPending) {
    return false;
  }

  credentialsPending = false;
  String payload = pendingCredentials;
  String ssid;
  String password;
  if (!parseCredentials(payload, ssid, password) || !connectToWiFi(ssid, password)) {
    setProvisioningStatus("failed");
    WiFi.disconnect(true);
    return false;
  }

  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.putBool("provisioned", true);
  setProvisioningStatus("success");
  BLEDevice::stopAdvertising();
  delay(500);
  BLEDevice::deinit(true);
  return true;
}

bool readSht40(float& temperature, float& humidity) {
  Wire.beginTransmission(SHT40_ADDRESS);
  Wire.write(0xFD);
  if (Wire.endTransmission() != 0) {
    return false;
  }

  delay(10);
  if (Wire.requestFrom(SHT40_ADDRESS, static_cast<uint8_t>(6)) != 6) {
    return false;
  }

  uint16_t rawTemperature = (Wire.read() << 8) | Wire.read();
  Wire.read();
  uint16_t rawHumidity = (Wire.read() << 8) | Wire.read();
  Wire.read();
  temperature = -45.0f + 175.0f * rawTemperature / 65535.0f;
  humidity = -6.0f + 125.0f * rawHumidity / 65535.0f;
  return true;
}

bool readBh1750(float& lightLevel) {
  Wire.beginTransmission(BH1750_ADDRESS);
  Wire.write(0x10);
  if (Wire.endTransmission() != 0) {
    return false;
  }

  delay(180);
  if (Wire.requestFrom(BH1750_ADDRESS, static_cast<uint8_t>(2)) != 2) {
    return false;
  }

  uint16_t rawLight = (Wire.read() << 8) | Wire.read();
  lightLevel = rawLight / 1.2f;
  return true;
}

String timestampNow() {
  time_t now = time(nullptr);
  struct tm timeInfo = {};
  gmtime_r(&now, &timeInfo);
  char timestamp[25] = {};
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
  return String(timestamp);
}

bool postReading(float moisture, float temperature, float lightLevel) {
  HTTPClient client;
  String url = String(CONVEX_HTTP_URL) + "/readings";
  if (!client.begin(url)) {
    return false;
  }

  client.addHeader("Content-Type", "application/json");

  char body[256];
  String timestamp = timestampNow();
  int written = snprintf(
      body,
      sizeof(body),
      "{\"sensor_id\":\"%s\",\"moisture\":%d,\"temperature\":%.1f,\"light_level\":%d,\"timestamp\":\"%s\"}",
      deviceId.c_str(),
      static_cast<int>(roundf(moisture)),
      roundf(temperature * 10.0f) / 10.0f,
      static_cast<int>(roundf(lightLevel)),
      timestamp.c_str());

  if (written < 0 || written >= static_cast<int>(sizeof(body))) {
    client.end();
    return false;
  }

  int responseCode = client.POST(body);
  client.end();
  return responseCode >= 200 && responseCode < 300;
}

void runMeasurementCycle() {
  String ssid = preferences.getString("ssid");
  String password = preferences.getString("password");
  if (!connectToWiFi(ssid, password)) {
    return;
  }

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  for (uint8_t measurement = 0; measurement < MEASUREMENTS_PER_CYCLE; ++measurement) {
    float temperature = 0.0f;
    float humidity = 0.0f;
    float lightLevel = 0.0f;
    bool sht40Ok = readSht40(temperature, humidity);
    bool bh1750Ok = readBh1750(lightLevel);
    float moisture = analogRead(MOISTURE_PIN) / 4095.0f * 100.0f;

    if (!sht40Ok) {
      temperature = NAN;
    }
    if (!bh1750Ok) {
      lightLevel = NAN;
    }
    if (sht40Ok && bh1750Ok) {
      postReading(moisture, temperature, lightLevel);
    }

    if (measurement + 1 < MEASUREMENTS_PER_CYCLE) {
      delay(MEASUREMENT_INTERVAL_MS);
    }
  }
}

void enterDeepSleep() {
  WiFi.disconnect(true);
  esp_deep_sleep_enable_gpio_wakeup(1ULL << VBUS_WAKE_PIN, ESP_GPIO_WAKEUP_GPIO_HIGH);
  esp_sleep_enable_timer_wakeup(SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("setup start");
  Serial.print("setup meta, millis=");
  Serial.print(millis());
  Serial.print(", reset_reason=");
  Serial.println(static_cast<int>(esp_reset_reason()));

#if !PLANTY_DIAG_LATE_WIRE_ANALOG
  Wire.begin();
  Serial.println("Wire ok");
  analogReadResolution(12);
#endif

  deviceId = makeDeviceId();
  preferences.begin("planty", false);
  bool provisioned = preferences.getBool("provisioned", false);
  Serial.print("preferences ok, provisioned=");
  Serial.println(provisioned ? "true" : "false");

  if (!provisioned) {
    // TODO Serie: BLE-Verbindung muss verschlüsselt/authentifiziert sein (Proof-of-Possession)
    startProvisioning();
    return;
  }

#if PLANTY_DIAG_LATE_WIRE_ANALOG
  Wire.begin();
  Serial.println("Wire ok");
  analogReadResolution(12);
#endif

  runMeasurementCycle();
  enterDeepSleep();
}

void loop() {
  if (!preferences.getBool("provisioned", false)) {
    provisioningCompleted = handleProvisioning();
    if (provisioningCompleted) {
      runMeasurementCycle();
      enterDeepSleep();
    }
    delay(20);
  }
}
