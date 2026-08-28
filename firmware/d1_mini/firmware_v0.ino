#include <Arduino.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_mac.h>
#include <esp_system.h>

constexpr uint32_t WIFI_TIMEOUT_MS = 20000;
constexpr uint32_t WIFI_LOG_INTERVAL_MS = 10000;

constexpr char PROVISIONING_SERVICE_UUID[] = "7b7f0001-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char DEVICE_ID_UUID[] = "7b7f0002-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char WIFI_CREDENTIALS_UUID[] = "7b7f0003-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char PROVISIONING_STATUS_UUID[] = "7b7f0004-4e6d-4a5d-9b8e-2f2d6a0c1101";

Preferences preferences;
NimBLECharacteristic* statusCharacteristic = nullptr;
String deviceId;
String pendingCredentials;
volatile bool credentialsPending = false;
uint32_t lastWiFiLogAt = 0;

class CredentialsCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* characteristic, NimBLEConnInfo&) override {
    std::string value = characteristic->getValue();
    Serial.print("credentials write received, length=");
    Serial.println(value.length());
    if (value.length() == 0 || value.length() > 512) {
      Serial.println("credentials rejected: invalid length");
      return;
    }

    pendingCredentials = value.c_str();
    credentialsPending = true;
    Serial.println("credentials queued");
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
  Serial.print("provisioning status: ");
  Serial.println(status);
  if (statusCharacteristic == nullptr) {
    return;
  }

  statusCharacteristic->setValue(status);
  statusCharacteristic->notify();
}

void startProvisioning() {
  Serial.println("startProvisioning enter");
    NimBLEDevice::init(("Planty-" + deviceId).c_str());
  Serial.println("BLE init ok");
    Serial.print("free_heap_after_ble_init=");
    Serial.println(ESP.getFreeHeap());
    NimBLEServer* server = NimBLEDevice::createServer();
    NimBLEService* service = server->createService(PROVISIONING_SERVICE_UUID);

    NimBLECharacteristic* deviceCharacteristic = service->createCharacteristic(
      DEVICE_ID_UUID, NIMBLE_PROPERTY::READ);
  deviceCharacteristic->setValue(deviceId.c_str());

    NimBLECharacteristic* credentialsCharacteristic = service->createCharacteristic(
      WIFI_CREDENTIALS_UUID, NIMBLE_PROPERTY::WRITE);
  credentialsCharacteristic->setCallbacks(new CredentialsCallbacks());

    statusCharacteristic = service->createCharacteristic(
      PROVISIONING_STATUS_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  statusCharacteristic->setValue("idle");

  service->start();
  Serial.println("service started");
  delay(300);

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData advData;
  advData.setFlags(0x06);
  advData.setCompleteServices(NimBLEUUID(PROVISIONING_SERVICE_UUID));
  advertising->setAdvertisementData(advData);

  NimBLEAdvertisementData scanResponseData;
  scanResponseData.setManufacturerData(deviceId.c_str());
  advertising->setScanResponseData(scanResponseData);

  // NimBLE uses 0.625 ms units: 1600 * 0.625 ms = 1000 ms.
  // TODO: Advertising-Intervall ggf. verkürzen nach Entkopplungs-Test
  // auf der Hardware-Seite
  advertising->setMinInterval(1600);
  advertising->setMaxInterval(1600);
  Serial.println("advertising parameters set");

  advertising->start();
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
  Serial.print("WiFi connection attempt, ssid=");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  uint32_t startedAt = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_TIMEOUT_MS) {
    delay(250);
  }

  bool connected = WiFi.status() == WL_CONNECTED;
  Serial.print("WiFi connection result: ");
  Serial.println(connected ? "connected" : "failed");
  if (connected) {
    Serial.print("WiFi IP: ");
    Serial.println(WiFi.localIP());
  }
  return connected;
}

bool connectFromStoredCredentials() {
  String ssid = preferences.getString("ssid");
  String password = preferences.getString("password");
  Serial.println("credentials found in NVS; starting WiFi-only boot path");
  bool connected = connectToWiFi(ssid, password);
  if (!connected) {
    Serial.println("stored WiFi credentials invalid; clearing NVS and restarting");
    preferences.remove("ssid");
    preferences.remove("password");
    delay(500);
    ESP.restart();
    return false;
  }

  preferences.putBool("provisioned", true);
  Serial.println("provisioning status: success");
  Serial.println("provisioning success, wifi connected");
  return true;
}

bool handleProvisioning() {
  if (!credentialsPending) {
    return false;
  }

  credentialsPending = false;
  String payload = pendingCredentials;
  String ssid;
  String password;
  if (!parseCredentials(payload, ssid, password)) {
    setProvisioningStatus("failed");
    return false;
  }

  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  // TODO: Fehlerfall-UX -- Nutzer erfährt vom Fehlschlag aktuell nur
  // durch Neustart des Geräts, kein persistenter "failed"-Status
  // TODO Serie: BLE-Verbindung muss verschlüsselt/authentifiziert sein (Proof-of-Possession)
  setProvisioningStatus("connecting");
  Serial.println("credentials stored; restarting before WiFi connect");
  delay(500);
  ESP.restart();
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("firmware_v0 setup start");
  Serial.print("reset_reason=");
  Serial.println(static_cast<int>(esp_reset_reason()));
  Serial.print("free_heap_after_boot=");
  Serial.println(ESP.getFreeHeap());

  deviceId = makeDeviceId();
  Serial.print("deviceId=");
  Serial.println(deviceId);

  preferences.begin("planty", false);
  bool provisioned = preferences.getBool("provisioned", false);
  Serial.print("provisioned=");
  Serial.println(provisioned ? "true" : "false");
  String storedSsid = preferences.getString("ssid");
  bool credentialsAvailable = storedSsid.length() > 0;
  Serial.print("credentials_in_nvs=");
  Serial.println(credentialsAvailable ? "true" : "false");

  if (!provisioned) {
    if (credentialsAvailable) {
      connectFromStoredCredentials();
      return;
    }

    // TODO Serie: BLE-Verbindung muss verschlüsselt/authentifiziert sein (Proof-of-Possession)
    startProvisioning();
    return;
  }

  connectToWiFi(preferences.getString("ssid"), preferences.getString("password"));
}

void loop() {
  if (!preferences.getBool("provisioned", false)) {
    handleProvisioning();
    delay(20);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected; retrying");
    connectToWiFi(preferences.getString("ssid"), preferences.getString("password"));
  }

  if (millis() - lastWiFiLogAt >= WIFI_LOG_INTERVAL_MS) {
    lastWiFiLogAt = millis();
    Serial.print("verbunden, IP: ");
    Serial.println(WiFi.localIP());
  }
  delay(20);
}

// TODO: Sensorik, Messzyklus und Deep Sleep folgen in v1
// TODO: Advertising-Intervall ggf. verkürzen nach Entkopplungs-Test (Kondensator) auf der Hardware-Seite