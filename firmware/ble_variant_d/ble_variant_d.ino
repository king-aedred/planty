#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Preferences.h>
#include <Wire.h>
#include <esp_system.h>

// Variant D: isolate which provisioning addition reintroduces brownouts.
// Set this between test flashes:
//   0 = base variant A
//   1 = add manufacturer data
//   2 = add wifi_credentials characteristic + write callback
//   3 = stage 3a: add provisioning_status characteristic without BLE2902
//   4 = stage 3b: add BLE2902 only to wifi_credentials characteristic
//   5 = add Wire.begin() + Preferences before BLE init
#ifndef BLE_VARIANT_D_STAGE
#define BLE_VARIANT_D_STAGE 0
#endif

// Stage 3a timing experiments:
//   0 = baseline behavior
//   1 = variant 1: pause after service->start(), before advertising
//   2 = variant 2: set status value after advertising start
#ifndef BLE_VARIANT_D_3A_VARIANT
#define BLE_VARIANT_D_3A_VARIANT 0
#endif

#ifndef BLE_VARIANT_D_3A_PRE_ADV_DELAY_MS
#define BLE_VARIANT_D_3A_PRE_ADV_DELAY_MS 300
#endif

constexpr char PROVISIONING_SERVICE_UUID[] = "7b7f0001-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char DEVICE_ID_UUID[] = "7b7f0002-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char WIFI_CREDENTIALS_UUID[] = "7b7f0003-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char PROVISIONING_STATUS_UUID[] = "7b7f0004-4e6d-4a5d-9b8e-2f2d6a0c1101";
constexpr char TEST_DEVICE_ID[] = "planty-ABCDEF";
constexpr char TEST_MANUFACTURER_DATA[] = "planty-ABCDEF";

Preferences preferences;
BLECharacteristic* statusCharacteristic = nullptr;

class LoggingCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    Serial.print("wifi_credentials onWrite len=");
    Serial.println(characteristic->getValue().length());
  }
};

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("setup start");
  Serial.print("setup meta, millis=");
  Serial.print(millis());
  Serial.print(", reset_reason=");
  Serial.println(static_cast<int>(esp_reset_reason()));

#if BLE_VARIANT_D_STAGE >= 5
  Wire.begin();
  Serial.println("Wire ok");
  preferences.begin("planty", false);
  Serial.println("preferences ok");
#endif

  BLEDevice::init("Planty-Variant-D");
  Serial.println("BLE init ok");

  BLEServer* server = BLEDevice::createServer();
  BLEService* service = server->createService(PROVISIONING_SERVICE_UUID);

  BLECharacteristic* deviceCharacteristic = service->createCharacteristic(
      DEVICE_ID_UUID, BLECharacteristic::PROPERTY_READ);
  deviceCharacteristic->setValue(TEST_DEVICE_ID);
  Serial.println("step 0 ok");

#if BLE_VARIANT_D_STAGE >= 2
  BLECharacteristic* credentialsCharacteristic = service->createCharacteristic(
      WIFI_CREDENTIALS_UUID, BLECharacteristic::PROPERTY_WRITE);
  credentialsCharacteristic->setCallbacks(new LoggingCallbacks());
  Serial.println("step 2 ok");
#endif

#if BLE_VARIANT_D_STAGE == 3
  statusCharacteristic = service->createCharacteristic(
      PROVISIONING_STATUS_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
#if BLE_VARIANT_D_3A_VARIANT != 2
  statusCharacteristic->setValue("idle");
#endif
  Serial.println("step 3a ok");
#endif

#if BLE_VARIANT_D_STAGE == 4
  credentialsCharacteristic->addDescriptor(new BLE2902());
  Serial.println("step 3b ok");
#endif

  service->start();

#if BLE_VARIANT_D_STAGE == 3 && BLE_VARIANT_D_3A_VARIANT == 1
  delay(BLE_VARIANT_D_3A_PRE_ADV_DELAY_MS);
  Serial.print("stage3a pre-adv delay ms=");
  Serial.println(BLE_VARIANT_D_3A_PRE_ADV_DELAY_MS);
#endif

  Serial.println("service started");

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->setScanResponse(true);
  advertising->setMinInterval(1600);
  advertising->setMaxInterval(1600);
  Serial.println("interval set");

#if BLE_VARIANT_D_STAGE >= 1
  // Byte budget: flags 3 B + complete 128-bit service UUID 18 B ~= 21 B in the
  // main advertising packet; manufacturer data moves to scan response and is
  // kept below the 31 B classic BLE limit there as well.
  BLEAdvertisementData advData;
  advData.setFlags(0x06);  // LE General Discoverable Mode, BR/EDR not supported
  advData.setCompleteServices(BLEUUID(PROVISIONING_SERVICE_UUID));
  advertising->setAdvertisementData(advData);

  BLEAdvertisementData scanResponseData;r
  scanResponseData.setManufacturerData(TEST_MANUFACTURER_DATA);
  advertising->setScanResponseData(scanResponseData);
  Serial.println("step 1 ok");
#else
  advertising->addServiceUUID(PROVISIONING_SERVICE_UUID);
#endif

  BLEDevice::startAdvertising();
  Serial.print("advertising started, millis=");
  Serial.println(millis());

#if BLE_VARIANT_D_STAGE == 3 && BLE_VARIANT_D_3A_VARIANT == 2
  delay(100);
  statusCharacteristic->setValue("idle");
  Serial.println("status value set post-advertising");
#endif

#if BLE_VARIANT_D_STAGE >= 5
  Serial.println("step 5 ok");
#endif
}

void loop() {
  delay(1000);
}
