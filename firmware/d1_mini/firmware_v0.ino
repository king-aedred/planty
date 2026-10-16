#include <Arduino.h>
#include <HTTPClient.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <WiFi.h>
#include <esp_mac.h>
#include <esp_system.h>
#include <time.h>

constexpr uint32_t WIFI_TIMEOUT_MS = 20000;
constexpr uint32_t WIFI_LOG_INTERVAL_MS = 10000;
constexpr uint32_t HELLO_RETRY_INTERVAL_MS = 30000;
constexpr uint32_t NTP_TIMEOUT_MS = 10000;
constexpr char HELLO_URL[] = "https://dusty-shrimp-80.eu-west-1.convex.site/hello";
// TODO: In v1 replace periodic hello posts with the measurement cycle.

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
uint32_t lastHelloAttemptAt = 0;
volatile uint8_t lastWiFiDisconnectReason = 0;
volatile bool hasWiFiDisconnectReason = false;

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
  delay(200);
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
  String lastError = preferences.getString("last_error", "");
  statusCharacteristic->setValue(lastError.length() > 0 ? lastError.c_str() : "idle");
  Serial.print("initial provisioning status: ");
  Serial.println(lastError.length() > 0 ? lastError : "idle");

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

bool isIgnoredWiFiDisconnectReason(uint8_t reason);
bool isRetryableWiFiFailure(uint8_t reason);

bool connectToWiFi(const String& ssid, const String& password) {
  Serial.print("WiFi connection attempt, ssid=");
  Serial.println(ssid);
  lastWiFiDisconnectReason = 0;
  hasWiFiDisconnectReason = false;
  delay(200);
  WiFi.mode(WIFI_STA);
  delay(200);
  WiFi.setAutoReconnect(false);
  delay(200);

  bool connected = false;
  uint8_t attempts = 0;
  do {
    ++attempts;
    delay(200);
    WiFi.begin(ssid.c_str(), password.c_str());
    uint32_t startedAt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_TIMEOUT_MS) {
      delay(250);
    }

    connected = WiFi.status() == WL_CONNECTED;
    if (connected || attempts >= 2 || !isRetryableWiFiFailure(lastWiFiDisconnectReason)) {
      break;
    }

    Serial.println("retrying WiFi connection once for an authentication/AP failure");
    WiFi.disconnect(false);
    delay(100);
  } while (attempts < 2);

  Serial.print("WiFi connection result: ");
  Serial.println(connected ? "connected" : "failed");
  Serial.print("WiFi connection attempts: ");
  Serial.println(attempts);
  if (connected) {
    Serial.print("WiFi IP: ");
    Serial.println(WiFi.localIP());
  }
  return connected;
}

bool isIgnoredWiFiDisconnectReason(uint8_t reason) {
  return reason == WIFI_REASON_STA_LEAVING || reason == WIFI_REASON_ASSOC_LEAVE;
}

bool isRetryableWiFiFailure(uint8_t reason) {
  return reason == WIFI_REASON_NO_AP_FOUND ||
         reason == WIFI_REASON_AUTH_FAIL ||
         reason == WIFI_REASON_AUTH_EXPIRE ||
         reason == WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT;
}

const char* wifiErrorCode() {
  switch (lastWiFiDisconnectReason) {
    case WIFI_REASON_AUTH_FAIL:
    case WIFI_REASON_AUTH_EXPIRE:
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_HANDSHAKE_TIMEOUT:
      return "auth_failed";
    case WIFI_REASON_NO_AP_FOUND:
      return "ap_not_found";
    case WIFI_REASON_ASSOC_FAIL:
    case WIFI_REASON_CONNECTION_FAIL:
    case WIFI_REASON_BEACON_TIMEOUT:
      return "timeout";
    case 0:
      return "timeout";
    default:
      return "unknown";
  }
}

void persistWiFiError() {
  const char* errorCode = wifiErrorCode();
  Serial.print("WiFi failure reason code=");
  Serial.print(lastWiFiDisconnectReason);
  Serial.print(", error=");
  Serial.println(errorCode);
  preferences.putString("last_error", errorCode);
}

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event != ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    return;
  }

  uint8_t reason = info.wifi_sta_disconnected.reason;
  Serial.print("WiFi disconnected, reason code=");
  Serial.print(reason);
  Serial.print(" (");
  Serial.print(WiFi.STA.disconnectReasonName(static_cast<wifi_err_reason_t>(reason)));
  Serial.println(")");

  if (isIgnoredWiFiDisconnectReason(reason)) {
    Serial.println("WiFi disconnect reason ignored: self-induced cleanup");
    return;
  }

  if (!hasWiFiDisconnectReason) {
    lastWiFiDisconnectReason = reason;
    hasWiFiDisconnectReason = true;
    Serial.println("WiFi disconnect reason saved as first meaningful reason");
  }
}

String helloTimestamp() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  time_t now = time(nullptr);
  uint32_t startedAt = millis();
  while (now < 1700000000 && millis() - startedAt < NTP_TIMEOUT_MS) {
    delay(250);
    now = time(nullptr);
  }

  if (now >= 1700000000) {
    struct tm timeInfo = {};
    gmtime_r(&now, &timeInfo);
    char timestamp[25] = {};
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
    Serial.print("hello timestamp from NTP: ");
    Serial.println(timestamp);
    return String(timestamp);
  }

  Serial.println("NTP timeout; using millis() as hello timestamp fallback");
  return String("millis:") + millis();
}

bool sendHello() {
  Serial.println("sending hello");
  HTTPClient client;
  if (!client.begin(HELLO_URL)) {
    Serial.println("hello HTTP begin failed");
    return false;
  }

  client.addHeader("Content-Type", "application/json");
  String timestamp = helloTimestamp();
  String body = String("{\"device_id\":\"") + deviceId +
                String("\",\"timestamp\":\"") + timestamp + String("\"}");
  int responseCode = client.POST(body);
  String responseBody = client.getString();
  Serial.print("hello HTTP response code: ");
  Serial.println(responseCode);
  client.end();

  if (responseCode >= 200 && responseCode < 300 &&
      responseBody.indexOf("\"reset\":true") >= 0) {
    // TODO: Testfunktion. Wird später zur vollwertigen
    // "Sensor entfernen"-Funktion ausgebaut (siehe
    // docs/planty_projektbeschreibung.md).
    Serial.println("hello reset received; clearing planty NVS and restarting");
    preferences.clear();
    delay(500);
    ESP.restart();
    return true;
  }

  if (responseCode >= 200 && responseCode < 300) {
    Serial.println("hello sent successfully");
    return true;
  }

  Serial.println("hello POST failed; WiFi remains active");
  return false;
}

void trySendHello() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  uint32_t now = millis();
  if (lastHelloAttemptAt != 0 && now - lastHelloAttemptAt < HELLO_RETRY_INTERVAL_MS) {
    return;
  }

  lastHelloAttemptAt = now;
  sendHello();
}

bool connectFromStoredCredentials() {
  String ssid = preferences.getString("ssid");
  String password = preferences.getString("password");
  Serial.println("credentials found in NVS; starting WiFi-only boot path");
  bool connected = connectToWiFi(ssid, password);
  if (!connected) {
    persistWiFiError();
    Serial.println("stored WiFi credentials invalid; clearing credentials and restarting");
    preferences.remove("ssid");
    preferences.remove("password");
    delay(500);
    ESP.restart();
    return false;
  }

  preferences.putBool("provisioned", true);
  preferences.remove("last_error");
  Serial.println("provisioning status: success");
  Serial.println("provisioning success, wifi connected");
  trySendHello();
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
  WiFi.onEvent(onWiFiEvent, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
  bool provisioned = preferences.getBool("provisioned", false);
  Serial.print("provisioned=");
  Serial.println(provisioned ? "true" : "false");
  String storedSsid = preferences.getString("ssid");
  bool credentialsAvailable = storedSsid.length() > 0;
  Serial.print("credentials_in_nvs=");
  Serial.println(credentialsAvailable ? "true" : "false");
  String lastError = preferences.getString("last_error", "");
  Serial.print("last_error_in_nvs=");
  Serial.println(lastError.length() > 0 ? lastError : "none");

  // BEOBACHTUNG: reset_reason=9 (Brownout) tritt reproduzierbar beim ERSTEN
  // WLAN-Verbindungsversuch nach dem Neustart auf, auch ohne angeschlossene
  // Batterie. Der zweite Versuch läuft durch. Offener Hardware-Punkt, siehe
  // Projektbeschreibung.

  if (!provisioned) {
    if (credentialsAvailable) {
      connectFromStoredCredentials();
      return;
    }

    // TODO Serie: BLE-Verbindung muss verschlüsselt/authentifiziert sein (Proof-of-Possession)
    startProvisioning();
    return;
  }

  if (connectToWiFi(preferences.getString("ssid"), preferences.getString("password"))) {
    trySendHello();
  }
}

void loop() {
  if (!preferences.getBool("provisioned", false)) {
    handleProvisioning();
    delay(20);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected; retrying");
    if (connectToWiFi(preferences.getString("ssid"), preferences.getString("password"))) {
      trySendHello();
    }
  }

  trySendHello();

  if (millis() - lastWiFiLogAt >= WIFI_LOG_INTERVAL_MS) {
    lastWiFiLogAt = millis();
    Serial.print("verbunden, IP: ");
    Serial.println(WiFi.localIP());
  }
  delay(20);
}

// TODO: Sensorik, Messzyklus und Deep Sleep folgen in v1
// TODO: Advertising-Intervall ggf. verkürzen nach Entkopplungs-Test (Kondensator) auf der Hardware-Seite