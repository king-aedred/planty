# Planty ESP32-C3 BLE provisioning v0

`firmware_v0.ino` is an Arduino IDE sketch for the JLCPCB ESP32-C3-MINI-1 test
board. It contains only onboarding and WiFi provisioning: no sensor reads,
reading posts, measurement cycle, or deep sleep.

## Arduino dependencies

Validated versions:

- ESP32 Arduino Core: `3.3.11`
- NimBLE-Arduino: `2.5.1` from `h2zero/NimBLE-Arduino`

Install NimBLE-Arduino `2.5.1` through Arduino IDE's Library Manager (or
`arduino-cli lib install NimBLE-Arduino@2.5.1`) and install the Espressif `esp32`
board package.

NimBLE 2.x uses `NimBLEDevice.h`, `NIMBLE_PROPERTY::*`, and creates the 0x2902
notification descriptor automatically for characteristics with `NOTIFY`.

## BLE contract

The advertised name is `Planty-<device_id>` and the manufacturer data contains
the same stable ID derived from the ESP32 eFuse WiFi MAC. The custom service is:

- `7b7f0001-4e6d-4a5d-9b8e-2f2d6a0c1101`: provisioning service
- `7b7f0002-4e6d-4a5d-9b8e-2f2d6a0c1101`: `device_id`, read
- `7b7f0003-4e6d-4a5d-9b8e-2f2d6a0c1101`: `wifi_credentials`, write JSON
- `7b7f0004-4e6d-4a5d-9b8e-2f2d6a0c1101`: `provisioning_status`, read/notify

Write credentials as `{"ssid":"my-network","password":"my-password"}`.
The status values are `idle`, `connecting`, `success`, and `failed`.

Credentials are stored in NVS under the `planty` namespace. After credentials
are received, the device stores them and restarts. The next boot attempts WiFi
without initializing BLE. Only after a confirmed connection is
`provisioned=true` written. On failure, credentials are removed and the device
restarts into pairing mode. To reprovision a test device, erase its NVS before
the next boot.

Advertising uses a 1000 ms interval (`1600 * 0.625 ms`) and keeps service UUID
and flags in the main advertisement while placing the device ID manufacturer
data in the scan response.

This test implementation intentionally has no BLE authentication or encryption,
as required by the current BLE provisioning scope. It must not ship unchanged.
